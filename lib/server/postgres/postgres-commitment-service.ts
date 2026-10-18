import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { CommitmentService, type CommitmentPort, type StoredCommitment } from '../../dealtwin/application/commitment-service';
import { ProofInvalidationService } from '../../dealtwin/application/proof-invalidation-service';
import { RecompilerService } from '../../dealtwin/application/recompiler-service';
import { createJudgeAmendmentPolicy } from '../../dealtwin/judge/amendment-policy';
import type { MutationContext } from '../../dealtwin/application/operation-contracts';
import type { CommitmentTarget } from '../../dealtwin/application/audit-events';
import { canonicalStringify } from '../../dealtwin/domain/canonical-json';
import { isoDate } from '../../dealtwin/domain/date';
import { parseRupiah } from '../../dealtwin/domain/money';
import type { DatedCashEvent } from '../../dealtwin/domain/cash-event';
import type { ProofStatus } from '../../dealtwin/domain/proof';
import { findSuccessReceipt, appendOperationReceipt } from './idempotency-audit-store';
import { PostgresDealTwinRepository, bindTransactionRepositories } from './postgres-dealtwin-repository';
import { loadErpWorkspace, saveErpWorkspace } from './postgres-erp-repository';
import { lockTenantWorkspace, bumpWorkspaceRevision } from './proof-invalidation';
import { withTransaction } from './transaction';
import { assertDatabaseRole } from './database-role';
import { PersistenceIntegrityError } from './errors';
import { decodeCommitment } from './dealtwin-mappers';
import type { LifecycleCommitment } from '../../dealtwin/application/commitment-lifecycle';

export function decodeEvents(value: unknown): readonly DatedCashEvent[] {
  if (!Array.isArray(value)) throw new PersistenceIntegrityError('Commitment events must be canonical DTOs.');
  return value.map(item=>{
    if (!item || typeof item!=='object' || typeof item.amountRupiah!=='string' || typeof item.date!=='string'
      || typeof item.eventId!=='string' || typeof item.dependencyKey!=='string' || typeof item.material!=='boolean') throw new PersistenceIntegrityError('Invalid commitment event DTO');
    return { ...item,date:isoDate(item.date),amountRupiah:parseRupiah(item.amountRupiah) } as DatedCashEvent;
  });
}
function decodeLifecycle(row: Record<string,unknown>): LifecycleCommitment {
  const decoded=decodeCommitment(row);
  if ((row.deadline!==null && typeof row.deadline!=='string') || typeof row.expiry_due!=='boolean') throw new PersistenceIntegrityError('Invalid lifecycle deadline evidence');
  return { id:decoded.id,proofId:decoded.proofId,dealVersionId:decoded.dealVersionId,canonicalEventHash:decoded.canonicalEventHash,
    status:decoded.status,accountId:decoded.accountId,events:decodeEvents(decoded.canonicalEvents),expiresAt:row.deadline,expiryDue:row.expiry_due };
}
async function appendEvidence(tx: PoolClient, context: MutationContext, action: string, input: CommitmentTarget,
  detail: Readonly<Record<string,string | number | boolean | null>>): Promise<void> {
  await tx.query(`insert into public.erp_audit_events (tenant_id,id,entity_type,entity_id,action,actor_role,actor_id,detail,created_at,updated_at)
    values($1,$2,'dealtwin_proof',$3,$4,$5,$6,$7::jsonb,$8,$8)`,[context.tenantId,`dealtwin.evidence:${randomUUID()}`,input.proofId,action,context.role,context.actorId,
      JSON.stringify({ ...detail,schemaVersion:'dealtwin.audit.v1',tenantId:context.tenantId,proofId:input.proofId,dealVersionId:input.dealVersionId,
        canonicalEventHash:input.canonicalEventHash,idempotencyKey:context.idempotencyKey,priorRevision:context.expectedRevision,currentRevision:context.expectedRevision,operationSucceeded:false }),context.now]);
}
export function createPostgresCommitmentPort(pool: Pool): CommitmentPort {
  const port: CommitmentPort={
    async transact(context,work) {
      return withTransaction(pool,context.tenantId,async tx=>{
        // Lock is the first tenant data access. Receipt reads happen next in the service, before revision checks.
        const revision=await lockTenantWorkspace(tx,context.tenantId);
        await assertDatabaseRole(tx,'dealtwin_app');
        const repo=new PostgresDealTwinRepository(tx,context.tenantId);
        const tenant=context.tenantId;
        return work({ revision,
          receipts:{
            findSuccess:async (receiptTenant,action,key)=>{
              if (receiptTenant!==tenant) throw new PersistenceIntegrityError('Foreign receipt tenant');
              return findSuccessReceipt(tx,tenant,action,key);
            },
            appendSuccess:async receipt=>{
              if (receipt.tenantId!==tenant) throw new PersistenceIntegrityError('Foreign receipt tenant');
              await appendOperationReceipt(tx,receipt); // No second revision increment.
            },
          },
          getProof:async id=>{
            const row=(await tx.query<{ status:ProofStatus }>('select status from public.dealtwin_proofs where tenant_id=$1 and id=$2',[tenant,id])).rows[0];
            if (!row) return null;
            const proof=await repo.getProof(id);
            if (!proof) throw new PersistenceIntegrityError('Missing proof after status read');
            return { proof,status:row.status };
          },
          getDeal:id=>repo.getDeal(id),getVersion:id=>repo.getDealVersion(id),loadErp:()=>loadErpWorkspace(tx,tenant),
          listCommitments:async ()=> (await repo.listActiveCommitments()).map((row): StoredCommitment=>({ id:row.id,proofId:row.proofId,
            dealVersionId:row.dealVersionId,canonicalEventHash:row.canonicalEventHash,status:row.status,accountId:row.accountId,events:decodeEvents(row.canonicalEvents) })),
          getCommitment:async id=>{
            const row=(await tx.query(`select *,
              to_char(expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as deadline,
              coalesce(expires_at <= $3::timestamptz,false) as expiry_due
              from public.dealtwin_liquidity_commitments where tenant_id=$1 and id=$2`,[tenant,id,context.now])).rows[0];
            if (!row) return null;
            return decodeLifecycle(row);
          },
          transitionCommitment:async write=>{
            const release=write.operation==='release';
            const evidence=canonicalStringify({ schemaVersion:'dealtwin.release.v1',actorId:context.actorId,actorRole:context.role,
              proofId:write.input.proofId,dealVersionId:write.input.dealVersionId,canonicalEventHash:write.input.canonicalEventHash,
              priorStatus:write.commitment.status,idempotencyKey:context.idempotencyKey,priorRevision:revision,currentRevision:revision+1 });
            const result=await tx.query(`update public.dealtwin_liquidity_commitments set status=$6,updated_at=$7
              ${release?',release_idempotency_key=$11,released_at=$7,release_evidence=$12::jsonb':''}
              where tenant_id=$1 and id=$2 and proof_id=$3 and deal_version_id=$4 and canonical_event_hash=$5
                and status=$8 and status=any($9::text[])
                and ($10::boolean=false or (expires_at is not null and expires_at <= $7::timestamptz)) returning *,
                to_char(expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as deadline,
                coalesce(expires_at <= $7::timestamptz,false) as expiry_due`,
              [tenant,write.input.commitmentId,write.input.proofId,write.input.dealVersionId,write.input.canonicalEventHash,write.status,
                context.now,write.commitment.status,write.allowedStatuses,write.operation==='expire',...(release?[context.idempotencyKey,evidence]:[])]);
            if (result.rowCount!==1 || result.rows.length!==1) throw new PersistenceIntegrityError('Commitment lifecycle must affect exactly one authorized tuple');
            return decodeLifecycle(result.rows[0]);
          },
          listApprovals:input=>repo.listApprovalsByProofVersion(input.proofId,input.dealVersionId),
          markStale:async (input,keys)=>{
            const result=await tx.query(`update public.dealtwin_proofs set status='STALE',stale_reason=$4,updated_at=$5
              where tenant_id=$1 and id=$2 and deal_version_id=$3 and status in ('VALID','CONDITIONALLY_VALID') returning id`,
              [tenant,input.proofId,input.dealVersionId,`dependency_change:${keys.join(',')}`,context.now]);
            if (result.rows.length===1) await appendEvidence(tx,context,'dealtwin.proof.stale',input,{ changedKeysJson:canonicalStringify(keys) });
          },
          conflict:async (input,detail)=>appendEvidence(tx,context,'dealtwin.commitment.conflict',input,detail),
          insertReservation:async write=>repo.insertCommitment({ id:write.id,proofId:write.input.proofId,dealVersionId:write.input.dealVersionId,
            canonicalEventHash:write.input.canonicalEventHash,accountId:write.accountId,canonicalEvents:write.events,amountRupiah:write.amountRupiah,
            direction:write.direction,status:'reserved',reserveIdempotencyKey:context.idempotencyKey,createdAt:context.now,updatedAt:context.now }),
          promote:async (id,input)=>{
            const result=await tx.query(`update public.dealtwin_liquidity_commitments set status='committed',commit_idempotency_key=$6,updated_at=$7
              where tenant_id=$1 and id=$2 and proof_id=$3 and deal_version_id=$4 and canonical_event_hash=$5 and status='reserved' returning id`,
              [tenant,id,input.proofId,input.dealVersionId,input.canonicalEventHash,context.idempotencyKey,context.now]);
            if (result.rows.length!==1) throw new PersistenceIntegrityError('Commitment promotion must affect exactly one reserved tuple');
          },
          saveDeal:async (deal,priorStatus)=>{
            const result=await tx.query(`update public.dealtwin_deals set status=$4,committed_sales_order_id=$5,updated_at=$6
              where tenant_id=$1 and id=$2 and current_version_id=$3 and status=$7 and committed_sales_order_id is null returning id`,
              [tenant,deal.id,deal.currentVersionId,deal.status,deal.committedSalesOrderId,context.now,priorStatus]);
            if (result.rows.length!==1) throw new PersistenceIntegrityError('Deal transition must affect exactly one uncommitted current version');
          },
          saveErp:async state=>{ await saveErpWorkspace(tx,tenant,revision,state); },
          advanceRevision:()=>bumpWorkspaceRevision(tx,tenant,revision,context.now),
          invalidate:(change,self)=>new ProofInvalidationService().afterErpMutation(bindTransactionRepositories(tx,tenant), { ...change, self }),
        });
      });
    },
  };
  return port;
}
export function createPostgresCommitmentService(pool: Pool): CommitmentService {
  // Local Judge policy. Never obtained from a browser body; optional stress diagnostics are not requirements.
  return new CommitmentService(createPostgresCommitmentPort(pool),createJudgeAmendmentPolicy().requiredStressScenarios);
}
export function createPostgresRecompilerService(pool: Pool): RecompilerService { return new RecompilerService(createPostgresCommitmentPort(pool)); }
