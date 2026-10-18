import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createJudgeSessionCookie} from '../../../lib/server/auth/judge-session';
import {POST} from '../../../app/api/dealtwin/commitments/[commitmentId]/route';
import type {MutationContext,CommitmentCommandInput} from '../../../lib/dealtwin/application/operation-contracts';
// Only persistence composition is replaced. Signed session, strict parser and registered handler are real.
vi.mock('../../../lib/server/dealtwin/runtime',()=>({getJudgeRuntime:()=>({
  releaseCommitment:async(context:MutationContext,input:CommitmentCommandInput)=>({httpStatus:200,body:{operation:'release',context,input}}),
  expireCommitment:async(context:MutationContext,input:CommitmentCommandInput)=>({httpStatus:200,body:{operation:'expire',context,input}}),
  cancelCommitment:async(context:MutationContext,input:CommitmentCommandInput)=>({httpStatus:200,body:{operation:'cancel',context,input}}),
})}));
const actor={tenantId:'dealtwin-judge-v1',actorId:'life-route-user',role:'sales' as const};
const key='task17-signing-key-only-for-tests-at-least32bytes';const now=Date.parse('2026-10-06T12:00:00.000Z');
const base={proofId:'proof-a',dealVersionId:'version-a',canonicalEventHash:'a'.repeat(64),expectedRevision:2,idempotencyKey:'life-route'};
const params={params:Promise.resolve({commitmentId:'commitment-a'})};
function request(body:unknown,cookie?:string,origin='http://localhost') {return new Request('http://localhost/api/dealtwin/commitments/commitment-a',{method:'POST',headers:{'content-type':'application/json',origin,...(cookie?{cookie}:{})},body:JSON.stringify(body)});}
describe('session-bound commitment lifecycle route',()=>{
  beforeEach(()=>{vi.stubEnv('DEALTWIN_JUDGE_SESSION_SIGNING_KEY',key);vi.useFakeTimers();vi.setSystemTime(now);});
  afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
  it.each(['release','expire','cancel'] as const)('%s binds target from URL and actor/time from server',async action=>{
    const cookie=createJudgeSessionCookie(actor,{signingKey:key,now}).split(';')[0]!;
    const response=await POST(request({...base,action},cookie),params);expect(response.status).toBe(200);
    expect(await response.json()).toEqual({operation:action,context:{...actor,expectedRevision:2,idempotencyKey:'life-route',now:'2026-10-06T12:00:00.000Z'},input:{proofId:'proof-a',dealVersionId:'version-a',canonicalEventHash:'a'.repeat(64),commitmentId:'commitment-a'}});
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects missing auth, wrong role/origin, identity/deadline/time overrides and unsupported operations',async()=>{
    const cookie=createJudgeSessionCookie(actor,{signingKey:key,now}).split(';')[0]!;
    expect((await POST(request({...base,action:'release'}),params)).status).toBe(401);
    for(const extra of [{tenantId:actor.tenantId},{role:'admin'},{actorId:'fake'},{now:'2030-01-01'},{expiresAt:'2000-01-01'},{commitmentId:'other'},{releaseIdempotencyKey:'x'}]) {
      expect((await POST(request({...base,action:'expire',...extra},cookie),params)).status).toBe(422);
    }
    for(const action of ['reserve','commit','sql','']) expect((await POST(request({...base,action},cookie),params)).status).toBe(422);
    expect((await POST(request({...base,action:'release'},cookie,'https://attacker.invalid'),params)).status).toBe(403);
    const warehouse=createJudgeSessionCookie({...actor,role:'warehouse'},{signingKey:key,now}).split(';')[0]!;
    expect((await POST(request({...base,action:'release'},warehouse),params)).status).toBe(403);
    expect((await POST(request({...base,action:'release'},cookie),{params:Promise.resolve({commitmentId:'invalid/sql'})})).status).toBe(422);
    expect((await POST(request({...base,action:'expire',canonicalEventHash:'bad'},cookie),params)).status).toBe(422);
    expect((await POST(request({...base,action:'release',idempotencyKey:'a'.repeat(5000)},cookie),params)).status).toBe(413);
  });
});
