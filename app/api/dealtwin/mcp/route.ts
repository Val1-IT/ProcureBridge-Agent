import {z} from 'zod';
import {requireJudgeSession} from '../../../../lib/server/auth/judge-session';
import {verifyMcpConfirmation} from '../../../../lib/server/auth/mcp-confirmation';
import {JudgeHttpError,parseBoundedJson} from '../../../../lib/server/dealtwin/request-contract';
import {getWorkflowRuntime} from '../../../../lib/server/dealtwin/workflow-runtime';
import {getJudgeRuntime} from '../../../../lib/server/dealtwin/runtime';
import {createDealTwinToolHandler,type ToolServices} from '../../../../lib/dealtwin/mcp/tool-handlers';
import {parseToolRequest,listToolDefinitions} from '../../../../lib/dealtwin/mcp/tool-schemas';

const latest='2025-11-25'; // Explicit compatibility binding, not 2026-era support.
const supported=['2025-03-26','2025-06-18',latest];
const rpcId=z.union([z.string().min(1).max(128),z.number().int().safe()]);
const envelope=z.strictObject({jsonrpc:z.literal('2.0'),id:rpcId.optional(),method:z.string().min(1).max(128),params:z.unknown().optional()});
const metadata=z.record(z.string().max(128),z.unknown()).optional();
const empty=z.strictObject({_meta:metadata});
const initialize=z.strictObject({protocolVersion:z.string().min(1).max(32),capabilities:z.record(z.string(),z.unknown()),
 clientInfo:z.strictObject({name:z.string().min(1).max(128),version:z.string().min(1).max(64),title:z.string().max(128).optional()}),_meta:metadata});
const call=z.strictObject({name:z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/),arguments:z.unknown().optional(),_meta:metadata});
const headers={'cache-control':'no-store'};
function response(id:string|number,result:unknown){return Response.json({jsonrpc:'2.0',id,result},{headers});}
function error(id:string|number|null,status:number,code:number,message:string){return Response.json({jsonrpc:'2.0',id,error:{code,message}},{status,headers});}
function parse<T extends z.ZodType>(schema:T,value:unknown):z.infer<T>{try{return schema.parse(value);}catch{throw new JudgeHttpError(422,'INVALID_REQUEST');}}
async function actorFor(request:Request){
 const actor=await requireJudgeSession(request);
 if(!['admin','sales','finance'].includes(actor.role))throw new JudgeHttpError(403,'FORBIDDEN_ROLE');
 const origin=request.headers.get('origin');
 if(origin===null&&request.headers.has('sec-fetch-site'))throw new JudgeHttpError(403,'INVALID_ORIGIN');
 if((origin!==null&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')throw new JudgeHttpError(403,'INVALID_ORIGIN');
 const protocol=request.headers.get('mcp-protocol-version')??'2025-03-26';
 if(!supported.includes(protocol))throw new JudgeHttpError(400,'UNSUPPORTED_MCP_PROTOCOL');
 if(request.headers.has('mcp-session-id'))throw new JudgeHttpError(400,'STATELESS_MCP_ONLY');
 return actor;
}
// Lazy ports: prepare/list/initialize never allocate a database client or call AI.
const services:ToolServices={
 get workflow(){return getWorkflowRuntime();},
 reserveLiquidity:(context,input)=>getJudgeRuntime().reserveLiquidity(context,input),
 commitDeal:(context,input)=>getJudgeRuntime().commitDeal(context,input),
 releaseCommitment:(context,input)=>getJudgeRuntime().releaseCommitment(context,input),
 readTimeline:async actor=>{const state=await getJudgeRuntime().loadJudgeState(actor);return {httpStatus:200,body:{ok:true,revision:state.revision,timeline:state.timeline}};},
};
const executeDealTwinTool=createDealTwinToolHandler(services,{now:()=>new Date(),verifyConfirmation:(actor,request,now)=>
 verifyMcpConfirmation(actor,request,{key:process.env.DEALTWIN_JUDGE_SESSION_SIGNING_KEY??'',now})});
/** Local authenticated stateless Streamable HTTP JSON binding. No public OAuth,
 * consent/session issuance, raw database tools, SSE streams or provider grant. */
export async function POST(request:Request):Promise<Response>{
 let id:string|number|null=null;
 try{
  const actor=await actorFor(request);
  const accept=(request.headers.get('accept')??'').split(',').map(x=>x.trim().split(';')[0]);
  if(!accept.includes('application/json')||!accept.includes('text/event-stream'))throw new JudgeHttpError(406,'MCP_ACCEPT_REQUIRED');
  // Non-browser MCP clients may omit Origin. Authentication and fetch-metadata
  // checks above already ran; normalize only this private protocol boundary so
  // the common byte/JSON parser remains unchanged for browser ERP routes.
  let bounded=request;
  if(!request.headers.has('origin')){const normalized=new Headers(request.headers);normalized.set('origin',new URL(request.url).origin);bounded=new Request(request,{headers:normalized});}
  const rpc=await parseBoundedJson(bounded,envelope);id=rpc.id??null;
  if(rpc.method==='notifications/initialized'){
   if(id!==null)throw new JudgeHttpError(400,'INVALID_NOTIFICATION');parse(empty,rpc.params??{});return new Response(null,{status:202,headers});
  }
  if(id===null)throw new JudgeHttpError(400,'MCP_REQUEST_ID_REQUIRED');
  switch(rpc.method){
   case 'initialize':{
    const init=parse(initialize,rpc.params);
    return response(id,{protocolVersion:supported.includes(init.protocolVersion)?init.protocolVersion:latest,capabilities:{tools:{listChanged:false}},serverInfo:{name:'DealTwin synthetic service tools',version:'1.0.0'},instructions:'All data synthetic. Prepare does not execute. Mutations require explicit human-confirmation grant and current revision; model cannot issue grants.'});
   }
   case 'ping':parse(empty,rpc.params??{});return response(id,{});
   case 'tools/list':{
    parse(empty,rpc.params??{});const tools=listToolDefinitions().filter(tool=>actor.role==='finance'?['inspect_timeline','mutate_judge_obligation'].includes(tool.name):tool.name!=='mutate_judge_obligation'||actor.role==='admin');
    return response(id,{tools});
   }
   case 'tools/call':{
    const input=parse(call,rpc.params);let tool;
    // MCP permits omitted arguments. Only omission becomes an empty object;
    // null and missing required tool fields still fail the strict tool schema.
    try{tool=parseToolRequest({tool:input.name,arguments:input.arguments===undefined?{}:input.arguments});}catch{throw new JudgeHttpError(422,'INVALID_TOOL_REQUEST');}
    const result=await executeDealTwinTool(actor,tool);
    return response(id,{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:result.httpStatus<200||result.httpStatus>=300});
   }
   default:return error(id,400,-32601,'METHOD_NOT_FOUND');
  }
 }catch(cause){
  const status=cause instanceof JudgeHttpError?cause.httpStatus:503;
  return error(id,status,status>=500?-32603:status===422?-32602:-32000,cause instanceof JudgeHttpError?cause.code:'MCP_UNAVAILABLE');
 }
}
export async function GET(request:Request):Promise<Response>{
 try{await actorFor(request);return new Response(null,{status:405,headers:{...headers,allow:'POST'}});}
 catch(cause){return error(null,cause instanceof JudgeHttpError?cause.httpStatus:503,-32000,cause instanceof JudgeHttpError?cause.code:'MCP_UNAVAILABLE');}
}
export const DELETE=GET;
