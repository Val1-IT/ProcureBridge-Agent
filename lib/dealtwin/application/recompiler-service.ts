export { findSmallestAmendment, type AmendmentSearchResult, type AmendmentCandidate } from '../recompiler/recompile-deal';
export type { AmendmentPolicy } from '../recompiler/search-space';
import type { CommitmentPort } from './commitment-service';
import type { MutationContext, OperationResponse } from './operation-contracts';
import type { SelfReservationIdentity } from '../domain/commitment';
import type { AmendmentPolicy } from '../recompiler/search-space';
import { assertJudgeActor } from './judge-seed-service';
import { isSelfReservation } from '../domain/commitment';
import { prepareCommitmentProof } from '../proof/replay-proof';
import { buildSnapshot } from '../erp/build-snapshot';
import { findSmallestAmendment } from '../recompiler/recompile-deal';
import { canonicalizeDealTermsV1 } from '../domain/deal-terms';
import type { CanonicalJsonValue } from '../domain/canonical-json';

export class RecompilerService {
  constructor(private readonly port: CommitmentPort) {}
  async previewRecompile(context: MutationContext, input: { commitmentId: string; previous: SelfReservationIdentity }, policy: AmendmentPolicy): Promise<OperationResponse> {
    const error=(code:string,httpStatus=409):OperationResponse=>({ httpStatus,body:{ ok:false,error:{ code } } });
    try { assertJudgeActor(context); } catch { return error('FORBIDDEN_JUDGE_CONTEXT',403); }
    if (context.role!=='admin' && context.role!=='sales') return error('FORBIDDEN_ROLE',403);
    const text=(value:unknown)=>typeof value==='string' && /^[a-zA-Z0-9:_-]{1,128}$/.test(value);
    if (!text(input.commitmentId) || !text(input.previous.proofId) || !text(input.previous.dealVersionId)
      || !/^[0-9a-f]{64}$/.test(input.previous.canonicalEventHash) || !Number.isSafeInteger(context.expectedRevision) || context.expectedRevision<0) return error('INVALID_REQUEST',422);
    return this.port.transact(context,async (tx):Promise<OperationResponse>=>{
      if (tx.revision!==context.expectedRevision) return error('REVISION_CONFLICT');
      const row=await tx.getCommitment(input.commitmentId);
      if (!row) return error('COMMITMENT_NOT_FOUND',404);
      if (!isSelfReservation(row,input.previous)) return error('COMMITMENT_IDENTITY_MISMATCH',422);
      if (row.status!=='reserved' && row.status!=='committed') return error('RESERVATION_REQUIRED');
      const version=await tx.getVersion(row.dealVersionId); const stored=await tx.getProof(row.proofId);
      const deal=version ? await tx.getDeal(version.dealId) : null;
      if (!deal || !version || !stored || stored.proof.dealId!==deal.id || !isSelfReservation({ ...stored.proof,proofId:stored.proof.id },input.previous)) return error('PROOF_IDENTITY_MISMATCH',422);
      const prepared=prepareCommitmentProof(stored.proof); if (!prepared.ok) return error(prepared.error.code,422);
      const historical=prepared.value.compileInput;
      if (historical.snapshot.tenantId!==context.tenantId) return error('PROOF_IDENTITY_MISMATCH',422);
      const rows=await tx.listCommitments();
      const owners=[];
      for (const active of rows) {
        const activeVersion=await tx.getVersion(active.dealVersionId); if (!activeVersion) return error('INVALID_COMMITMENT',422);
        if (activeVersion.dealId===deal.id) owners.push(active);
      }
      if (owners.length!==1 || owners[0]!.id!==row.id || !isSelfReservation(owners[0]!,input.previous)) return error('SELF_RESERVATION_MISMATCH');
      const snapshot=buildSnapshot({ state:await tx.loadErp(),tenantId:context.tenantId,asOfDate:historical.snapshot.asOfDate,
        requestedHorizonEnd:historical.snapshot.requestedHorizonEnd,adapterVersion:stored.proof.adapterVersion,commitments:rows,self:input.previous });
      if (!snapshot.ok) return error(snapshot.error.code,422);
      if (row.accountId!==snapshot.value.cash.accountId) return error('SELF_RESERVATION_MISMATCH');
      const result=findSmallestAmendment({ ...historical,snapshot:snapshot.value,approvedApprovalCodes:[] },policy);
      if (result.outcome==='NO_FEASIBLE_AMENDMENT') return { httpStatus:200,body:{ ok:true,...result,revision:tx.revision } };
      // Preview deliberately writes neither versions, receipts, ledger rows nor ERP. Task 22 owns proposal persistence.
      return { httpStatus:200,body:{ ok:true,outcome:deal.committedSalesOrderId?'REMEDIATION_PENDING':'PROPOSED_AMENDMENT',revision:tx.revision,
        dealId:deal.id,previousCommitmentId:row.id,salesOrderId:deal.committedSalesOrderId,terms:canonicalizeDealTermsV1(result.candidate.terms) as unknown as CanonicalJsonValue,
        changedFields:[...result.candidate.changedFields],score:[...result.candidate.score],evaluatedCandidates:result.evaluatedCandidates,feasibleCandidates:result.feasibleCandidates,
        minimumProjectedBalanceRupiah:result.candidate.baseResult.timeline!.minimumProjectedBalance.toString() } };
    });
  }
}
