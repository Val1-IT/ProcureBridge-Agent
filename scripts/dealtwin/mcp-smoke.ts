import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createMcpConfirmation} from '../../lib/server/auth/mcp-confirmation';
import {requireJudgeSession} from '../../lib/server/auth/judge-session';

const origin='http://127.0.0.1:4177'; // Fixed private disposable target, never caller-controlled.
const auth=JSON.parse(await readFile('output/playwright/demo/auth/admin.json','utf8')) as {cookies:{name:string;value:string}[]};
const session=auth.cookies.find(cookie=>cookie.name==='dealtwin_judge_session');
if(!session)throw new Error('PRIVATE_LOCAL_SESSION_REQUIRED');
const cookie=session.name+'='+session.value;
const actor=await requireJudgeSession(new Request(origin+'/api/dealtwin/mcp',{headers:{cookie}}));
const checks:{name:string;status:'pass'}[]=[];
const record=(name:string)=>checks.push({name,status:'pass'});
const headers={cookie,origin,accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25','content-type':'application/json'};
type Result={isError:boolean;structuredContent:{httpStatus:number;data:Record<string,unknown>;references:Record<string,unknown>;prepared?:boolean}};
async function rpc(method:string,params:unknown,id:number,extra:Record<string,string>={}){
 const response=await fetch(origin+'/api/dealtwin/mcp',{method:'POST',headers:{...headers,...extra},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
 return {response,json:await response.json() as {result:Result&{protocolVersion:string;tools:{name:string}[]};error?:unknown}};
}
async function state(){
 const response=await fetch(origin+'/api/dealtwin/judge/state',{headers:{cookie}});
 assert.equal(response.status,200);return await response.json() as {revision:number;cash:unknown};
}
const initial=await state();assert.ok(Number.isSafeInteger(initial.revision)&&initial.revision>=1,'Prepare the disposable fixture first; reset revision is intentionally monotone');
const initialized=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'private-native-smoke',version:'1'}},1);
assert.equal(initialized.response.status,200);assert.equal(initialized.json.result.protocolVersion,'2025-11-25');record('actual Node initialize');
const listed=await rpc('tools/list',{},2);assert.equal(listed.response.status,200);assert.ok(listed.json.result.tools.some(x=>x.name==='commit_deal'));assert.ok(!listed.json.result.tools.some(x=>x.name==='execute_sql'));record('allowlisted schema discovery');
const command={tool:'compile_deal',arguments:{mode:'execute',input:{dealId:'judge-deal-a',dealVersionId:'judge-version-a-1',expectedRevision:initial.revision,idempotencyKey:'native-mcp-'+randomUUID()}}};
const prepared=await rpc('tools/call',{name:command.tool,arguments:{...command.arguments,mode:'prepare'}},3);
assert.equal(prepared.json.result.structuredContent.prepared,true);assert.deepEqual(await state(),initial);record('prepare-only leaves real state intact');
const denied=await rpc('tools/call',{name:command.tool,arguments:command.arguments},4);
assert.equal(denied.json.result.structuredContent.httpStatus,428);assert.deepEqual(await state(),initial);record('no grant denies mutation');
const sign=(value:typeof command)=>({...value.arguments,confirmationToken:createMcpConfirmation(actor,value,{key:process.env.DEALTWIN_JUDGE_SESSION_SIGNING_KEY!,now:new Date()})});
const authorized=sign(command);
const compiled=await rpc('tools/call',{name:command.tool,arguments:authorized},5);
assert.equal(compiled.response.status,200);assert.equal(compiled.response.headers.get('cache-control'),'no-store');
assert.equal(compiled.json.result.isError,false);assert.equal(compiled.json.result.structuredContent.data.shortfallRupiah,'3000000');assert.equal(compiled.json.result.structuredContent.data.firstViolationDate,'2026-09-22');
const current=await state();assert.equal(current.revision,initial.revision+1);assert.deepEqual(current.cash,initial.cash);record('one real compile / one revision / unchanged cash');
const retry=await rpc('tools/call',{name:command.tool,arguments:authorized},6);
assert.deepEqual(retry.json.result.structuredContent,compiled.json.result.structuredContent);assert.deepEqual(await state(),current);record('immutable original-response retry over socket');
const changed={...command,arguments:{...command.arguments,input:{...command.arguments.input,expectedRevision:current.revision}}};
const collision=await rpc('tools/call',{name:command.tool,arguments:sign(changed)},7);
assert.equal(collision.json.result.structuredContent.httpStatus,409);assert.deepEqual(collision.json.result.structuredContent.data.error,{code:'IDEMPOTENCY_KEY_REUSED'});assert.deepEqual(await state(),current);record('same-key payload change denied');
const raw=await rpc('tools/call',{name:'execute_sql',arguments:{table:'erp_workspaces'}},8);assert.equal(raw.response.status,422);
const anonymous=await rpc('tools/list',{},9,{cookie:''});assert.equal(anonymous.response.status,401);
const cross=await rpc('tools/list',{},10,{origin:'https://foreign.example'});assert.equal(cross.response.status,403);assert.deepEqual(await state(),current);record('raw DB / anonymous / cross-origin denial');
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
await mkdir('output/dealtwin/task26',{recursive:true});
await writeFile('output/dealtwin/task26/native-mcp-smoke.json',JSON.stringify({schemaVersion:'dealtwin.mcp-smoke.v1',candidateSha:sha,synthetic:true,transport:'private Node HTTP / compatibility 2025-11-25',checks},null,2));
console.log(JSON.stringify({candidateSha:sha,checks:checks.length,status:'PASS',artifact:'output/dealtwin/task26/native-mcp-smoke.json'}));
