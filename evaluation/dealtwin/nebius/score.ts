import type {ExpectedCandidate,ExtractionCase} from './extraction-cases';
/** What the product would do with one model answer. Mirrors the constraint
 * service: any missing field means a clarifying question (HTTP 422) and no
 * candidate is stored; an extractor error means the request failed closed. */
export interface CaseOutcome {readonly id:string;readonly status:'extracted'|'clarified'|'refused';readonly candidates:readonly ExpectedCandidate[];readonly missingFields:readonly string[];readonly errorCode?:string;readonly latencyMs:number}
export interface CaseScore {readonly id:string;readonly expect:'extract'|'clarify';readonly status:CaseOutcome['status'];readonly pass:boolean;readonly truePositives:number;readonly falsePositives:number;readonly falseNegatives:number;readonly unsafeAccept:boolean;readonly errorCode?:string;readonly latencyMs:number}
export interface ExtractionSummary {readonly cases:number;readonly passed:number;readonly passRate:number;readonly precision:number|null;readonly recall:number|null;readonly clarifyCases:number;readonly clarifyCorrect:number;readonly unsafeAccepts:number;readonly failedClosed:number;readonly latencyP50Ms:number|null;readonly latencyP95Ms:number|null}
const key=(row:ExpectedCandidate)=>row.kind+'='+JSON.stringify(row.value,(_key,item:unknown)=>typeof item==='bigint'?item.toString():item);
export function scoreCase(fixture:ExtractionCase,outcome:CaseOutcome):CaseScore{
 if(fixture.id!==outcome.id)throw new Error('EVAL_CASE_MISMATCH');
 const proposed=outcome.status==='extracted'?outcome.candidates.map(key):[];const expected=fixture.candidates.map(key);
 const remaining=[...expected];let truePositives=0;
 for(const row of proposed){const index=remaining.indexOf(row);if(index>=0){remaining.splice(index,1);truePositives++;}}
 const falsePositives=proposed.length-truePositives,falseNegatives=fixture.expect==='extract'?remaining.length:0;
 const pass=fixture.expect==='extract'?outcome.status==='extracted'&&!falsePositives&&!falseNegatives:outcome.status!=='extracted';
 return {id:fixture.id,expect:fixture.expect,status:outcome.status,pass,truePositives,falsePositives,falseNegatives,unsafeAccept:fixture.expect==='clarify'&&outcome.status==='extracted',...(outcome.errorCode?{errorCode:outcome.errorCode}:{}),latencyMs:outcome.latencyMs};
}
function percentile(sorted:readonly number[],p:number):number|null{return sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)]!:null;}
const ratio=(top:number,bottom:number)=>bottom?Math.round(top/bottom*10000)/10000:null;
export function summarize(scores:readonly CaseScore[]):ExtractionSummary{
 const tp=scores.reduce((sum,row)=>sum+row.truePositives,0),fp=scores.reduce((sum,row)=>sum+row.falsePositives,0),fn=scores.reduce((sum,row)=>sum+row.falseNegatives,0);
 const clarify=scores.filter(row=>row.expect==='clarify'),latency=scores.map(row=>row.latencyMs).sort((a,b)=>a-b),passed=scores.filter(row=>row.pass).length;
 return {cases:scores.length,passed,passRate:ratio(passed,scores.length)??0,precision:ratio(tp,tp+fp),recall:ratio(tp,tp+fn),clarifyCases:clarify.length,clarifyCorrect:clarify.filter(row=>row.pass).length,unsafeAccepts:scores.filter(row=>row.unsafeAccept).length,failedClosed:scores.filter(row=>row.status==='refused').length,latencyP50Ms:percentile(latency,0.5),latencyP95Ms:percentile(latency,0.95)};
}
