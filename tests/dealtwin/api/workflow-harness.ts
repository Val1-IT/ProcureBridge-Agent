import { beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { PostgresHarness, JUDGE_TENANT_ID } from '../postgres/harness';
import { seed, context, evidence } from '../postgres/commitment-fixture';
import { createJudgeSessionCookie } from '../../../lib/server/auth/judge-session';
import type { ActorContext } from '../../../lib/dealtwin/application/operation-contracts';
import { withTransaction } from '../../../lib/server/postgres/transaction';
import type { DealVersion } from '../../../lib/dealtwin/domain/deal';
import type { DealProofDto } from '../../../lib/dealtwin/proof/proof-dto';
export interface ReadDealState {currentVersion:DealVersion;versions:DealVersion[];constraints:{resolution:string}[];proofs:DealProofDto[]}
export { context, evidence, JUDGE_TENANT_ID };
const key='task22-local-synthetic-signing-key-with-more-than32bytes';
export function workspace() {
  let harness:PostgresHarness;
  beforeAll(async()=>{ harness=await PostgresHarness.connect();
    const appUrl=new URL(process.env.DEALTWIN_TEST_DATABASE_URL!);appUrl.username='dealtwin_app_login';appUrl.password='dealtwin_app_login';
    vi.stubEnv('DATABASE_URL',appUrl.toString());
    vi.stubEnv('DATABASE_SSL_MODE','disable');
    const resetUrl=new URL(appUrl);resetUrl.username='dealtwin_reset_login';resetUrl.password='dealtwin_reset_login';
    vi.stubEnv('DEALTWIN_JUDGE_RESET_DATABASE_URL',resetUrl.toString());
    vi.stubEnv('DEALTWIN_JUDGE_SESSION_SIGNING_KEY',key);
  });
  beforeEach(async()=>{ await harness.resetAndMigrate(); await seed(harness); });
  afterAll(async()=>{ await harness?.close(); vi.unstubAllEnvs(); });
  return ()=>harness;
}
export function request(path:string,body?:unknown,role:ActorContext['role']|null='admin',method=body===undefined?'GET':'POST') {
  const cookie=role?createJudgeSessionCookie({ tenantId:JUDGE_TENANT_ID,actorId:'task22-'+role,role },{ signingKey:key,now:Date.now() }).split(';')[0]!:null;
  return new Request('http://localhost/api/dealtwin/'+path,{ method,headers:{ ...(cookie?{cookie}:{}),...(body!==undefined?{'content-type':'application/json',origin:'http://localhost'}:{}) },...(body!==undefined?{body:JSON.stringify(body)}:{}) });
}
export const params=(dealId='judge-deal-a')=>({ params:Promise.resolve({dealId}) });
export const mutation=(revision:number,key:string)=>({ expectedRevision:revision,idempotencyKey:key });
export async function ids(harness:PostgresHarness,version='judge-version-a-1'):Promise<string[]> {
  return withTransaction(harness.appPool,JUDGE_TENANT_ID,async tx=>(await tx.query('select id from public.dealtwin_constraints where tenant_id=$1 and deal_version_id=$2 order by position',[JUDGE_TENANT_ID,version])).rows.map(row=>row.id as string));
}
