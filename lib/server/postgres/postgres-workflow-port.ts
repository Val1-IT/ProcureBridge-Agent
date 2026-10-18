import type { Pool } from 'pg';
import type { WorkflowPort,WorkflowTransaction } from '../../dealtwin/application/workflow-port';
import { withTransaction } from './transaction';
import { lockTenantWorkspace,bumpWorkspaceRevision } from './proof-invalidation';
import { assertDatabaseRole } from './database-role';
import { PostgresDealTwinRepository } from './postgres-dealtwin-repository';
import { loadErpWorkspace,saveErpWorkspace } from './postgres-erp-repository';
import { appendOperationReceipt,findSuccessReceipt } from './idempotency-audit-store';
import { PersistenceIntegrityError } from './errors';
import { decodeEvents } from './postgres-commitment-service';
import { decodeConstraints } from '../../dealtwin/proof/replay-proof';
import { sha256Canonical,type CanonicalJsonValue } from '../../dealtwin/domain/canonical-json';
import { canonicalCashEventDto } from '../../dealtwin/domain/canonical-event';
import { encodeCompileInput,encodeCompileResult } from '../../dealtwin/proof/build-proof';
import { NAMED_STRESS_ENGINE_VERSION } from '../../dealtwin/proof/version';
export function createPostgresWorkflowPort(pool:Pool):WorkflowPort {
 return {async transact(context,work) {
  return withTransaction(pool,context.tenantId,async client=>{
   const revision=await lockTenantWorkspace(client,context.tenantId); await assertDatabaseRole(client,'dealtwin_app');
   const tenant=context.tenantId; const repo=new PostgresDealTwinRepository(client,tenant); let adopted=false;
   const one=(rows:readonly unknown[])=>{if(rows.length!==1)throw new PersistenceIntegrityError('Workflow transition must affect exactly one current aggregate');};
   const tx:WorkflowTransaction={
    revision,
    receipts:{findSuccess:async(t,a,k)=>{if(t!==tenant)throw new PersistenceIntegrityError('Foreign receipt tenant');return findSuccessReceipt(client,t,a,k);},
     appendSuccess:async row=>{if(row.tenantId!==tenant)throw new PersistenceIntegrityError('Foreign receipt tenant');await appendOperationReceipt(client,row);}},
    getDeal:id=>repo.getDeal(id),getVersion:id=>repo.getDealVersion(id),
    listDeals:async()=>{const rows=(await client.query('select id from public.dealtwin_deals where tenant_id=$1 order by id',[tenant])).rows;return Promise.all(rows.map(async row=>(await repo.getDeal(row.id))!));},
    listVersions:async dealId=>{const rows=(await client.query('select id from public.dealtwin_deal_versions where tenant_id=$1 and deal_id=$2 order by version',[tenant,dealId])).rows;return Promise.all(rows.map(async row=>(await repo.getDealVersion(row.id))!));},
    constraints:async versionId=>{
     const rows=(await client.query('select id,kind,operator,value,provenance,resolution,source_text from public.dealtwin_constraints where tenant_id=$1 and deal_version_id=$2 order by position',[tenant,versionId])).rows;
     const result=decodeConstraints(rows.map(({source_text,...row})=>({...row,sourceText:source_text??null})) as CanonicalJsonValue);
     if(!result.ok)throw new PersistenceIntegrityError(result.error.message); return result.value;
    },
    getProof:async id=>{const row=(await client.query('select status from public.dealtwin_proofs where tenant_id=$1 and id=$2',[tenant,id])).rows[0];return row?{proof:(await repo.getProof(id))!,status:row.status as string}:null;},
    proofs:async dealId=>{const rows=(await client.query('select id,status from public.dealtwin_proofs where tenant_id=$1 and deal_id=$2 order by generated_at,id',[tenant,dealId])).rows;return Promise.all(rows.map(async row=>({proof:(await repo.getProof(row.id))!,status:row.status as string})));},
    runs:async dealId=>(await client.query('select to_jsonb(r) row from public.dealtwin_compile_runs r join public.dealtwin_deal_versions v on v.tenant_id=r.tenant_id and v.id=r.deal_version_id where r.tenant_id=$1 and v.deal_id=$2 order by r.created_at,r.id',[tenant,dealId])).rows.map(row=>row.row as CanonicalJsonValue),
    loadErp:()=>loadErpWorkspace(client,tenant),
    listCommitments:async()=>(await repo.listActiveCommitments()).map(row=>({id:row.id,proofId:row.proofId,dealVersionId:row.dealVersionId,canonicalEventHash:row.canonicalEventHash,status:row.status,accountId:row.accountId,events:decodeEvents(row.canonicalEvents)})),
    insertDeal:deal=>repo.insertDeal(deal,context.now),insertVersion:version=>repo.insertDealVersion(version),
    insertConstraint:(row,versionId,position)=>repo.insertConstraint(row,versionId,position,context.now),
    adoptVersion:async(deal,version,status)=>{
     const result=await client.query('update public.dealtwin_deals set current_version_id=$4,status=$5,updated_at=$6 where tenant_id=$1 and id=$2 and current_version_id=$3 and committed_sales_order_id is null returning id',
      [tenant,deal.id,deal.currentVersionId,version.id,status,context.now]);one(result.rows);
    },
    setStatus:async(deal,status)=>{
     const result=await client.query('update public.dealtwin_deals set status=$4,updated_at=$5 where tenant_id=$1 and id=$2 and current_version_id=$3 and status=$6 and committed_sales_order_id is not distinct from $7 returning id',
      [tenant,deal.id,deal.currentVersionId,status,context.now,deal.status,deal.committedSalesOrderId]);one(result.rows);
    },
    recordEvidence:async write=>{
     const snapshot=write.input.snapshot;const snapshotId=write.runId+':snapshot';
     await repo.insertSnapshot({id:snapshotId,erpRevision:snapshot.erpRevision,asOfDate:snapshot.asOfDate,requestedHorizonEnd:snapshot.requestedHorizonEnd,
      adapterVersion:snapshot.adapterVersion,dependencyKeys:snapshot.dependencyManifest.keys,dependencyManifest:snapshot.dependencyManifest,
      canonicalEvents:snapshot.cashEvents.map(canonicalCashEventDto),stateHash:snapshot.stateHash,createdAt:context.now});
     let parentRunId:string|null=null;
     if(write.parentProofId){const rows=(await client.query('select compile_run_id from public.dealtwin_proofs where tenant_id=$1 and id=$2',[tenant,write.parentProofId])).rows;one(rows);parentRunId=rows[0]!.compile_run_id as string;}
     // Monetary fields are compiler output DTOs; this adapter never recalculates feasibility.
     const proof=write.proof;const result=write.result;const inputHash=write.stressRun?.inputHash??proof?.inputHash??sha256Canonical({engineVersion:NAMED_STRESS_ENGINE_VERSION,input:encodeCompileInput(write.input)});
     await repo.insertCompileRun({id:write.runId,dealVersionId:proof?.dealVersionId??write.dealVersionId,snapshotId,kind:write.kind,engineVersion:proof?.engineVersion??NAMED_STRESS_ENGINE_VERSION,
      inputHash,resultHash:write.stressRun?.resultHash??proof?.resultHash??sha256Canonical(encodeCompileResult(result)),outcome:result.outcome,cashFloorRupiah:result.cashFloorRupiah.toString(),
      shortfallRupiah:result.shortfallRupiah?.toString()??null,worstMinimumRupiah:result.timeline?.minimumProjectedBalance.toString()??null,firstViolationDate:result.firstViolationDate,
      violationData:write.stressRun?{parameters:write.stressRun.parameters,inputHash:write.stressRun.inputHash,resultHash:write.stressRun.resultHash,inputPayload:write.stressRun.inputPayload,resultPayload:write.stressRun.resultPayload}:encodeCompileResult(result),parentRunId,createdAt:context.now});
     if(proof)await repo.insertProof(proof,write.runId);
    },
    insertApproval:row=>repo.insertApproval(row,context.now),
    saveErp:async state=>{if(adopted)throw new PersistenceIntegrityError('Revision already adopted');await saveErpWorkspace(client,tenant,revision,state);adopted=true;},
    advanceRevision:async()=>{if(adopted)return revision+1;const value=await bumpWorkspaceRevision(client,tenant,revision,context.now);adopted=true;return value;},
    markReplayed:async id=>{one((await client.query('update public.dealtwin_proofs set replayed_at=$3 where tenant_id=$1 and id=$2 returning id',[tenant,id,context.now])).rows);},
   };
   return work(tx);
  });
 }};
}
