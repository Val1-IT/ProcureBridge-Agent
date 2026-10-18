import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJudgeSessionCookie } from '../../../lib/server/auth/judge-session';
import { POST as reserve } from '../../../app/api/dealtwin/deals/[dealId]/reserve/route';
import { POST as commit } from '../../../app/api/dealtwin/deals/[dealId]/commit/route';
import type { MutationContext } from '../../../lib/dealtwin/application/operation-contracts';
import type { CommitmentTarget } from '../../../lib/dealtwin/application/audit-events';
// Only the external DB composition is replaced; actual handlers, cookies and streaming request parser run.
vi.mock('../../../lib/server/dealtwin/runtime',()=>({ getJudgeRuntime:()=>({
  reserveLiquidity:async (context:MutationContext,input:CommitmentTarget)=>({httpStatus:200,body:{action:'reserve',context,input}}),
  commitDeal:async (context:MutationContext,input:CommitmentTarget)=>({httpStatus:200,body:{action:'commit',context,input}}),
}) }));
const actor={tenantId:'dealtwin-judge-v1',actorId:'route-user',role:'sales' as const};
const key='task16-test-signing-key-longer-than-32-bytes';
const time=Date.parse('2026-10-06T12:00:00.000Z');
const body={proofId:'proof-a',dealVersionId:'version-a',canonicalEventHash:'a'.repeat(64),expectedRevision:2,idempotencyKey:'route-key'};
const params={params:Promise.resolve({dealId:'deal-a'})};
function request(operation:string,value:unknown,cookie?:string,origin='http://localhost') {
  return new Request(`http://localhost/api/dealtwin/deals/deal-a/${operation}`,{method:'POST',headers:{'content-type':'application/json',origin,...(cookie?{cookie}: {})},body:JSON.stringify(value)});
}
describe('session-bound reserve/commit routes',()=>{
  beforeEach(()=>{vi.stubEnv('DEALTWIN_JUDGE_SESSION_SIGNING_KEY',key);vi.useFakeTimers();vi.setSystemTime(time);});
  afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
  it.each([['reserve',reserve],['commit',commit]] as const)('%s binds role/tenant/time from server session and deal from URL',async (operation,handler)=>{
    const cookie=createJudgeSessionCookie(actor,{signingKey:key,now:time}).split(';')[0]!;
    const result=await handler(request(operation,body,cookie),params);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({action:operation,context:{...actor,expectedRevision:2,idempotencyKey:'route-key',now:'2026-10-06T12:00:00.000Z'},input:{proofId:'proof-a',dealVersionId:'version-a',canonicalEventHash:'a'.repeat(64),dealId:'deal-a'}});
    expect(result.headers.get('cache-control')).toBe('no-store');
  });
  it.each([['reserve',reserve],['commit',commit]] as const)('%s rejects identity spoofing, malformed contracts, unauthenticated and cross-origin requests',async (operation,handler)=>{
    const cookie=createJudgeSessionCookie(actor,{signingKey:key,now:time}).split(';')[0]!;
    expect((await handler(request(operation,body),params)).status).toBe(401);
    for (const extra of [{tenantId:actor.tenantId},{role:'admin'},{actorId:'other'},{now:'2026-09-12'},{dealId:'other'},{amountRupiah:'1'}]) {
      expect((await handler(request(operation,{...body,...extra},cookie),params)).status).toBe(422);
    }
    for (const invalid of [{...body,canonicalEventHash:'bad'},{...body,expectedRevision:-1},{...body,proofId:''},{...body,idempotencyKey:'a'.repeat(5000)}]) {
      expect((await handler(request(operation,invalid,cookie),params)).status).toBe(invalid.idempotencyKey.length>4096?413:422);
    }
    expect((await handler(request(operation,body,cookie,'https://attacker.invalid'),params)).status).toBe(403);
    const warehouse=createJudgeSessionCookie({...actor,role:'warehouse'},{signingKey:key,now:time}).split(';')[0]!;
    expect((await handler(request(operation,body,warehouse),params)).status).toBe(403);
    expect((await handler(request(operation,body,cookie),{params:Promise.resolve({dealId:'invalid/sql'})})).status).toBe(422);
  });
});
