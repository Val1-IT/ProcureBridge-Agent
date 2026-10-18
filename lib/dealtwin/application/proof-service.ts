import { compileDeal,type CompileInput } from '../compiler/compile-deal';
import { buildDealProof } from '../proof/build-proof';
import type { DealProof } from '../proof/proof-dto';
import type { Deal,DealVersion } from '../domain/deal';
import { runStressLab } from '../stress/run-stress-lab';
import { createJudgeAmendmentPolicy } from '../judge/amendment-policy';
import { NAMED_STRESS_ENGINE_VERSION } from '../proof/version';
import { replayProof,prepareCommitmentProof } from '../proof/replay-proof';
import { decodeStressScenario,type StressScenario } from '../stress/stress-transform';
import type { CanonicalJsonValue } from '../domain/canonical-json';
import type { MutationContext,OperationResponse } from './operation-contracts';
import type { WorkflowPort,WorkflowTransaction } from './workflow-port';
import { fail,json,mutateWorkflow,operationId,requireSales } from './workflow-mutation';
import { workflowFrame } from './workflow-frame';
export async function persistWorkflowProof(tx:WorkflowTransaction,context:MutationContext,action:string,deal:Deal,version:DealVersion,input:CompileInput,kind:'base'|'recompile',parentProofId?:string):Promise<DealProof> {
 const result=compileDeal(input);if(result.outcome!=='COMPILES'&&result.outcome!=='CONDITIONALLY_VALID')fail(result.reasonCode??'DOES_NOT_COMPILE',422);
 const proofId=operationId(context,action,'proof');
 const codes=[...new Set(input.constraints.constraints.filter(row=>row.kind==='required_approval').map(row=>row.value.approvalCode))].sort();
 const approvals=codes.map(code=>({id:operationId(context,action,'approval:'+code),proofId,dealVersionId:version.id,kind:'non_arithmetic_authorization' as const,status:'pending' as const,requirementCode:code}));
 const stress=runStressLab(input,createJudgeAmendmentPolicy().requiredStressScenarios);
 const built=buildDealProof({proofId,dealId:deal.id,version,snapshot:input.snapshot,constraints:input.constraints,policy:input.policy,baseResult:result,stressRuns:stress,assumptions:[],approvals,approvedApprovalCodes:[],generatedAt:context.now,engineVersion:NAMED_STRESS_ENGINE_VERSION});
 if(!built.ok)fail(built.error.code,422);
 await tx.recordEvidence({runId:operationId(context,action,'run'),dealVersionId:version.id,kind,input,result,proof:built.value.dto,...(parentProofId?{parentProofId}:{})});
 for(const row of approvals)await tx.insertApproval({...row,comment:null,decidedBy:null,decidedAt:null});
 return built.value;
}
export class ProofApplicationService {
 constructor(private readonly port:WorkflowPort){}
 async generate(context:MutationContext,dealVersionId:string,dealId?:string):Promise<OperationResponse> {
  requireSales(context);const action='dealtwin.proof.generated';
  return mutateWorkflow(this.port,context,action,json({dealVersionId,dealId:dealId??null}),async tx=>{
   const frame=await workflowFrame(tx,context,dealVersionId,dealId);
   const proof=await persistWorkflowProof(tx,context,action,frame.deal,frame.version,frame.input,'base',frame.parentProofId);
   if(!frame.parentProofId&&!frame.deal.committedSalesOrderId)await tx.setStatus(frame.deal,'PROOF_GENERATED');
   return {dealId:frame.deal.id,dealVersionId:frame.version.id,proof:json(proof.dto)};
  });
 }
 async replay(context:MutationContext,proofId:string):Promise<OperationResponse> {
  requireSales(context);
  return mutateWorkflow(this.port,context,'dealtwin.proof.replayed',{proofId},async tx=>{
   const stored=await tx.getProof(proofId);if(!stored)fail('PROOF_NOT_FOUND',404);
   const result=replayProof(stored.proof);if(!result.ok)fail(result.error.code,422);
   await tx.markReplayed(proofId);
   return {proofId,replayed:true,currentStatus:stored.status,historical:json(result.value),proofHash:stored.proof.proofHash};
  });
 }
 async stress(context:MutationContext,proofId:string,parameters:readonly CanonicalJsonValue[]):Promise<OperationResponse> {
  requireSales(context);const action='dealtwin.proof.stressed';
  return mutateWorkflow(this.port,context,action,json({proofId,scenarios:parameters}),async tx=>{
   const stored=await tx.getProof(proofId);if(!stored)fail('PROOF_NOT_FOUND',404);
   const prepared=prepareCommitmentProof(stored.proof);if(!prepared.ok)fail(prepared.error.code,422);
   if(prepared.value.compileInput.snapshot.tenantId!==context.tenantId)fail('PROOF_IDENTITY_MISMATCH',422);
   let scenarios:StressScenario[];let runs:ReturnType<typeof runStressLab>;
   try{scenarios=parameters.map(decodeStressScenario);runs=runStressLab(prepared.value.compileInput,scenarios);}
   catch(error){if(error instanceof Error&&error.message==='INVALID_STRESS_SCENARIO')fail('INVALID_STRESS_SCENARIO',422);throw error;}
   for(const run of runs)await tx.recordEvidence({runId:operationId(context,action,'run:'+run.id),dealVersionId:stored.proof.dealVersionId,kind:'stress',
    input:{...prepared.value.compileInput,stressScenario:run.scenario},result:run.result,stressRun:run,parentProofId:proofId});
   return {proofId,scope:'historical_proof',currentStatus:stored.status,runs:json(runs)};
  });
 }
}
