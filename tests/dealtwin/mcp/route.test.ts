import {describe,it,expect,vi} from 'vitest';
import {POST,GET} from '../../../app/api/dealtwin/mcp/route';
import {workspace,request,evidence,JUDGE_TENANT_ID} from '../api/workflow-harness';
import {createMcpConfirmation} from '../../../lib/server/auth/mcp-confirmation';
let db:ReturnType<typeof workspace>;
vi.mock('../../../lib/server/dealtwin/workflow-runtime',async()=>{
 const actual=await vi.importActual<typeof import('../../../lib/server/dealtwin/workflow-runtime')>('../../../lib/server/dealtwin/workflow-runtime');
 return {...actual,getWorkflowRuntime:()=>actual.createPostgresWorkflowRuntime(db().appPool)};
});
vi.mock('../../../lib/server/dealtwin/runtime',async()=>{
 const actual=await vi.importActual<typeof import('../../../lib/server/dealtwin/runtime')>('../../../lib/server/dealtwin/runtime');
 return {...actual,getJudgeRuntime:()=>actual.createPostgresJudgeRuntime(db().appPool,db().resetPool)};
});
const version='2025-11-25';
const command={tool:'compile_deal',arguments:{mode:'execute',input:{dealId:'judge-deal-a',dealVersionId:'judge-version-a-1',expectedRevision:1,idempotencyKey:'mcp-route-compile'}}};
function authorized(value=command){return {...value,arguments:{...value.arguments,confirmationToken:createMcpConfirmation({tenantId:JUDGE_TENANT_ID,actorId:'task22-admin',role:'admin'},value,{key:process.env.DEALTWIN_JUDGE_SESSION_SIGNING_KEY!,now:new Date()})}};}
function rpc(method:string,params?:unknown,id:number|string|null=1,role:'admin'|'approver'|null='admin'){
 const base=request('mcp',{jsonrpc:'2.0',...(id===null?{}:{id}),method,...(params===undefined?{}:{params})},role);
 const headers=new Headers(base.headers);headers.set('accept','application/json, text/event-stream');headers.set('mcp-protocol-version',version);
 return new Request(base,{headers});
}
function call(value=command,id=1){return rpc('tools/call',{name:value.tool,arguments:value.arguments},id);}
async function body(response:Response){return await response.json() as {id:number|string|null;result:{isError:boolean;structuredContent:{httpStatus:number;data:unknown;references:unknown;prepared?:boolean};content:{type:string;text:string}[];tools:{name:string}[];protocolVersion:string};error?:{code:number;message:string}};}
describe('authenticated stateless MCP HTTP / real PostgreSQL services',()=>{
 db=workspace();
 it('accepts omitted arguments for parameterless reads while retaining required-input and null rejection',async()=>{
  const before=await evidence(db());
  for(const name of ['list_deals','inspect_timeline']){
   const response=await POST(rpc('tools/call',{name}));expect(response.status).toBe(200);
   expect((await body(response)).result.structuredContent.httpStatus).toBe(200);
  }
  for(const params of [{name:'get_deal'},{name:'compile_deal'},{name:'list_deals',arguments:null}]){
   expect((await POST(rpc('tools/call',params))).status).toBe(422);
  }
  expect(await evidence(db())).toEqual(before);
 });
 it('negotiates pinned compatibility revision, lists real schema tools and accepts initialized notification without writes',async()=>{
  const before=await evidence(db());const init=await POST(rpc('initialize',{protocolVersion:'2026-07-28',capabilities:{},clientInfo:{name:'local-fixture',version:'1'}}));
  expect(init.status).toBe(200);expect((await body(init)).result.protocolVersion).toBe(version);
  const list=await POST(rpc('tools/list',{}));expect(list.status).toBe(200);const names=(await body(list)).result.tools.map(x=>x.name);expect(names).toContain('commit_deal');expect(names).not.toContain('execute_sql');
  const notified=await POST(rpc('notifications/initialized',{},null));expect(notified.status).toBe(202);expect(await notified.text()).toBe('');expect(await evidence(db())).toEqual(before);
  expect((await GET(request('mcp'))).status).toBe(405);
 });
 it('returns durable graph references with no write, and refuses an unknown selected proof',async()=>{
  const before=await evidence(db());const read=await POST(rpc('tools/call',{name:'get_deal',arguments:{dealId:'judge-deal-a'}}));expect(read.status).toBe(200);
  expect((await body(read)).result.structuredContent.references).toMatchObject({dealId:'judge-deal-a',dealVersionId:'judge-version-a-1',revision:1});
  const bad=await POST(rpc('tools/call',{name:'get_proof',arguments:{dealId:'judge-deal-a',proofId:'unknown'}}));expect((await body(bad)).result.structuredContent.httpStatus).toBe(404);expect(await evidence(db())).toEqual(before);
 });
 it('requires actual server-bound human consent; prepare and a missing/forged grant never mutate',async()=>{
  const before=await evidence(db());const missing=await POST(call());expect(missing.status).toBe(200);expect((await body(missing)).result.structuredContent.httpStatus).toBe(428);
  const prepared=await POST(rpc('tools/call',{name:command.tool,arguments:{...command.arguments,mode:'prepare'}}));expect((await body(prepared)).result.structuredContent.prepared).toBe(true);
  const forged=await POST(rpc('tools/call',{name:command.tool,arguments:{...command.arguments,confirmationToken:'fake-grant'}}));expect((await body(forged)).result.structuredContent.httpStatus).toBe(428);expect(await evidence(db())).toEqual(before);
 });
 it('executes exactly one service operation and returns original data on retry; modified success payload is denied',async()=>{
  const cmd=authorized();const first=await POST(call(cmd));expect(first.status).toBe(200);expect(first.headers.get('cache-control')).toBe('no-store');const result=(await body(first)).result;
  expect(result.isError).toBe(false);expect(result.structuredContent.data).toMatchObject({outcome:'DOES_NOT_COMPILE',revision:2,shortfallRupiah:'3000000'});
  expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
  const before=await evidence(db());const retry=await POST(call(cmd,2));expect((await body(retry)).result.structuredContent).toEqual(result.structuredContent);expect(await evidence(db())).toEqual(before);
  const changed=authorized({...command,arguments:{...command.arguments,input:{...command.arguments.input,expectedRevision:2}}});const denied=await body(await POST(call(changed)));
  expect(denied.result.isError).toBe(true);expect(denied.result.structuredContent.data).toMatchObject({error:{code:'IDEMPOTENCY_KEY_REUSED'}});expect(await evidence(db())).toEqual(before);
 });
 it('denies anonymous, role, raw SQL and body identity before service writes',async()=>{
  const before=await evidence(db());expect((await POST(rpc('tools/list',{},1,null))).status).toBe(401);expect((await POST(rpc('tools/list',{},1,'approver'))).status).toBe(403);
  for(const params of [{name:'execute_sql',arguments:{sql:'delete from erp_workspaces'}},{name:command.tool,arguments:{...command.arguments,tenantId:'foreign',role:'admin'}},{name:command.tool,arguments:{...command.arguments,confirmed:true}}])expect((await POST(rpc('tools/call',params))).status).toBe(422);
  expect(await evidence(db())).toEqual(before);
 });
 it('bounds body/protocol/origin and rejects batch/raw database methods without writes',async()=>{
  const before=await evidence(db());const cross=rpc('tools/list',{});const headers=new Headers(cross.headers);headers.set('origin','https://foreign.example');expect((await POST(new Request(cross,{headers}))).status).toBe(403);
  const unknown=rpc('tools/list',{});const wrong=new Headers(unknown.headers);wrong.set('mcp-protocol-version','2099-01-01');expect((await POST(new Request(unknown,{headers:wrong}))).status).toBe(400);
  expect((await POST(rpc('tools/call',{name:command.tool,arguments:{...command.arguments,input:{...command.arguments.input,text:'x'.repeat(5000)}}}))).status).toBe(413);
  expect((await POST(rpc('execute_raw_sql',{table:'erp_workspaces'}))).status).toBe(400);
  const batch=request('mcp',[{jsonrpc:'2.0',id:1,method:'tools/list'}]);const bh=new Headers(batch.headers);bh.set('accept','application/json, text/event-stream');bh.set('mcp-protocol-version',version);expect((await POST(new Request(batch,{headers:bh}))).status).toBe(422);
  expect(await evidence(db())).toEqual(before);
 });
 it('sanitizes unexpected write failure and rolls back the actual operation',async()=>{
  await db().ownerPool.query("create function fail_mcp_audit() returns trigger language plpgsql as $$ begin raise exception 'private injected mcp failure'; end $$; create trigger mcp_fail before insert on public.erp_audit_events for each row execute function fail_mcp_audit()");
  const before=await evidence(db());const response=await POST(call(authorized()));expect(response.status).toBe(200);const raw=await response.text();expect(raw).not.toContain('private injected mcp failure');expect(JSON.parse(raw).result.structuredContent.httpStatus).toBe(503);expect(await evidence(db())).toEqual(before);
 });
 it('allows authenticated non-browser MCP without Origin but refuses browser-shaped origin omission',async()=>{
  const before=await evidence(db());const base=rpc('tools/call',{name:'get_deal',arguments:{dealId:'judge-deal-a'}});
  const nativeHeaders=new Headers(base.headers);nativeHeaders.delete('origin');
  const native=new Request(rpc('tools/call',{name:'get_deal',arguments:{dealId:'judge-deal-a'}}),{headers:nativeHeaders});expect((await POST(native)).status).toBe(200);
  const browserHeaders=new Headers(nativeHeaders);browserHeaders.set('sec-fetch-site','same-site');
  expect((await POST(new Request(base,{headers:browserHeaders}))).status).toBe(403);expect(await evidence(db())).toEqual(before);
 });
});
