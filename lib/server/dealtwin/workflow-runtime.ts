import type { Pool } from 'pg';
import { createPostgresPool } from '../postgres/pool';
import { parsePostgresConfig,assertDisposableJudgeDatabaseUrl } from '../postgres/config';
import { createPostgresWorkflowPort } from '../postgres/postgres-workflow-port';
import { createPostgresCommitmentPort,createPostgresCommitmentService } from '../postgres/postgres-commitment-service';
import type { SelfReservationIdentity } from '../../dealtwin/domain/commitment';
import { createPostgresApplicationPorts } from '../postgres/postgres-dealtwin-repository';
import { DealApplicationService } from '../../dealtwin/application/deal-service';
import { ProofApplicationService } from '../../dealtwin/application/proof-service';
import { ConstraintService } from '../../dealtwin/application/constraint-service';
import { JudgeObligationService } from '../../dealtwin/application/judge-obligation-service';
import { decideApproval } from '../../dealtwin/application/approval-service';
import { fail } from '../../dealtwin/application/workflow-mutation';
import type { WorkflowRuntime } from '../../dealtwin/application/workflow-port';
import type { CanonicalJsonValue } from '../../dealtwin/domain/canonical-json';
import {NemotronConstraintExtractor,type ConstraintExtractionPort} from '../../dealtwin/ai/constraint-extractor';
import {NemotronClient} from '../../dealtwin/ai/nemotron-client';
export function createPostgresWorkflowRuntime(pool:Pool,options?:{extractor?:ConstraintExtractionPort}):WorkflowRuntime {
 const port=createPostgresWorkflowPort(pool);const deals=new DealApplicationService(port);const proofs=new ProofApplicationService(port);
 const extractor=options?.extractor??{extract:(input:Parameters<ConstraintExtractionPort['extract']>[0])=>new NemotronConstraintExtractor(new NemotronClient({apiKey:process.env.NEBIUS_API_KEY??'',model:process.env.NEBIUS_MODEL??'',enabled:process.env.DEALTWIN_NEBIUS_LIVE_ENABLED==='true'})).extract(input)};
 const constraints=new ConstraintService(port,extractor);const obligation=new JudgeObligationService(port);
 const commitments=createPostgresCommitmentService(pool);
 const text=(value:unknown)=>{if(typeof value!=='string')fail('INVALID_REQUEST',422);return value;};
 return {commitmentPort:createPostgresCommitmentPort(pool),read:(context,id)=>deals.read(context,id),
  async execute(operation,context,input){
   const target=typeof input.target==='string'?input.target:undefined;
   switch(operation){
    case 'create':return deals.create(context,{title:text(input.title),terms:input.terms as CanonicalJsonValue});
    case 'edit':return deals.edit(context,{dealId:text(target),dealVersionId:text(input.dealVersionId),terms:input.terms as CanonicalJsonValue});
    case 'compile':return deals.compile(context,text(input.dealVersionId),target);
    case 'generate':return proofs.generate(context,text(input.dealVersionId),target);
    case 'recompile':return deals.recompile(context,text(input.dealVersionId),target);
    case 'replay':return proofs.replay(context,text(target));
    case 'stress':return proofs.stress(context,text(target),input.scenarios as CanonicalJsonValue[]);
    case 'replace':return commitments.replaceReservation(context,{commitmentId:text(target),previous:input.previous as SelfReservationIdentity,replacement:input.replacement as SelfReservationIdentity});
    case 'confirm':return constraints.confirmConstraints(context,{dealId:text(target),dealVersionId:text(input.dealVersionId),constraintIds:input.constraintIds as string[]});
    case 'extract':return constraints.extractConstraints(context,{dealId:text(target),dealVersionId:text(input.dealVersionId),text:text(input.text)});
    case 'obligation':return obligation.mutateJudgeObligation(context,{invoiceId:text(target) as 'judge-existing-ap',amountRupiah:text(input.amountRupiah) as '19000000'});
    case 'approval':return decideApproval(createPostgresApplicationPorts(pool),context,{approvalId:text(target),proofId:text(input.proofId),dealVersionId:text(input.dealVersionId),decision:input.decision as 'approved'|'rejected',comment:text(input.comment)});
    default:fail('UNSUPPORTED_OPERATION',422);
   }
  },
 };
}
let runtime:WorkflowRuntime|undefined;
export function getWorkflowRuntime():WorkflowRuntime {
 if(runtime)return runtime;const config=parsePostgresConfig();assertDisposableJudgeDatabaseUrl(config.connectionString);
 runtime=createPostgresWorkflowRuntime(createPostgresPool(config));return runtime;
}
