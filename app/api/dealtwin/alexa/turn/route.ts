import {z} from 'zod';
import {intentRouterFromEnv} from '../../../../../lib/dealtwin/ai/intent-router';
import {verdictExplainerFromEnv} from '../../../../../lib/dealtwin/ai/verdict-explainer';
import {requireJudgeSession} from '../../../../../lib/server/auth/judge-session';
import {createMcpConfirmation} from '../../../../../lib/server/auth/mcp-confirmation';
import {createAlexaTicket,verifyAlexaTicket} from '../../../../../lib/server/dealtwin/alexa-ticket';
import {runAlexaTurn} from '../../../../../lib/server/dealtwin/alexa-orchestrator';
import {JudgeHttpError,judgeRouteError,parseBoundedJson} from '../../../../../lib/server/dealtwin/request-contract';
import {POST as mcp} from '../../mcp/route';

const turnSchema=z.strictObject({utterance:z.string().max(300).optional(),conversation:z.string().max(1024).optional(),
 ticket:z.string().max(3072).optional(),action:z.enum(['confirm','cancel']).optional()});
/** Simulated Alexa+ turn. Every financial read and write goes through the real
 * DealTwin MCP route with the caller's own session; this route only maps speech
 * to tool calls. The MCP confirmation grant is minted here after a human yes and
 * never leaves the server. */
export async function POST(request:Request):Promise<Response>{
 try{
  const actor=await requireJudgeSession(request);
  if(!['admin','sales','finance'].includes(actor.role))throw new JudgeHttpError(403,'FORBIDDEN_ROLE');
  const turn=await parseBoundedJson(request,turnSchema);
  if(!turn.utterance?.trim()&&!turn.action)throw new JudgeHttpError(422,'INVALID_REQUEST');
  const key=process.env.DEALTWIN_JUDGE_SESSION_SIGNING_KEY??'';
  const endpoint=new URL('/api/dealtwin/mcp',request.url);
  let id=0;
  const router=intentRouterFromEnv(process.env),explainer=verdictExplainerFromEnv(process.env);
  const result=await runAlexaTurn(turn,{
   ...(router?{routeIntent:(utterance:string)=>router.route(utterance)}:{}),
   ...(explainer?{explainVerdict:(facts,language)=>explainer.explain(facts,language)}:{}),
   async mcp(method,params){
    const response=await mcp(new Request(endpoint,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),headers:{
     cookie:request.headers.get('cookie')??'',origin:endpoint.origin,'content-type':'application/json',
     accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25'}}));
    return {status:response.status,body:await response.json()};
   },
   confirm:action=>createMcpConfirmation(actor,{tool:action.tool,arguments:{mode:'execute',input:action.input}},{key,now:new Date()}),
   issueTicket:action=>createAlexaTicket(actor,action,{key,now:new Date()}),
   verifyTicket:ticket=>verifyAlexaTicket(actor,ticket,{key,now:new Date()}),
  });
  return Response.json({ok:true,...result},{headers:{'cache-control':'no-store'}});
 }catch(error){return judgeRouteError(error);}
}
