import { describe,it,expect } from 'vitest';
import { POST } from '../../../app/api/dealtwin/approvals/[approvalId]/decision/route';
import { workspace,request,mutation,evidence } from './workflow-harness';
import { proofFixture } from '../postgres/commitment-fixture';
import { decideApproval } from '../../../lib/dealtwin/application/approval-service';
import { createPostgresApplicationPorts } from '../../../lib/server/postgres/postgres-dealtwin-repository';
import { context } from './workflow-harness';
describe('fixed proof/version approval HTTP contract',()=>{
 const db=workspace(); const p=()=>({params:Promise.resolve({approvalId:'t16-approval-a'})});
 it('only authenticated approver decides fixed terms, once, without rewriting historical proof',async()=>{
  const a=await proofFixture(db()); const input={...mutation(1,'http-approval'),proofId:a.input.proofId,dealVersionId:a.input.dealVersionId,decision:'approved',comment:'Fixed synthetic terms reviewed'};
  const before=await evidence(db());
  expect((await POST(request('approvals/t16-approval-a/decision',input,null),p())).status).toBe(401);
  expect((await POST(request('approvals/t16-approval-a/decision',input,'admin'),p())).status).toBe(403);
  expect(await evidence(db())).toEqual(before);
  const result=await POST(request('approvals/t16-approval-a/decision',input,'approver'),p()); expect(result.status).toBe(200); const body=await result.json(); expect(body).toMatchObject({status:'approved',proofUnchanged:true});
  const after=await evidence(db()); expect((after.dealtwin_proofs as unknown[])).toEqual(before.dealtwin_proofs);
  const retry=await POST(request('approvals/t16-approval-a/decision',input,'approver'),p()); expect(await retry.json()).toEqual(body); expect(await evidence(db())).toEqual(after);
  expect((await POST(request('approvals/t16-approval-a/decision',{...input,decision:'rejected'},'approver'),p())).status).toBe(409);
 });
 it('rejects wrong proof/version and spoofed tenant/role without writes',async()=>{
  const a=await proofFixture(db()); const before=await evidence(db()); const input={...mutation(1,'bad-approval'),proofId:a.input.proofId,dealVersionId:a.input.dealVersionId,decision:'approved',comment:'Synthetic'};
  for(const extra of [{proofId:'foreign-proof'},{dealVersionId:'judge-version-b-1'},{tenantId:'foreign'},{role:'approver'}]) expect((await POST(request('approvals/t16-approval-a/decision',{...input,...extra},'approver'),p())).status).toBe(422);
  expect(await evidence(db())).toEqual(before);
 });
 it('the approval adapter rejects owner/reset credentials as well as enforcing the approver session role',async()=>{
  const a=await proofFixture(db()); const before=await evidence(db());
  for(const pool of [db().ownerPool,db().resetPool]) await expect(decideApproval(createPostgresApplicationPorts(pool),{...context(1,'wrong-approval-db-role'),role:'approver'},
    {approvalId:'t16-approval-a',proofId:a.input.proofId,dealVersionId:a.input.dealVersionId,decision:'approved',comment:'Synthetic fixed terms'})).rejects.toThrow('least-privilege');
  expect(await evidence(db())).toEqual(before);
 });
});
