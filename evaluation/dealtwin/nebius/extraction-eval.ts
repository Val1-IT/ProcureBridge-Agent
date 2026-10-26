import {ExtractionError,type ConstraintExtractionPort,type ConstraintProvider} from '../../../lib/dealtwin/ai/constraint-extractor';
import {PROMPT_VERSION} from '../../../lib/dealtwin/ai/prompt';
import {extractionCases,extractionContext,type ExtractionCase} from './extraction-cases';
import {scoreCase,summarize,type CaseOutcome,type CaseScore,type ExtractionSummary} from './score';
export const EXTRACTION_EVAL_VERSION='dealtwin.nebius.extraction-eval.v1';
/** `thinking` is whether the model was asked to reason before answering; null
 * when no model was called (offline oracle) or the caller did not say. */
export interface ExtractionEvalReport {readonly evalVersion:string;readonly caseSet:'tuning'|'heldout';readonly mode:'live'|'offline-oracle';readonly provider:string|null;readonly model:string|null;readonly promptVersion:string;readonly thinking:boolean|null;readonly startedAt:string;readonly finishedAt:string;readonly summary:ExtractionSummary;readonly cases:readonly CaseScore[]}
/** Runs every labelled case through the production extractor, one at a time.
 * Serial on purpose: latency is measured per request and the live provider is
 * never sent concurrent load from this harness. */
export async function runExtractionEval(extractor:ConstraintExtractionPort,options:{mode:ExtractionEvalReport['mode'];caseSet?:ExtractionEvalReport['caseSet'];cases?:readonly ExtractionCase[];thinking?:boolean;now?:()=>Date;clock?:()=>number}):Promise<ExtractionEvalReport>{
 const cases=options.cases??extractionCases,now=options.now??(()=>new Date()),clock=options.clock??(()=>performance.now());
 const startedAt=now().toISOString(),scores:CaseScore[]=[];let provider:string|null=null,model:string|null=null;
 for(const fixture of cases){
  const started=clock();let outcome:CaseOutcome;
  try{
   const result=await extractor.extract({text:fixture.text,confirmedConstraints:[],context:extractionContext as never});
   provider=result.metadata.provider;model=result.metadata.model;
   outcome={id:fixture.id,status:result.missingFields.length?'clarified':'extracted',candidates:result.candidates.map(row=>({kind:row.kind,value:row.value as never})),missingFields:[...result.missingFields],latencyMs:Math.round(clock()-started)};
  }catch(error){
   // Provider authorization and configuration faults abort the run: scoring them
   // as "failed closed" would report a broken setup as a safe model.
   if(error instanceof ExtractionError&&['LIVE_PROVIDER_NOT_AUTHORIZED','INVALID_PROVIDER_CONFIG'].includes(error.code))throw error;
   outcome={id:fixture.id,status:'refused',candidates:[],missingFields:[],errorCode:error instanceof ExtractionError?error.code:'UNEXPECTED_EXTRACTION_ERROR',latencyMs:Math.round(clock()-started)};
  }
  scores.push(scoreCase(fixture,outcome));
 }
 return {evalVersion:EXTRACTION_EVAL_VERSION,caseSet:options.caseSet??'tuning',mode:options.mode,provider,model,promptVersion:PROMPT_VERSION,thinking:options.thinking??null,startedAt,finishedAt:now().toISOString(),summary:summarize(scores),cases:scores};
}
/** Offline stand-in that answers each case from its human label. It proves the
 * harness, scoring and schema path work end to end; it says nothing about
 * model accuracy and its reports are labelled `offline-oracle`. */
export function oracleProvider(cases:readonly ExtractionCase[]=extractionCases):ConstraintProvider{
 return {complete:async({user})=>{
  const text=(JSON.parse(user) as {text:string}).text,fixture=cases.find(row=>row.text===text);if(!fixture)throw new Error('ORACLE_UNKNOWN_CASE');
  const reply=fixture.expect==='extract'?{candidates:fixture.candidates.map(row=>({kind:row.kind,value:row.value,sourceText:text})),missingFields:[]}:{candidates:[],missingFields:['clarification required']};
  return {provider:'offline-oracle',model:'label-oracle-v1',content:JSON.stringify({schemaVersion:'dealtwin.constraint-extraction.v1',...reply})};
 }};
}
