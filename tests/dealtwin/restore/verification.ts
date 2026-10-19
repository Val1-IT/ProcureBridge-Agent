import {it,expect} from 'vitest';
import {Pool} from 'pg';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assertIdentity,identitySql} from '../../../scripts/dealtwin/restore-support.mjs';
import {snapshot} from '../../../scripts/dealtwin/restore-snapshot.mjs';
import {probeTenantAccess,DEAL_TWIN_APP_ROLE,JUDGE_TENANT_ID} from '../postgres/harness';
import {PostgresErpRepository} from '../../../lib/server/postgres/postgres-erp-repository';
import {createPostgresCommitmentService} from '../../../lib/server/postgres/postgres-commitment-service';
import {withTransaction} from '../../../lib/server/postgres/transaction';
import {replayProof} from '../../../lib/dealtwin/proof/replay-proof';
import {recordPayment,cancelPayment} from '../../../lib/erp/commands/finance';
import {commitmentRequestHash,RESERVE_ACTION,COMMIT_ACTION} from '../../../lib/dealtwin/application/audit-events';
import {readOperationReceipt} from '../../../lib/server/postgres/idempotency-audit-store';
import type {MutationContext} from '../../../lib/dealtwin/application/operation-contracts';
import type {DealProofDto} from '../../../lib/dealtwin/proof/proof-dto';

it('restored synthetic target preserves proofs, receipts, RLS and payment reversals',async()=>{
 const folder=process.env.RESTORE_EVIDENCE!;
 const plan=JSON.parse(readFileSync(path.join(folder,'plan.json'),'utf8'));
 const marker=JSON.parse(readFileSync(plan.ownership.ownerMarker,'utf8'));
 expect(marker.authorized).toBe(true);expect(marker.target).toBe(plan.target.dataDirectory);
 expect(plan.target.port).toBe(55432);
 const pool=(user:string,password:string)=>new Pool({host:'127.0.0.1',port:55432,database:'dealtwin_test',user,password,max:1,connectionTimeoutMillis:5000});
 const owner=pool('dealtwin',process.env.RESTORE_TARGET_PASSWORD!);
 const app=pool('dealtwin_app_login','dealtwin_app_login');
 try{
  assertIdentity((await owner.query(identitySql)).rows[0],plan.target);
  const before=await snapshot(owner);
  const original=JSON.parse(readFileSync(path.join(folder,'restored-snapshot.json'),'utf8'));
  expect(before).toEqual(original);
  const proofs=await owner.query<{proof_json:DealProofDto}>('select proof_json from dealtwin_proofs');
  expect(proofs.rowCount).toBeGreaterThan(0);
  for(const row of proofs.rows)expect(replayProof(row.proof_json).ok).toBe(true);
  const receipts=(await owner.query("select actor_id,action,detail,created_at from erp_audit_events where detail->>'operationSucceeded'='true' order by id")).rows;
  expect(receipts.length).toBeGreaterThan(0);
  const service=createPostgresCommitmentService(app);let reserveRetries=0,commitRetries=0;
  for(const row of receipts){
   const d=row.detail;
   const decoded=await withTransaction(app,JUDGE_TENANT_ID,tx=>readOperationReceipt(tx,JUDGE_TENANT_ID,row.action,d.idempotencyKey,d.requestHash));
   expect(decoded).toEqual(JSON.parse(d.responseJson));
   if(![RESERVE_ACTION,COMMIT_ACTION].includes(row.action))continue;
   const context:MutationContext={tenantId:JUDGE_TENANT_ID,actorId:d.actorId??row.actor_id,role:d.actorRole,expectedRevision:d.priorRevision,idempotencyKey:d.idempotencyKey,now:new Date(row.created_at).toISOString()};
   const base={proofId:d.proofId,dealVersionId:d.dealVersionId,canonicalEventHash:d.canonicalEventHash};
   const input=[base,{...base,dealId:d.dealId}].find(value=>commitmentRequestHash(row.action,context,value)===d.requestHash);
   expect(input).toBeDefined();if(!input)throw Error('RECEIPT_REQUEST_NOT_RECONSTRUCTED');
   const reply=await (row.action===RESERVE_ACTION?service.reserveLiquidity(context,input):service.commitDeal(context,input));
   expect(reply).toEqual(decoded);
   if(row.action===RESERVE_ACTION)reserveRetries++;else commitRetries++;
  }
  expect(reserveRetries).toBeGreaterThan(0);expect(commitRetries).toBeGreaterThan(0);
  expect(await snapshot(owner)).toEqual(before);
  const tenantTables=(await owner.query("select table_name from information_schema.columns where table_schema='public' and column_name='tenant_id' order by table_name")).rows;
  await withTransaction(app,'synthetic-other-tenant',async tx=>{
   for(const {table_name} of tenantTables){expect(table_name).toMatch(/^[a-z0-9_]+$/);expect(Number((await tx.query(`select count(*) from public.${table_name}`)).rows[0].count)).toBe(0);}
  });
  const access=await probeTenantAccess('postgres://dealtwin:unused@127.0.0.1:55432/dealtwin_test',DEAL_TWIN_APP_ROLE,JUDGE_TENANT_ID);
  expect(access.outcomes.find(r=>r.action==='insert_other')?.allowed).toBe(false);
  expect(access.outcomes.find(r=>r.action==='update_other')?.allowed).toBe(false);
  await expect(withTransaction(app,JUDGE_TENANT_ID,tx=>tx.query("update erp_audit_events set detail='{}'::jsonb where tenant_id=$1",[JUDGE_TENANT_ID]))).rejects.toThrow(/permission|append-only/);
  expect(await snapshot(owner)).toEqual(before);
  const repo=new PostgresErpRepository(app),baseline=await repo.loadWorkspace(JUDGE_TENANT_ID);
  const paid=recordPayment(baseline,'finance',{direction:'receivable',invoiceId:'judge-existing-ar',amount:7000000},'2026-09-13T12:00:00.000Z');
  expect(paid.ok).toBe(true);if(!paid.ok)throw Error(paid.error.message);
  await repo.saveAtomic(JUDGE_TENANT_ID,baseline.revision,paid.state);
  const next=await repo.loadWorkspace(JUDGE_TENANT_ID);
  const cancelled=cancelPayment(next,'finance',paid.value.id,'2026-09-14T12:00:00.000Z');
  expect(cancelled.ok).toBe(true);if(!cancelled.ok)throw Error(cancelled.error.message);
  await repo.saveAtomic(JUDGE_TENANT_ID,next.revision,cancelled.state);
  const after=await repo.loadWorkspace(JUDGE_TENANT_ID);
  expect(after.revision).toBe(baseline.revision+2);
  expect(after.cashMovements).toHaveLength(baseline.cashMovements.length+2);
  const payment=after.payments.find(p=>p.id===paid.value.id)!;expect(payment.status).toBe('cancelled');
  const movement=after.cashMovements.find(m=>m.sourceId===paid.value.id&&m.entryKind==='original')!;
  expect(movement).toBeDefined();
  const reversal=after.cashMovements.find(m=>m.reversesMovementId===movement.id)!;
  expect(reversal.amountRupiah).toBe(movement.amountRupiah);
  const evidence={status:'pass',proofReplayCount:proofs.rowCount,receiptCount:receipts.length,reserveRetries,commitRetries,crossTenantTables:tenantTables.length,access,appendOnlyUpdateDenied:true,idempotentRetriesChangedState:false,revisionBefore:baseline.revision,revisionAfter:after.revision,newOriginalReversalCount:2,sourceMutated:false};
  writeFileSync(path.join(folder,'behavior-verification.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  writeFileSync(path.join(folder,'target-final-snapshot.json'),JSON.stringify(await snapshot(owner),null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({...evidence,restoredRowsHash:createHash('sha256').update(JSON.stringify(original.rows)).digest('hex')}));
 }finally{await app.end();await owner.end();}
},60000);
