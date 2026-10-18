import {randomUUID} from 'node:crypto';
import {createJudgeSessionCookie} from '../../lib/server/auth/judge-session';
import {createPostgresJudgeRuntime} from '../../lib/server/dealtwin/runtime';
import {parsePostgresConfig,assertDisposableJudgeDatabaseUrl} from '../../lib/server/postgres/config';
import {createPostgresPool} from '../../lib/server/postgres/pool';
import {withTransaction} from '../../lib/server/postgres/transaction';
interface AuthState {cookies:{name:string;value:string;domain:string;path:string;expires:number;httpOnly:boolean;secure:boolean;sameSite:'Strict'}[];origins:[]}
export async function bootstrapLocalJudge(resetSeed=false):Promise<{admin:AuthState;approver:AuthState}>{
 const app=parsePostgresConfig();const reset=parsePostgresConfig({...process.env,DATABASE_URL:process.env.DEALTWIN_JUDGE_RESET_DATABASE_URL});
 for(const config of [app,reset])assertDisposableJudgeDatabaseUrl(config.connectionString);
 if(app.user!=='dealtwin_app_login'||reset.user!=='dealtwin_reset_login'||app.host!==reset.host||app.port!==reset.port||app.database!==reset.database)throw new Error('SEPARATE_DISPOSABLE_TEST_LOGINS_REQUIRED');
 const appPool=createPostgresPool(app);const resetPool=createPostgresPool(reset);const tenantId='dealtwin-judge-v1';
 try{
  const runtime=createPostgresJudgeRuntime(appPool,resetPool);
  if(resetSeed){
   const revision=await withTransaction(appPool,tenantId,async tx=>(await tx.query('select revision::text revision from public.erp_workspaces where tenant_id=$1 for update',[tenantId])).rows[0]?.revision);
   // An explicitly requested synthetic reset may initialize an empty migrated
   // fixture. The reset service creates/locks its workspace transactionally.
   // Normal bootstrap below still refuses an absent workspace and never resets.
   const result=await runtime.resetJudgeTenant({tenantId,actorId:'judge-browser-admin',role:'admin',expectedRevision:revision===undefined?0:Number(revision),idempotencyKey:'browser-bootstrap-'+randomUUID(),now:new Date().toISOString()});
   if(result.httpStatus!==200)throw new Error('CANONICAL_BROWSER_FIXTURE_FAILED');
  }else await runtime.loadJudgeState({tenantId,actorId:'judge-browser-admin',role:'admin'});
  const mint=(role:'admin'|'approver'):AuthState=>{
   const cookie=createJudgeSessionCookie({tenantId,actorId:'judge-browser-'+role,role},{signingKey:process.env.DEALTWIN_JUDGE_SESSION_SIGNING_KEY!,now:Date.now()});
   const pair=cookie.split(';')[0]!;const offset=pair.indexOf('=');
   return {cookies:[{name:pair.slice(0,offset),value:pair.slice(offset+1),domain:'127.0.0.1',path:'/api/dealtwin',expires:Math.floor(Date.now()/1000)+3600,httpOnly:true,secure:true,sameSite:'Strict'}],origins:[]};
  };
  return {admin:mint('admin'),approver:mint('approver')};
 }finally{await appPool.end();await resetPool.end();}
}
