import { describe,it,expect } from 'vitest';
import { PATCH } from '../../../app/api/dealtwin/judge/obligations/[invoiceId]/route';
import { workspace,request,mutation,evidence,JUDGE_TENANT_ID } from './workflow-harness';
import { proofFixture } from '../postgres/commitment-fixture';
import { PostgresErpRepository } from '../../../lib/server/postgres/postgres-erp-repository';
import { replayProof } from '../../../lib/dealtwin/proof/replay-proof';
describe('allowlisted synthetic Judge obligation HTTP mutation',()=>{
 const db=workspace(); const p=(invoiceId='judge-existing-ap')=>({params:Promise.resolve({invoiceId})});
 it('persists exact19m source-chain change, stales proofs, advances once and preserves historic replay/cash',async()=>{
  const a=await proofFixture(db()); const before=await evidence(db()); const input={...mutation(1,'judge-ap-19'),amountRupiah:'19000000'};
  const result=await PATCH(request('judge/obligations/judge-existing-ap',input,'admin','PATCH'),p()); expect(result.status).toBe(200);
  const body=await result.json(); expect(body).toMatchObject({revision:2,invoiceId:'judge-existing-ap',amountRupiah:'19000000'});
  const saved=await new PostgresErpRepository(db().appPool).loadWorkspace(JUDGE_TENANT_ID); expect(saved.supplierInvoices[0]!.totalAmount).toBe(19000000);
  expect(saved.supplierInvoices[0]!.lines[0]!.unitPrice).toBe(19000000); expect(saved.goodsReceipts[0]!.lines[0]!.unitPrice).toBe(19000000); expect(saved.purchaseOrders[0]!.lines[0]!.unitPrice).toBe(19000000); expect(saved.revision).toBe(2);
  const after=await evidence(db()); expect(after.erp_cash_movements).toEqual(before.erp_cash_movements);
  expect((after.dealtwin_proofs as {row:{status:string;proof_json:unknown}}[])[0]!.row).toMatchObject({status:'STALE',proof_json:a.proof}); expect(replayProof(a.proof).ok).toBe(true);
  const retry=await PATCH(request('judge/obligations/judge-existing-ap',input,'admin','PATCH'),p()); expect(await retry.json()).toEqual(body); expect(await evidence(db())).toEqual(after);
 });
 it('denies absent/unauthorized session, other invoice and malformed/AI-shaped amounts',async()=>{
  const before=await evidence(db()); const input={...mutation(1,'bad-ap'),amountRupiah:'19000000'};
  expect((await PATCH(request('judge/obligations/judge-existing-ap',input,null,'PATCH'),p())).status).toBe(401);
  expect((await PATCH(request('judge/obligations/judge-existing-ap',input,'sales','PATCH'),p())).status).toBe(403);
  expect((await PATCH(request('judge/obligations/other',input,'admin','PATCH'),p('other'))).status).toBe(422);
  for(const extra of [{amountRupiah:'19000000.1'},{amountRupiah:'18000000'},{amountRupiah:19000000},{tenantId:'foreign'},{supplierId:'foreign'},{role:'admin'},{confidence:1}]) expect((await PATCH(request('judge/obligations/judge-existing-ap',{...input,...extra},'admin','PATCH'),p())).status).toBe(422);
  expect((await PATCH(request('judge/obligations/judge-existing-ap',{...input,amountRupiah:'9'.repeat(5000)},'admin','PATCH'),p())).status).toBe(413);
  expect(await evidence(db())).toEqual(before);
 });
});
