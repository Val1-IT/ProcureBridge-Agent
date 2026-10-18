import type {ActorContext,MutationContext,OperationResponse,CommitmentCommandInput} from '../application/operation-contracts';
import type {WorkflowRuntime} from '../application/workflow-port';
import {WorkflowError} from '../application/workflow-port';
import {assertJudgeActor} from '../application/judge-seed-service';
import type {CommitmentTarget} from '../application/audit-events';
import {canonicalStringify,type CanonicalJsonValue} from '../domain/canonical-json';
import {parseToolRequest,type DealTwinToolRequest,type ToolName} from './tool-schemas';

export interface ToolReferences {dealId?:string;dealVersionId?:string;proofId?:string;commitmentId?:string;salesOrderId?:string;revision?:number}
export type DealTwinToolResult={tool:ToolName;httpStatus:number;data:CanonicalJsonValue;references:ToolReferences;prepared?:false}
 |{tool:ToolName;httpStatus:200;data:CanonicalJsonValue;references:ToolReferences;prepared:true};
export interface ToolServices {
 workflow:WorkflowRuntime;
 reserveLiquidity(context:MutationContext,input:CommitmentTarget):Promise<OperationResponse>;
 commitDeal(context:MutationContext,input:CommitmentTarget):Promise<OperationResponse>;
 releaseCommitment(context:MutationContext,input:CommitmentCommandInput):Promise<OperationResponse>;
 readTimeline(context:ActorContext):Promise<OperationResponse>;
}
function object(value:CanonicalJsonValue|undefined):Readonly<Record<string,CanonicalJsonValue>>{
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Readonly<Record<string,CanonicalJsonValue>>:{};
}
function references(body:CanonicalJsonValue):ToolReferences{
 const row=object(body),deal=object(row.deal),current=object(row.currentVersion),proof=object(row.proof),refs:ToolReferences={};
 const fields={dealId:row.dealId??deal.id??proof.dealId,dealVersionId:row.dealVersionId??current.id??proof.dealVersionId,
  proofId:row.proofId??proof.id,commitmentId:row.commitmentId,salesOrderId:row.salesOrderId??deal.committedSalesOrderId};
 for(const [field,value] of Object.entries(fields))if(typeof value==='string'&&/^[a-zA-Z0-9:_-]{1,128}$/.test(value))Object.assign(refs,{[field]:value});
 if(typeof row.revision==='number'&&Number.isSafeInteger(row.revision)&&row.revision>=0)refs.revision=row.revision;
 return refs;
}
const workflowOperations={
 draft_deal:'create',update_deal:'edit',extract_constraints:'extract',confirm_constraints:'confirm',compile_deal:'compile',
 generate_proof:'generate',stress_deal:'stress',replay_proof:'replay',recompile_deal:'recompile',mutate_judge_obligation:'obligation',
} as const;
/** Bound ports; public call remains executeDealTwinTool(actor, request). */
export function createDealTwinToolHandler(services:ToolServices,options:{
 now:()=>Date;verifyConfirmation:(actor:ActorContext,request:DealTwinToolRequest,now:Date)=>boolean;
}){
 return async function executeDealTwinTool(actor:ActorContext,value:unknown):Promise<DealTwinToolResult>{
  let request:DealTwinToolRequest;
  try{request=parseToolRequest(value);}catch{return {tool:'list_deals',httpStatus:422,data:{ok:false,error:{code:'INVALID_TOOL_REQUEST'}},references:{}};}
  const error=(code:string,httpStatus:number):DealTwinToolResult=>({tool:request.tool,httpStatus,data:{ok:false,error:{code}},references:{}});
  try{assertJudgeActor(actor);}catch{return error('FORBIDDEN_JUDGE_CONTEXT',403);}
  const allowed=request.tool==='inspect_timeline'?['admin','sales','finance'].includes(actor.role)
   :request.tool==='mutate_judge_obligation'?['admin','finance'].includes(actor.role):['admin','sales'].includes(actor.role);
  if(!allowed)return error('FORBIDDEN_ROLE',403);
  try{
   const now=options.now();if(!Number.isFinite(now.getTime()))return error('INVALID_SERVER_TIME',503);
   const readContext:MutationContext={...actor,expectedRevision:0,idempotencyKey:'read-only',now:now.toISOString()};
   let response:OperationResponse;
   switch(request.tool){
    case 'list_deals':response=await services.workflow.read(readContext,null);break;
    case 'get_deal':response=await services.workflow.read(readContext,request.arguments.dealId);break;
    case 'get_proof':{
     const graph=await services.workflow.read(readContext,request.arguments.dealId);
     if(graph.httpStatus!==200){response=graph;break;}
     const body=object(graph.body);
     const proof=Array.isArray(body.proofs)?body.proofs.find(row=>object(row).id===request.arguments.proofId):undefined;
     if(!proof)return error('PROOF_NOT_FOUND',404);
     response={httpStatus:200,body:{ok:true,revision:body.revision??null,proof}};break;
    }
    case 'inspect_timeline':response=await services.readTimeline(actor);break;
    default:{
     const args=request.arguments;
     if(args.mode==='prepare')return {tool:request.tool,httpStatus:200,data:{ok:true,outcome:'PREPARED',requiresConfirmation:true},references:{},prepared:true};
     if(!args.confirmationToken||!options.verifyConfirmation(actor,request,now))return error('CONFIRMATION_REQUIRED',428);
     const context:MutationContext={...actor,expectedRevision:args.input.expectedRevision,idempotencyKey:args.input.idempotencyKey,now:now.toISOString()};
     switch(request.tool){
      case 'reserve_liquidity':response=await services.reserveLiquidity(context,request.arguments.input);break;
      case 'commit_deal':response=await services.commitDeal(context,request.arguments.input);break;
      case 'release_commitment':response=await services.releaseCommitment(context,request.arguments.input);break;
      default:{
       const input=request.arguments.input;
       const target='dealId' in input?input.dealId:'proofId' in input?input.proofId:'invoiceId' in input?input.invoiceId:undefined;
       const {expectedRevision:_,idempotencyKey:__,...payload}=input;void _;void __;
       response=await services.workflow.execute(workflowOperations[request.tool],context,{...payload,...(target?{target}:{})});break;
      }
     }
    }
   }
   canonicalStringify(response.body);
   return {tool:request.tool,httpStatus:response.httpStatus,data:response.body,references:response.httpStatus>=200&&response.httpStatus<300?references(response.body):{}};
  }catch(errorValue){
   if(errorValue instanceof WorkflowError)return error(errorValue.code,errorValue.httpStatus);
   return error('TOOL_UNAVAILABLE',503);
  }
 };
}
