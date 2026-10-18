import { describe,it,expect } from 'vitest';
import { POST } from '../../../app/api/dealtwin/deals/[dealId]/constraints/confirm/route';
import { GET } from '../../../app/api/dealtwin/deals/[dealId]/route';
import { workspace,request,params,mutation,ids,evidence } from './workflow-harness';
import type { ReadDealState } from './workflow-harness';
describe('server constraint confirmation with real PostgreSQL',()=>{
  const db=workspace();
  it('creates one immutable confirmed version, preserves history and replays the original result',async()=>{
    const before=await evidence(db()); const input={ ...mutation(1,'confirm-all'),dealVersionId:'judge-version-a-1',constraintIds:await ids(db()) };
    const result=await POST(request('deals/judge-deal-a/constraints/confirm',input),params()); expect(result.status).toBe(200);
    const body=await result.json() as {dealVersionId:string}; expect(body).toMatchObject({ ok:true,revision:2,version:2,previousVersionId:'judge-version-a-1' });
    const detail=await GET(request('deals/judge-deal-a'),params()); expect(detail.status).toBe(200);
    const state=await detail.json() as ReadDealState; expect(state.currentVersion.id).toBe(body.dealVersionId); expect(state.currentVersion.terms.customerPaymentEvents[0].basisPoints).toBe(2000);
    expect(state.versions.find((row:{id:string})=>row.id==='judge-version-a-1')!.terms.customerPaymentEvents[0].basisPoints).toBe(2000);
    expect(state.constraints.every((row:{resolution:string})=>row.resolution==='confirmed')).toBe(true);
    const after=await evidence(db()); expect(after.erp_cash_movements).toEqual(before.erp_cash_movements);
    const retry=await POST(request('deals/judge-deal-a/constraints/confirm',input),params()); expect(await retry.json()).toEqual(body); expect(await evidence(db())).toEqual(after);
    const mismatch=await POST(request('deals/judge-deal-a/constraints/confirm',{ ...input,constraintIds:input.constraintIds.slice(1) }),params());
    expect(mismatch.status).toBe(409); expect(await mismatch.json()).toMatchObject({ error:{code:'IDEMPOTENCY_KEY_REUSED'} }); expect(await evidence(db())).toEqual(after);
  });
  it('rejects partial/unknown confirmation and stale version/revision without writes',async()=>{
    const list=await ids(db()); const before=await evidence(db());
    for (const input of [
      { ...mutation(1,'partial'),dealVersionId:'judge-version-a-1',constraintIds:list.slice(1) },
      { ...mutation(1,'unknown'),dealVersionId:'judge-version-a-1',constraintIds:[...list,'not-material'] },
      { ...mutation(1,'foreign-version'),dealVersionId:'judge-version-b-1',constraintIds:list },
      { ...mutation(0,'stale-revision'),dealVersionId:'judge-version-a-1',constraintIds:list },
    ]) { const result=await POST(request('deals/judge-deal-a/constraints/confirm',input),params()); expect(result.status).toBeGreaterThanOrEqual(400); expect(result.status).toBeLessThan(500); }
    expect(await evidence(db())).toEqual(before);
  });
  it('rejects absent session, finance role, identity injection and oversized payloads',async()=>{
    const input={ ...mutation(1,'auth-confirm'),dealVersionId:'judge-version-a-1',constraintIds:await ids(db()) }; const before=await evidence(db());
    expect((await POST(request('deals/judge-deal-a/constraints/confirm',input,null),params())).status).toBe(401);
    expect((await POST(request('deals/judge-deal-a/constraints/confirm',input,'finance'),params())).status).toBe(403);
    for (const extra of [{tenantId:'foreign'},{role:'admin'},{now:'2026-09-12'},{aiConfidence:1}]) expect((await POST(request('deals/judge-deal-a/constraints/confirm',{...input,...extra}),params())).status).toBe(422);
    expect((await POST(request('deals/judge-deal-a/constraints/confirm',{...input,sql:'x'.repeat(5000)}),params())).status).toBe(413);
    expect(await evidence(db())).toEqual(before);
  });
});
