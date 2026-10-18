import { createDealVersion } from '../domain/deal';
import { compileDeal } from '../compiler/compile-deal';
import { encodeCompileResult } from '../proof/build-proof';
import { decodeTerms } from '../proof/replay-proof';
import { findSmallestAmendment } from '../recompiler/recompile-deal';
import { createJudgeAmendmentPolicy } from '../judge/amendment-policy';
import { createJudgeScenario } from '../judge/scenario';
import type { MutationContext,OperationResponse } from './operation-contracts';
import { WorkflowError,type WorkflowPort,type WorkflowTransaction } from './workflow-port';
import { fail,json,mutateWorkflow,operationId,requireSales } from './workflow-mutation';
import { workflowFrame } from './workflow-frame';
import { persistWorkflowProof } from './proof-service';
import type { CanonicalJsonValue } from '../domain/canonical-json';
import type { ConstraintSet } from '../domain/constraint';
async function copyConstraints(tx:WorkflowTransaction,context:MutationContext,action:string,versionId:string,set:ConstraintSet):Promise<ConstraintSet> {
 const rows=set.constraints.map(row=>({...row,id:operationId(context,action,row.id)}));
 for(const [index,row] of rows.entries())await tx.insertConstraint(row,versionId,index+1);
 return {constraints:rows};
}
export class DealApplicationService {
 constructor(private readonly port:WorkflowPort){}
 async create(context:MutationContext,input:{title:string;terms:CanonicalJsonValue}):Promise<OperationResponse>{
  requireSales(context);const action='dealtwin.deal.created';
  return mutateWorkflow(this.port,context,action,json(input),async tx=>{
   const terms=decodeTerms(input.terms);if(!terms.ok)fail('INVALID_TERMS',422);
   const state=await tx.loadErp();
   if(!state.customers.some(row=>row.id===terms.value.customerId)||!state.warehouses.some(row=>row.id===terms.value.warehouseId)||terms.value.productLines.some(line=>!state.products.some(row=>row.id===line.productId)))fail('UNKNOWN_ERP_REFERENCE',422);
   const id=operationId(context,action,'deal');const version=createDealVersion({id:operationId(context,action,'version'),dealId:id,version:1,terms:terms.value,createdAt:context.now,createdBy:context.actorId});
   await tx.insertDeal({id,title:input.title,customerId:terms.value.customerId,currentVersionId:'',status:'DRAFT',committedSalesOrderId:null});await tx.insertVersion(version);
   await copyConstraints(tx,context,action,version.id,createJudgeScenario().constraints);
   return {dealId:id,dealVersionId:version.id,version:1,status:'DRAFT'};
  });
 }
 async edit(context:MutationContext,input:{dealId:string;dealVersionId:string;terms:CanonicalJsonValue}):Promise<OperationResponse>{
  requireSales(context);const action='dealtwin.deal.edited';
  return mutateWorkflow(this.port,context,action,json(input),async tx=>{
   const frame=await workflowFrame(tx,context,input.dealVersionId,input.dealId);
   if(frame.deal.committedSalesOrderId)fail('DEAL_ALREADY_COMMITTED');
   const terms=decodeTerms(input.terms);if(!terms.ok)fail('INVALID_TERMS',422);
   if(terms.value.customerId!==frame.deal.customerId)fail('CUSTOMER_IDENTITY_MISMATCH',422);
   const state=await tx.loadErp();
   if(!state.warehouses.some(row=>row.id===terms.value.warehouseId)||terms.value.productLines.some(line=>!state.products.some(row=>row.id===line.productId)))fail('UNKNOWN_ERP_REFERENCE',422);
   const version=createDealVersion({id:operationId(context,action,'version'),dealId:frame.deal.id,version:frame.version.version+1,terms:terms.value,createdBy:context.actorId,createdAt:context.now});
   await tx.insertVersion(version);await copyConstraints(tx,context,action,version.id,frame.input.constraints);await tx.adoptVersion(frame.deal,version,'DRAFT');
   return {dealId:frame.deal.id,dealVersionId:version.id,previousVersionId:frame.version.id,version:version.version};
  });
 }
 async compile(context:MutationContext,dealVersionId:string,dealId?:string):Promise<OperationResponse>{
  requireSales(context);const action='dealtwin.deal.compiled';
  return mutateWorkflow(this.port,context,action,json({dealVersionId,dealId:dealId??null}),async (tx):Promise<CanonicalJsonValue>=>{
   const frame=await workflowFrame(tx,context,dealVersionId,dealId);const result=compileDeal(frame.input);
   await tx.recordEvidence({runId:operationId(context,action,'run'),dealVersionId:frame.version.id,kind:'base',input:frame.input,result});
   if(!frame.parentProofId&&!frame.deal.committedSalesOrderId)await tx.setStatus(frame.deal,'COMPILED');
   return {...encodeCompileResult(result) as Record<string,CanonicalJsonValue>,dealId:frame.deal.id,dealVersionId:frame.version.id};
  });
 }
 async recompile(context:MutationContext,dealVersionId:string,dealId?:string):Promise<OperationResponse>{
  requireSales(context);const action='dealtwin.deal.recompiled';
  return mutateWorkflow(this.port,context,action,json({dealVersionId,dealId:dealId??null}),async (tx):Promise<CanonicalJsonValue>=>{
   const frame=await workflowFrame(tx,context,dealVersionId,dealId);let search:ReturnType<typeof findSmallestAmendment>;
   try{search=findSmallestAmendment(frame.input,createJudgeAmendmentPolicy());}
   catch(error){if(error instanceof Error&&error.message==='INVALID_AMENDMENT_POLICY')fail('INVALID_AMENDMENT_POLICY',422);throw error;}
   if(search.outcome==='NO_FEASIBLE_AMENDMENT'){
    await tx.recordEvidence({runId:operationId(context,action,'run'),dealVersionId:frame.version.id,kind:'recompile',input:frame.input,result:compileDeal(frame.input),...(frame.parentProofId?{parentProofId:frame.parentProofId}:{})});
    return {outcome:search.outcome,evaluatedCandidates:search.evaluatedCandidates,feasibleCandidates:0};
   }
   const version=createDealVersion({id:operationId(context,action,'version'),dealId:frame.deal.id,version:frame.version.version+1,terms:search.candidate.terms,createdBy:context.actorId,createdAt:context.now});
   await tx.insertVersion(version);const constraints=await copyConstraints(tx,context,action,version.id,search.candidate.constraints);
   const proof=await persistWorkflowProof(tx,context,action,frame.deal,version,{...frame.input,terms:search.candidate.terms,constraints},'recompile',frame.parentProofId);
   // Committed remediation remains a separate proposal: keep current operational version, occupied row and SO.
   if(!frame.deal.committedSalesOrderId)await tx.adoptVersion(frame.deal,version,'PROOF_GENERATED');
   return {outcome:frame.deal.committedSalesOrderId?'REMEDIATION_PENDING':'PROPOSED_AMENDMENT',dealId:frame.deal.id,dealVersionId:version.id,version:version.version,
    previousVersionId:frame.version.id,proof:json(proof.dto),changedFields:[...search.candidate.changedFields],score:[...search.candidate.score],
    evaluatedCandidates:search.evaluatedCandidates,feasibleCandidates:search.feasibleCandidates,minimumProjectedBalanceRupiah:search.candidate.baseResult.timeline!.minimumProjectedBalance.toString(),
    salesOrderId:frame.deal.committedSalesOrderId};
  });
 }
 async read(context:MutationContext,dealId:string|null):Promise<OperationResponse>{
  try{
   requireSales(context);
   return await this.port.transact(context,async (tx):Promise<OperationResponse>=>{
    if(!dealId)return {httpStatus:200,body:{ok:true,revision:tx.revision,deals:json(await tx.listDeals())}};
    const deal=await tx.getDeal(dealId);if(!deal)fail('DEAL_NOT_FOUND',404);
    const versions=await tx.listVersions(dealId);const current=await tx.getVersion(deal.currentVersionId);if(!current)fail('VERSION_NOT_FOUND',404);
    const proofs=await tx.proofs(dealId);
    return {httpStatus:200,body:{ok:true,revision:tx.revision,deal:json(deal),currentVersion:json(current),versions:json(versions),constraints:json((await tx.constraints(current.id)).constraints),
     proofs:json(proofs.map(row=>({...row.proof,currentStatus:row.status}))),compileRuns:json(await tx.runs(dealId))}};
   });
  }catch(error){if(error instanceof WorkflowError)return {httpStatus:error.httpStatus,body:{ok:false,error:{code:error.code}}};throw error;}
 }
}
