import { canonicalStringify,sha256Canonical,type CanonicalJsonValue } from '../domain/canonical-json';
import { assertJudgeActor } from './judge-seed-service';
import type { MutationContext,OperationResponse } from './operation-contracts';
import { WorkflowError,type WorkflowPort,type WorkflowTransaction } from './workflow-port';
export function fail(code:string,status=409):never { throw new WorkflowError(code,status); }
export function json(value:unknown):CanonicalJsonValue { return JSON.parse(JSON.stringify(value,(_key,item:unknown)=>typeof item==='bigint'?item.toString():item)) as CanonicalJsonValue; }
export function operationId(context:MutationContext,action:string,kind:string):string { return 'dt:'+sha256Canonical({tenantId:context.tenantId,action,key:context.idempotencyKey,kind}); }
export async function mutateWorkflow(port:WorkflowPort,context:MutationContext,action:string,input:CanonicalJsonValue,
 work:(tx:WorkflowTransaction)=>Promise<CanonicalJsonValue>):Promise<OperationResponse> {
 try {
  assertJudgeActor(context);
  if(!/^[a-zA-Z0-9:_-]{1,128}$/.test(context.idempotencyKey)||!Number.isSafeInteger(context.expectedRevision)||context.expectedRevision<0||context.expectedRevision>=Number.MAX_SAFE_INTEGER
   ||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(context.now)||!Number.isFinite(Date.parse(context.now))) fail('INVALID_REQUEST',422);
  const hash=sha256Canonical({action,expectedRevision:context.expectedRevision,input});
  return await port.transact(context,async tx=>{
   const receipt=await tx.receipts.findSuccess(context.tenantId,action,context.idempotencyKey);
   if(receipt){ if(receipt.actorId!==context.actorId) fail('FORBIDDEN_ROLE',403); if(receipt.requestHash!==hash) fail('IDEMPOTENCY_KEY_REUSED'); return JSON.parse(receipt.responseJson) as OperationResponse; }
   if(tx.revision!==context.expectedRevision) fail('REVISION_CONFLICT');
   const body=await work(tx); const revision=await tx.advanceRevision();
   if(!body||typeof body!=='object'||Array.isArray(body)) throw new Error('Workflow response must be an object');
   const response:OperationResponse={httpStatus:200,body:{...body,ok:true,revision}};
   const encoded=json(response);
   await tx.receipts.appendSuccess({tenantId:context.tenantId,actorId:context.actorId,action,idempotencyKey:context.idempotencyKey,
    requestHash:hash,responseJson:canonicalStringify(encoded),responseHash:sha256Canonical(encoded),priorRevision:tx.revision,currentRevision:revision,createdAt:context.now,
    detail:{schemaVersion:'dealtwin.audit.v1',actorRole:context.role}});
   return response;
  });
 } catch(error) { if(error instanceof WorkflowError) return {httpStatus:error.httpStatus,body:{ok:false,error:{code:error.code}}}; throw error; }
}
export function requireSales(context:MutationContext):void { assertJudgeActor(context); if(context.role!=='admin'&&context.role!=='sales') fail('FORBIDDEN_ROLE',403); }
