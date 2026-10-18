import type { ErpState } from '../../erp/types';
import { createSalesOrder } from '../../erp/commands/sales';
import { compileDeal } from '../compiler/compile-deal';
import { canonicalStringify, sha256Canonical, type CanonicalJsonValue } from '../domain/canonical-json';
import { hashCanonicalCashEvents, canonicalCashEventDto } from '../domain/canonical-event';
import type { DatedCashEvent } from '../domain/cash-event';
import { isSelfReservation, type LiquidityCommitment } from '../domain/commitment';
import type { Deal, DealVersion } from '../domain/deal';
import { canCommitProof, canReserveProof, type DealProof, type ProofStatus } from '../domain/proof';
import type { Result } from '../domain/result';
import { buildSnapshot, type CanonicalErpSnapshot } from '../erp/build-snapshot';
import { dependencyKey, type DependencyChange } from '../erp/dependency-manifest';
import { QUERY_ACTIVE_COMMITMENTS_KEY } from '../erp/dependency-keys';
import { toLegacySalesOrderInput } from '../erp/legacy-sales-order-bridge';
import { prepareCommitmentProof } from '../proof/replay-proof';
import type { DealProofDto } from '../proof/proof-dto';
import { assertJudgeActor } from './judge-seed-service';
import type { ApprovalRecord, OperationReceiptRepository } from './ports';
import type { MutationContext, OperationResponse, CommitmentCommandInput } from './operation-contracts';
import { COMMIT_ACTION, RESERVE_ACTION, commitmentReceipt, commitmentRequestHash, type CommitmentTarget } from './audit-events';
import { runCommitmentLifecycle, type LifecycleCommitment, type LifecycleWrite } from './commitment-lifecycle';
import type { SelfReservationIdentity } from '../domain/commitment';
import { runStressLab } from '../stress/run-stress-lab';
import { decodeStressScenario, encodeStressScenario, type StressScenario } from '../stress/stress-transform';
import type { RecordedStressRun } from '../proof/build-proof';

export function validateCommitmentApproval(proof: DealProof, operation: 'reserve' | 'commit'): Result<true> {
  return operation === 'reserve' ? canReserveProof(proof) : canCommitProof(proof);
}
export interface StoredCommitment extends LiquidityCommitment {
  readonly accountId: string;
  readonly events: readonly DatedCashEvent[];
}
export interface CommitmentWrite {
  readonly id: string; readonly input: CommitmentTarget; readonly accountId: string;
  readonly events: readonly CanonicalJsonValue[]; readonly amountRupiah: string; readonly direction: 'inflow' | 'outflow';
}
export interface CommitmentTransaction {
  readonly revision: number;
  readonly receipts: OperationReceiptRepository;
  getProof(id: string): Promise<{ proof: DealProofDto; status: ProofStatus } | null>;
  getDeal(id: string): Promise<Deal | null>;
  getVersion(id: string): Promise<DealVersion | null>;
  loadErp(): Promise<ErpState>;
  listCommitments(): Promise<readonly StoredCommitment[]>;
  getCommitment(id: string): Promise<LifecycleCommitment | null>;
  transitionCommitment(write: LifecycleWrite): Promise<LifecycleCommitment>;
  listApprovals(input: CommitmentTarget): Promise<readonly ApprovalRecord[]>;
  markStale(input: CommitmentTarget, keys: readonly string[]): Promise<void>;
  conflict(input: CommitmentTarget, detail: Readonly<Record<string,string | number | boolean | null>>): Promise<void>;
  insertReservation(write: CommitmentWrite): Promise<void>;
  promote(id: string, input: CommitmentTarget): Promise<void>;
  saveDeal(deal: Deal, priorStatus: Deal['status']): Promise<void>;
  saveErp(state: ErpState): Promise<void>;
  advanceRevision(): Promise<number>;
  invalidate(change: DependencyChange, self: CommitmentTarget): Promise<readonly string[]>;
}
export interface CommitmentPort {
  transact<T>(context: MutationContext, work: (tx: CommitmentTransaction) => Promise<T>): Promise<T>;
}
function error(code: string, status = 409, detail: Record<string,CanonicalJsonValue> = {}): OperationResponse {
  return { httpStatus: status, body: { ok:false, error:{ code }, ...detail } };
}
function changes(before: CanonicalErpSnapshot, after: CanonicalErpSnapshot): DependencyChange['changes'] {
  const a = new Map(before.dependencyManifest.entries.map(e=>[e.key,e.contentHash]));
  const b = new Map(after.dependencyManifest.entries.map(e=>[e.key,e.contentHash]));
  return [...new Set([...a.keys(),...b.keys()])].sort().filter(key=>a.get(key)!==b.get(key))
    .map(key=>({ key:dependencyKey(key),beforeHash:a.get(key)??null,afterHash:b.get(key)??null }));
}
function capacityKey(key: string): boolean { return key===QUERY_ACTIVE_COMMITMENTS_KEY || key.startsWith('dealtwin.commitment:'); }

export class CommitmentService {
  private readonly requiredReplacementStress: readonly StressScenario[];
  constructor(private readonly port: CommitmentPort, requiredReplacementStress: readonly StressScenario[] = []) {
    this.requiredReplacementStress=structuredClone(requiredReplacementStress);
  }
  replaceReservation(context: MutationContext, input: { commitmentId: string; previous: SelfReservationIdentity; replacement: SelfReservationIdentity }): Promise<OperationResponse> {
    return this.operate('reserve',context,input.replacement,{ commitmentId:input.commitmentId,previous:input.previous });
  }
  releaseCommitment(context: MutationContext, input: CommitmentCommandInput): Promise<OperationResponse> { return runCommitmentLifecycle(this.port,context,input,'release'); }
  expireCommitment(context: MutationContext, input: CommitmentCommandInput): Promise<OperationResponse> { return runCommitmentLifecycle(this.port,context,input,'expire'); }
  cancelCommitment(context: MutationContext, input: CommitmentCommandInput): Promise<OperationResponse> { return runCommitmentLifecycle(this.port,context,input,'cancel'); }
  reserveLiquidity(context: MutationContext, input: CommitmentTarget): Promise<OperationResponse> { return this.operate('reserve',context,input); }
  commitDeal(context: MutationContext, input: CommitmentTarget): Promise<OperationResponse> { return this.operate('commit',context,input); }
  private async operate(operation: 'reserve' | 'commit', context: MutationContext, input: CommitmentTarget,
    replacement?: { commitmentId: string; previous: SelfReservationIdentity }): Promise<OperationResponse> {
    try { assertJudgeActor(context); } catch { return error('FORBIDDEN_JUDGE_CONTEXT',403); }
    if (context.role!=='admin' && context.role!=='sales') return error('FORBIDDEN_ROLE',403);
    const text = (value: unknown): value is string => typeof value==='string' && /^[a-zA-Z0-9:_-]{1,128}$/.test(value);
    if (!text(context.idempotencyKey) || !Number.isSafeInteger(context.expectedRevision) || context.expectedRevision<0 || context.expectedRevision>=Number.MAX_SAFE_INTEGER
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(context.now) || !Number.isFinite(Date.parse(context.now))
      || !text(input.proofId) || !text(input.dealVersionId) || (input.dealId!==undefined && !text(input.dealId)) || !/^[0-9a-f]{64}$/.test(input.canonicalEventHash)) return error('INVALID_REQUEST',422);
    if (replacement && (!text(replacement.commitmentId) || !text(replacement.previous.proofId) || !text(replacement.previous.dealVersionId)
      || !/^[0-9a-f]{64}$/.test(replacement.previous.canonicalEventHash))) return error('INVALID_REQUEST',422);
    const action = operation==='reserve'?RESERVE_ACTION:COMMIT_ACTION;
    const hash = replacement ? sha256Canonical({ action,operation:'replace',expectedRevision:context.expectedRevision,
      commitmentId:replacement.commitmentId,previous:{ proofId:replacement.previous.proofId,dealVersionId:replacement.previous.dealVersionId,canonicalEventHash:replacement.previous.canonicalEventHash },
      replacement:{ proofId:input.proofId,dealVersionId:input.dealVersionId,canonicalEventHash:input.canonicalEventHash } }) : commitmentRequestHash(action,context,input);
    return this.port.transact(context,async tx=>{
      const receipt=await tx.receipts.findSuccess(context.tenantId,action,context.idempotencyKey);
      if (receipt) {
        if (receipt.actorId!==context.actorId) return error('FORBIDDEN_ROLE',403);
        if (receipt.requestHash!==hash) return error('IDEMPOTENCY_KEY_REUSED');
        return JSON.parse(receipt.responseJson) as OperationResponse;
      }
      if (tx.revision!==context.expectedRevision) return error('REVISION_CONFLICT');
      const previous = replacement ? await tx.getCommitment(replacement.commitmentId) : null;
      if (replacement) {
        if (!previous) return error('COMMITMENT_NOT_FOUND',404);
        if (!isSelfReservation(previous,replacement.previous)) return error('COMMITMENT_IDENTITY_MISMATCH',422);
        const previousVersion=await tx.getVersion(previous.dealVersionId);
        const previousDeal=previousVersion ? await tx.getDeal(previousVersion.dealId) : null;
        if (!previousDeal) return error('COMMITMENT_IDENTITY_MISMATCH',422);
        if (previousDeal.committedSalesOrderId) return error('DEAL_ALREADY_COMMITTED');
        if (previous.status!=='reserved') return error('RESERVATION_REQUIRED');
        const previousProof=await tx.getProof(previous.proofId);
        if (!previousProof || previousProof.proof.dealId!==previousDeal.id
          || !isSelfReservation({ ...previousProof.proof,proofId:previousProof.proof.id },replacement.previous)) return error('PROOF_IDENTITY_MISMATCH',422);
        const historicalOwner=prepareCommitmentProof(previousProof.proof);
        if (!historicalOwner.ok) return error(historicalOwner.error.code,422);
        if (historicalOwner.value.compileInput.snapshot.tenantId!==context.tenantId) return error('PROOF_IDENTITY_MISMATCH',422);
      }
      const stored=await tx.getProof(input.proofId);
      if (!stored) return error('PROOF_NOT_FOUND',404);
      const { proof }=stored;
      if (proof.dealVersionId!==input.dealVersionId || proof.canonicalEventHash!==input.canonicalEventHash || (input.dealId && proof.dealId!==input.dealId)) return error('PROOF_IDENTITY_MISMATCH',422);
      const deal=await tx.getDeal(proof.dealId); const version=await tx.getVersion(input.dealVersionId);
      if (!deal || !version || version.dealId!==deal.id || deal.currentVersionId!==version.id || canonicalStringify(version.terms as unknown as CanonicalJsonValue)!==canonicalStringify(proof.terms)) return error('PROOF_IDENTITY_MISMATCH',422);
      if (deal.committedSalesOrderId) return error('DEAL_ALREADY_COMMITTED');
      if (previous) {
        const previousVersion=await tx.getVersion(previous.dealVersionId);
        if (!previousVersion || previousVersion.dealId!==deal.id || version.version<=previousVersion.version || version.id===previousVersion.id) return error('PROOF_IDENTITY_MISMATCH',422);
      }
      if (stored.status==='INVALID') return error('PROOF_NOT_CURRENT');
      const prepared=prepareCommitmentProof(proof);
      if (!prepared.ok) return error(prepared.error.code,422);
      const historical=prepared.value.compileInput;
      if (historical.snapshot.tenantId!==context.tenantId) return error('PROOF_IDENTITY_MISMATCH',422);
      const requiredCodes=historical.constraints.constraints.filter(c=>c.kind==='required_approval').map(c=>c.value.approvalCode);
      // Legacy kind-only snapshots never prove coverage of several independent requirements.
      // New snapshots explicitly bind one immutable approval identity/kind/code per requirement.
      const bindings=prepared.value.approvals.map(row=>row.requirementCode);
      const explicitlyBound=bindings.length===requiredCodes.length&&bindings.every(code=>code!==undefined&&requiredCodes.includes(code))&&new Set(bindings).size===bindings.length;
      if ((requiredCodes.length>1||bindings.some(code=>code!==undefined))&&!explicitlyBound) return error('UNSUPPORTED_APPROVAL_BINDING',422);
      const rows=await tx.listCommitments();
      const ownerRows=[];
      for (const row of rows) {
        const rowVersion=await tx.getVersion(row.dealVersionId);
        if (!rowVersion) return error('INVALID_COMMITMENT',422);
        if (rowVersion.dealId===deal.id) ownerRows.push(row);
      }
      const selfIdentity=replacement?.previous??input;
      if (ownerRows.length>1 || ownerRows.some(row=>!isSelfReservation(row,selfIdentity))
        || (replacement && (ownerRows.length!==1 || ownerRows[0]!.id!==replacement.commitmentId))) return error('SELF_RESERVATION_MISMATCH');
      const self=ownerRows[0];
      const erp=await tx.loadErp();
      const snapshot=buildSnapshot({ state:erp,tenantId:context.tenantId,asOfDate:historical.snapshot.asOfDate,
        requestedHorizonEnd:historical.snapshot.requestedHorizonEnd,adapterVersion:proof.adapterVersion,commitments:rows,self:selfIdentity });
      if (!snapshot.ok) return error(snapshot.error.code,422);
      if (self && self.accountId!==snapshot.value.cash.accountId) return error('SELF_RESERVATION_MISMATCH');
      const delta=changes(historical.snapshot,snapshot.value);
      // ERP/material staleness never authorizes a mutation. Capacity-only changes can also explain the collision.
      if (delta.length>0 || stored.status==='STALE') {
        await tx.markStale(input,delta.map(e=>e.key));
        if (delta.length>0 && delta.every(e=>capacityKey(e.key))) {
          const diagnostic=compileDeal({ ...historical,snapshot:snapshot.value });
          if (diagnostic.outcome==='DOES_NOT_COMPILE' && diagnostic.conflictingCommitmentIds.length>0) {
            const detail={ shortfallRupiah:diagnostic.shortfallRupiah?.toString()??null,firstViolationDate:diagnostic.firstViolationDate,
              conflictingCommitmentIdsJson:canonicalStringify(diagnostic.conflictingCommitmentIds), proofStatus:'STALE' };
            await tx.conflict(input,detail);
            return error('LIQUIDITY_COLLISION',409,{ ...detail,conflictingCommitmentIds:[...diagnostic.conflictingCommitmentIds] });
          }
        }
        return error('PROOF_STALE',409,{ changedDependencyKeys:delta.map(e=>e.key) });
      }
      if (operation==='reserve' && self && !replacement) return error('ALREADY_RESERVED');
      if (operation==='commit' && (!self || self.status!=='reserved' || deal.status!=='RESERVED')) return error('RESERVATION_REQUIRED');
      if (operation==='reserve' && deal.status!=='PROOF_GENERATED') return error('INVALID_DEAL_STATE');
      const currentApprovals=await tx.listApprovals(input);
      const historicalApprovals=prepared.value.approvals;
      if (currentApprovals.length!==historicalApprovals.length || historicalApprovals.some(a=>!currentApprovals.some(b=>a.id===b.id && a.kind===b.kind && a.requirementCode===b.requirementCode && b.proofId===proof.id && b.dealVersionId===version.id))) return error('APPROVAL_IDENTITY_MISMATCH',422);
      if (requiredCodes.length>0 && currentApprovals.length===0) return error('APPROVAL_REQUIRED');
      const gate=validateCommitmentApproval({ id:proof.id,dealId:proof.dealId,dealVersionId:proof.dealVersionId,status:stored.status,
        canonicalEventHash:proof.canonicalEventHash,approvals:currentApprovals },operation);
      if (!gate.ok) return error(gate.error.code);
      const codes=currentApprovals.every(a=>a.status==='approved')?requiredCodes:[];
      const result=compileDeal({ ...historical,snapshot:snapshot.value,approvedApprovalCodes:codes });
      if (result.outcome!=='COMPILES' && !(operation==='reserve' && result.outcome==='CONDITIONALLY_VALID')) {
        if (result.conflictingCommitmentIds.length>0) {
          const detail={ shortfallRupiah:result.shortfallRupiah?.toString()??null,firstViolationDate:result.firstViolationDate };
          await tx.conflict(input,detail); return error('LIQUIDITY_COLLISION',409,detail);
        }
        return error(result.reasonCode??'DOES_NOT_COMPILE');
      }
      // Requirements belong to server policy, not request payload or optional diagnostic runs.
      // Each required scenario must also be present in genuinely replayed historical evidence.
      if (replacement) {
        const recorded=proof.stressRuns as unknown as readonly RecordedStressRun[]; // prepareCommitmentProof already replayed/validated this DTO.
        const scenarios=recorded.filter(run=>run.transformType==='dealtwin.named-stress.v1').map(run=>decodeStressScenario(run.parameters));
        if (this.requiredReplacementStress.some(required=>!scenarios.some(scenario=>canonicalStringify(encodeStressScenario(required))===canonicalStringify(encodeStressScenario(scenario))))) return error('REQUIRED_STRESS_EVIDENCE_MISSING',422);
        const runs=runStressLab({ ...historical,snapshot:snapshot.value,approvedApprovalCodes:codes },this.requiredReplacementStress);
        if (runs.some(run=>run.result.outcome!=='COMPILES' && run.result.outcome!=='CONDITIONALLY_VALID')) return error('REQUIRED_STRESS_FAILED');
      }
      const events=result.timeline!.events.filter(e=>e.dependencyKey.startsWith('deal:event:'));
      if (hashCanonicalCashEvents(events)!==input.canonicalEventHash) return error('COMMITMENT_HASH_MISMATCH',422);
      const id=(!replacement?self?.id:null)??`commitment:${sha256Canonical({ tenantId:context.tenantId,proofId:proof.id,dealVersionId:version.id,canonicalEventHash:input.canonicalEventHash })}`;
      let salesOrderId: string | null=null;
      let nextErp: ErpState | null=null;
      if (operation==='commit') {
        const legacy=toLegacySalesOrderInput(historical.terms);
        if (!legacy.ok) return error(legacy.error.code,422);
        const order=createSalesOrder(erp,context.role,legacy.value,context.now);
        if (!order.ok) return error(order.error.code,422);
        salesOrderId=order.value.id; nextErp=order.state;
        if (nextErp.revision!==tx.revision+1) throw new Error('Sales Order revision contract violated');
        await tx.promote(id,input);
        await tx.saveErp(nextErp);
      } else {
        if (replacement && previous) await tx.transitionCommitment({ commitment:previous,input:{ commitmentId:previous.id,...replacement.previous },
          operation:'cancel',status:'cancelled',allowedStatuses:['reserved'] });
        const outflow = events.filter(e=>e.direction==='outflow').reduce((sum,e)=>sum+e.amountRupiah,0n);
        const direction = outflow>0n?'outflow':'inflow';
        const amount = outflow>0n?outflow:events.filter(e=>e.direction==='inflow').reduce((sum,e)=>sum+e.amountRupiah,0n);
        await tx.insertReservation({ id,input,accountId:snapshot.value.cash.accountId,events:events.map(canonicalCashEventDto),
          amountRupiah:amount.toString(),direction });
      }
      await tx.saveDeal({ ...deal,status:operation==='reserve'?'RESERVED':'COMMITTED',committedSalesOrderId:salesOrderId },deal.status);
      const revision=nextErp?.revision??await tx.advanceRevision();
      const after=buildSnapshot({ state:nextErp??{ ...erp,revision },tenantId:context.tenantId,asOfDate:historical.snapshot.asOfDate,
        requestedHorizonEnd:historical.snapshot.requestedHorizonEnd,adapterVersion:proof.adapterVersion,commitments:await tx.listCommitments(),self:null });
      if (!after.ok) throw new Error(`Invalid committed capacity: ${after.error.code}`);
      const beforeAll=buildSnapshot({ state:erp,tenantId:context.tenantId,asOfDate:historical.snapshot.asOfDate,
        requestedHorizonEnd:historical.snapshot.requestedHorizonEnd,adapterVersion:proof.adapterVersion,commitments:rows,self:null });
      if (!beforeAll.ok) throw new Error('Invalid prior capacity');
      const changed=changes(beforeAll.value,after.value);
      await tx.invalidate({ tenantId:context.tenantId,priorRevision:tx.revision,currentRevision:revision,changes:changed,self:input,
        selfCapacityKeys:changed.filter(e=>capacityKey(e.key)).map(e=>e.key) },input);
      const response: OperationResponse={ httpStatus:200,body:{ ok:true,action,dealId:deal.id,proofId:proof.id,dealVersionId:version.id,
        canonicalEventHash:input.canonicalEventHash,commitmentId:id,status:operation==='reserve'?'reserved':'committed',salesOrderId,revision,
        minimumProjectedBalanceRupiah:result.timeline!.minimumProjectedBalance.toString(),
        ...(replacement ? { operation:'replace',previousCommitmentId:replacement.commitmentId } : {}) } };
      const success=commitmentReceipt(context,action,input,response,revision,deal.id,id,salesOrderId);
      await tx.receipts.appendSuccess(replacement ? { ...success,requestHash:hash,
        detail:{ ...success.detail,operation:'replace',previousCommitmentId:replacement.commitmentId,previousProofId:replacement.previous.proofId,
          previousDealVersionId:replacement.previous.dealVersionId,previousCanonicalEventHash:replacement.previous.canonicalEventHash,priorStatus:'reserved',retiredStatus:'cancelled' } } : success);
      return response;
    });
  }
}
