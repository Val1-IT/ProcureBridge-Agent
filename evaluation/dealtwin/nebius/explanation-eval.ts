import {ExtractionError,type ConstraintProvider} from '../../../lib/dealtwin/ai/constraint-extractor';
import {EXPLAIN_PROMPT_VERSION,NemotronVerdictExplainer,templateExplanation,type FactKey,type VerdictFact,type VerdictFacts} from '../../../lib/dealtwin/ai/verdict-explainer';
import type {ExplainLanguage} from '../../../lib/dealtwin/alexa/intents';
export const EXPLANATION_EVAL_VERSION='dealtwin.nebius.explanation-eval.v1';
const r=(value:string):VerdictFact=>({kind:'rupiah',value}),d=(value:string):VerdictFact=>({kind:'date',value});
const failing=(values:Partial<Record<FactKey,VerdictFact>>):VerdictFacts=>({outcome:'DOES_NOT_COMPILE',deal:'deal A',values});
/** Synthetic verdicts covering the shapes the compiler produces: a supplier paid
 * before the customer, a deal whose deposit cannot cover old bills, no customer
 * balance inside the horizon, and passing deals. Written 2026-10-26. */
export const explanationCases:readonly {id:string;facts:VerdictFacts}[]=[
 {id:'supplier-before-balance',facts:failing({violationDate:d('2026-09-22'),shortfall:r('3000000'),cashFloor:r('5000000'),lowestBalance:r('2000000'),supplierPaid:r('11000000'),supplierDate:d('2026-09-20'),depositAmount:r('6000000'),depositDate:d('2026-09-15'),balanceAmount:r('24000000'),balanceDate:d('2026-10-14'),otherBills:r('18000000')})},
 {id:'large-shortfall',facts:failing({violationDate:d('2026-11-03'),shortfall:r('42500000'),cashFloor:r('10000000'),lowestBalance:r('-32500000'),supplierPaid:r('60000000'),supplierDate:d('2026-11-01'),balanceAmount:r('75000000'),balanceDate:d('2026-12-01')})},
 {id:'old-bills-only',facts:failing({violationDate:d('2026-10-05'),shortfall:r('1250000'),cashFloor:r('5000000'),lowestBalance:r('3750000'),depositAmount:r('4000000'),depositDate:d('2026-10-01'),otherBills:r('22000000')})},
 {id:'no-balance-in-horizon',facts:failing({violationDate:d('2026-12-15'),shortfall:r('7000000'),cashFloor:r('3000000'),lowestBalance:r('-4000000'),supplierPaid:r('15000000'),supplierDate:d('2026-12-10')})},
 {id:'same-day',facts:failing({violationDate:d('2026-09-30'),shortfall:r('500000'),cashFloor:r('2000000'),lowestBalance:r('1500000'),supplierPaid:r('9000000'),supplierDate:d('2026-09-30'),balanceAmount:r('12000000'),balanceDate:d('2026-10-30')})},
 {id:'deposit-too-small',facts:failing({violationDate:d('2027-01-12'),shortfall:r('2800000'),cashFloor:r('8000000'),lowestBalance:r('5200000'),supplierPaid:r('20000000'),supplierDate:d('2027-01-10'),depositAmount:r('3000000'),depositDate:d('2027-01-05'),balanceAmount:r('27000000'),balanceDate:d('2027-02-04')})},
 {id:'minimal-facts',facts:failing({violationDate:d('2026-10-20'),shortfall:r('900000'),cashFloor:r('1000000')})},
 {id:'two-suppliers',facts:failing({violationDate:d('2026-11-18'),shortfall:r('6300000'),cashFloor:r('4000000'),lowestBalance:r('-2300000'),supplierPaid:r('31000000'),supplierDate:d('2026-11-10'),depositAmount:r('9000000'),depositDate:d('2026-11-08'),balanceAmount:r('36000000'),balanceDate:d('2026-12-08'),otherBills:r('5000000')})},
 {id:'passes-at-floor',facts:{outcome:'COMPILES',deal:'deal A',values:{cashFloor:r('5000000'),lowestBalance:r('5000000')}}},
 {id:'passes-comfortably',facts:{outcome:'CONDITIONALLY_VALID',deal:'deal B',values:{cashFloor:r('5000000'),lowestBalance:r('14200000')}}},
];
export interface ExplanationCaseScore {readonly id:string;readonly language:ExplainLanguage;readonly accepted:boolean;readonly errorCode?:string;readonly namesCause:boolean|null;readonly sentences:readonly string[];readonly latencyMs:number}
export interface ExplanationEvalReport {readonly evalVersion:string;readonly mode:'live'|'offline-template';readonly model:string|null;readonly promptVersion:string;readonly startedAt:string;readonly finishedAt:string;
 readonly summary:{readonly calls:number;readonly accepted:number;readonly fellBack:number;readonly fallbackCodes:Record<string,number>;readonly namesCause:number;readonly causeCases:number;readonly latencyP50Ms:number|null;readonly latencyP95Ms:number|null};readonly cases:readonly ExplanationCaseScore[]}
const causeKeys:FactKey[]=['supplierPaid','supplierDate','balanceAmount','balanceDate','depositAmount','otherBills'];
/** Every explanation the product would show either came from Nemotron and passed
 * the grounding checks, or fell back to the template. `namesCause` asks whether
 * an accepted failing explanation cites at least one timing fact, not only the
 * shortfall; it is null for passing verdicts. Serial, like the extraction eval. */
export async function runExplanationEval(provider:ConstraintProvider,options:{mode:ExplanationEvalReport['mode'];now?:()=>Date;clock?:()=>number}):Promise<ExplanationEvalReport>{
 const now=options.now??(()=>new Date()),clock=options.clock??(()=>performance.now()),explainer=new NemotronVerdictExplainer(provider);
 const startedAt=now().toISOString(),cases:ExplanationCaseScore[]=[];let model:string|null=null;
 for(const fixture of explanationCases)for(const language of ['en','id'] as const){
  const started=clock(),bad=fixture.facts.outcome==='DOES_NOT_COMPILE',hasCause=causeKeys.some(key=>fixture.facts.values[key]);
  try{
   const result=await explainer.explain(fixture.facts,language);model=result.metadata.model;
   const cites=result.template.some(sentence=>causeKeys.some(key=>sentence.includes(`{${key}}`)));
   cases.push({id:fixture.id,language,accepted:true,namesCause:bad&&hasCause?cites:null,sentences:result.sentences,latencyMs:Math.round(clock()-started)});
  }catch(error){
   if(error instanceof ExtractionError&&['LIVE_PROVIDER_NOT_AUTHORIZED','INVALID_PROVIDER_CONFIG'].includes(error.code))throw error;
   cases.push({id:fixture.id,language,accepted:false,errorCode:error instanceof ExtractionError?error.code:'UNEXPECTED_EXPLANATION_ERROR',namesCause:null,sentences:[],latencyMs:Math.round(clock()-started)});
  }
 }
 const latency=cases.map(row=>row.latencyMs).sort((a,b)=>a-b),pick=(p:number)=>latency.length?latency[Math.min(latency.length-1,Math.ceil(p*latency.length)-1)]!:null;
 const fallbackCodes:Record<string,number>={};for(const row of cases)if(row.errorCode)fallbackCodes[row.errorCode]=(fallbackCodes[row.errorCode]??0)+1;
 const cause=cases.filter(row=>row.namesCause!==null);
 return {evalVersion:EXPLANATION_EVAL_VERSION,mode:options.mode,model,promptVersion:EXPLAIN_PROMPT_VERSION,startedAt,finishedAt:now().toISOString(),
  summary:{calls:cases.length,accepted:cases.filter(row=>row.accepted).length,fellBack:cases.filter(row=>!row.accepted).length,fallbackCodes,namesCause:cause.filter(row=>row.namesCause).length,causeCases:cause.length,latencyP50Ms:pick(0.5),latencyP95Ms:pick(0.95)},cases};
}
/** Offline stand-in that answers with the deterministic template; it proves the harness only. */
export function templateProvider():ConstraintProvider{
 return {complete:async({user})=>{
  const input=JSON.parse(user) as {language:ExplainLanguage;verdict:VerdictFacts['outcome'];deal:string;facts:{placeholder:string}[]};
  const fixture=explanationCases.find(row=>row.facts.outcome===input.verdict&&Object.keys(row.facts.values).length===input.facts.length&&input.facts.every(fact=>row.facts.values[fact.placeholder.slice(1,-1) as FactKey]));
  if(!fixture)throw new Error('TEMPLATE_UNKNOWN_CASE');
  return {provider:'offline-template',model:'template-v1',content:JSON.stringify({schemaVersion:'dealtwin.verdict-explanation.v1',language:input.language,sentences:templateExplanation(fixture.facts,input.language)})};
 }};
}
