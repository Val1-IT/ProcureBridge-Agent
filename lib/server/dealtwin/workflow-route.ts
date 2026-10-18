import { requireJudgeSession } from '../auth/judge-session';
import { JudgeHttpError,judgeRouteError } from './request-contract';
import { parseWorkflowRequest,type WorkflowOperation } from './workflow-request';
import { getWorkflowRuntime } from './workflow-runtime';
import { WorkflowError } from '../../dealtwin/application/workflow-port';
import { ExpectedRevisionConflict } from '../postgres/errors';
export async function handleWorkflowRequest(request:Request,operation:WorkflowOperation|'list'|'detail',
 params?:Promise<{dealId?:string;proofId?:string;approvalId?:string;invoiceId?:string;commitmentId?:string}>):Promise<Response> {
 try{
  const actor=await requireJudgeSession(request);
  const allowed=operation==='approval'?actor.role==='approver':operation==='obligation'?(actor.role==='admin'||actor.role==='finance'):(actor.role==='admin'||actor.role==='sales');
  if(!allowed)throw new JudgeHttpError(403,'FORBIDDEN_ROLE');
  const route=params?await params:{};const target=route.dealId??route.proofId??route.approvalId??route.invoiceId??route.commitmentId;
  if(target&&!/^[a-zA-Z0-9:_-]{1,128}$/.test(target))throw new JudgeHttpError(422,'INVALID_REQUEST');
  if(operation==='obligation'&&target!=='judge-existing-ap')throw new JudgeHttpError(422,'INVALID_JUDGE_MUTATION');
  if(operation==='list'||operation==='detail'){
   if(new URL(request.url).search!=='')throw new JudgeHttpError(422,'INVALID_REQUEST');
   const runtime=getWorkflowRuntime();
   const result=await runtime.read({...actor,expectedRevision:0,idempotencyKey:'read-only',now:new Date().toISOString()},operation==='list'?null:target??null);
   return Response.json(result.body,{status:result.httpStatus,headers:{'cache-control':'no-store'}});
  }
  const input=await parseWorkflowRequest(request,operation);
  const runtime=getWorkflowRuntime();
  const context={...actor,expectedRevision:input.expectedRevision as number,idempotencyKey:input.idempotencyKey as string,now:new Date().toISOString()};
  const result=await runtime.execute(operation,context,{...input,...(target?{target}:{})});
  return Response.json(result.body,{status:result.httpStatus,headers:{'cache-control':'no-store'}});
 }catch(error){
  if(error instanceof WorkflowError)return judgeRouteError(new JudgeHttpError(error.httpStatus,error.code));
  if(error instanceof ExpectedRevisionConflict)return judgeRouteError(new JudgeHttpError(409,'REVISION_CONFLICT'));
  return judgeRouteError(error);
 }
}
