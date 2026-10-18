import type { ErpState } from '../../erp/types';
import type { Deal,DealVersion } from '../domain/deal';
import type { CommercialConstraint,ConstraintSet } from '../domain/constraint';
import type { CompileInput,CompileResult } from '../compiler/compile-deal';
import type { DealProofDto } from '../proof/proof-dto';
import type { CommitmentPort,StoredCommitment } from './commitment-service';
import type { MutationContext,OperationResponse } from './operation-contracts';
import type { ApprovalRecord,OperationReceiptRepository } from './ports';
import type { StressRun } from '../stress/run-stress-lab';
import type { CanonicalJsonValue } from '../domain/canonical-json';
export interface WorkflowEvidence {
 readonly runId:string; readonly dealVersionId:string; readonly kind:'base'|'stress'|'recompile'; readonly input:CompileInput; readonly result:CompileResult;
 readonly proof?:DealProofDto; readonly parentProofId?:string;
 readonly stressRun?:StressRun;
}
export interface WorkflowTransaction {
 readonly revision:number; readonly receipts:OperationReceiptRepository;
 getDeal(id:string):Promise<Deal|null>; listDeals():Promise<readonly Deal[]>;
 getVersion(id:string):Promise<DealVersion|null>; listVersions(dealId:string):Promise<readonly DealVersion[]>;
 constraints(versionId:string):Promise<ConstraintSet>;
 proofs(dealId:string):Promise<readonly {proof:DealProofDto;status:string}[]>;
 runs(dealId:string):Promise<readonly CanonicalJsonValue[]>;
 getProof(id:string):Promise<{proof:DealProofDto;status:string}|null>;
 loadErp():Promise<ErpState>; listCommitments():Promise<readonly StoredCommitment[]>;
 insertDeal(deal:Deal):Promise<void>; insertVersion(version:DealVersion):Promise<void>;
 insertConstraint(row:CommercialConstraint,versionId:string,position:number):Promise<void>;
 adoptVersion(deal:Deal,version:DealVersion,status:Deal['status']):Promise<void>;
 setStatus(deal:Deal,status:Deal['status']):Promise<void>;
 recordEvidence(write:WorkflowEvidence):Promise<void>; insertApproval(row:ApprovalRecord):Promise<void>;
 saveErp(state:ErpState):Promise<void>; advanceRevision():Promise<number>;
 markReplayed(id:string):Promise<void>;
}
export interface WorkflowPort { transact<T>(context:MutationContext,work:(tx:WorkflowTransaction)=>Promise<T>):Promise<T> }
export class WorkflowError extends Error { constructor(readonly code:string,readonly httpStatus=409){super(code);} }
export interface WorkflowRuntime {
 execute(operation:string,context:MutationContext,input:Record<string,unknown>):Promise<OperationResponse>;
 read(context:MutationContext,dealId:string|null):Promise<OperationResponse>;
 readonly commitmentPort:CommitmentPort;
}
