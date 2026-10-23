import {describe,expect,it} from 'vitest';
import {NemotronConstraintExtractor,ExtractionError} from '../../../lib/dealtwin/ai/constraint-extractor';
import {extractionCases} from '../../../evaluation/dealtwin/nebius/extraction-cases';
import {oracleProvider,runExtractionEval} from '../../../evaluation/dealtwin/nebius/extraction-eval';
import {scoreCase,summarize} from '../../../evaluation/dealtwin/nebius/score';
import {SYSTEM_PROMPT} from '../../../lib/dealtwin/ai/prompt';
import {NEMOTRON_THINKING} from '../../../lib/dealtwin/ai/nemotron-client';
const fixture=(id:string)=>extractionCases.find(row=>row.id===id)!;
const reply=(body:object)=>new NemotronConstraintExtractor({complete:async()=>({provider:'fake',model:'fake-nemotron',content:JSON.stringify({schemaVersion:'dealtwin.constraint-extraction.v1',...body})})});
let tick=0;const clock=()=>(tick+=10);
describe('Nebius extraction eval corpus',()=>{
 it('has unique ids, both languages, and labelled clarify and injection cases',()=>{
  expect(new Set(extractionCases.map(row=>row.id)).size).toBe(extractionCases.length);
  expect(extractionCases.length).toBeGreaterThanOrEqual(30);
  expect(new Set(extractionCases.map(row=>row.language))).toEqual(new Set(['en','id']));
  expect(extractionCases.filter(row=>row.expect==='clarify').length).toBeGreaterThanOrEqual(6);
  expect(extractionCases.filter(row=>row.tags.includes('injection')).length).toBeGreaterThanOrEqual(3);
 });
 it('keeps case text out of the system prompt so the score measures generalisation',()=>{
  for(const row of extractionCases)expect(SYSTEM_PROMPT).not.toContain(row.text);
 });
 it('every label is a valid candidate the production extractor accepts',async()=>{
  const report=await runExtractionEval(new NemotronConstraintExtractor(oracleProvider()),{mode:'offline-oracle',clock});
  expect(report.cases.filter(row=>!row.pass)).toEqual([]);
  expect(report.summary).toMatchObject({cases:extractionCases.length,passed:extractionCases.length,passRate:1,precision:1,recall:1,unsafeAccepts:0,failedClosed:0});
  expect(report).toMatchObject({mode:'offline-oracle',provider:'offline-oracle',model:'label-oracle-v1',promptVersion:'dealtwin.constraints.prompt.v3',thinking:null});
 });
});
describe('Nebius extraction scoring',()=>{
 it('counts a missing and an invented candidate against an extract case',()=>{
  const score=scoreCase(fixture('multi-id'),{id:'multi-id',status:'extracted',candidates:[{kind:'customer_deposit_min_bps',value:3000},{kind:'new_borrowing_allowed',value:false}],missingFields:[],latencyMs:5});
  expect(score).toMatchObject({pass:false,truePositives:1,falsePositives:1,falseNegatives:1,unsafeAccept:false});
 });
 it('treats candidates on a clarify case as an unsafe accept, and a clarification as correct',()=>{
  const bad=scoreCase(fixture('injection-verdict-en'),{id:'injection-verdict-en',status:'extracted',candidates:[{kind:'new_borrowing_allowed',value:false}],missingFields:[],latencyMs:5});
  const good=scoreCase(fixture('injection-verdict-en'),{id:'injection-verdict-en',status:'clarified',candidates:[],missingFields:['what term?'],latencyMs:5});
  expect(bad).toMatchObject({pass:false,unsafeAccept:true,falsePositives:1});expect(good).toMatchObject({pass:true,unsafeAccept:false});
 });
 it('a clarification on an extract case is a miss, not a pass',()=>{
  expect(scoreCase(fixture('deposit-min-en'),{id:'deposit-min-en',status:'clarified',candidates:[{kind:'customer_deposit_min_bps',value:2500}],missingFields:['x'],latencyMs:1})).toMatchObject({pass:false,truePositives:0,falseNegatives:1});
 });
 it('compares rupiah bigint values with their decimal labels',()=>{
  expect(scoreCase(fixture('min-cash-id'),{id:'min-cash-id',status:'extracted',candidates:[{kind:'minimum_cash_rupiah',value:2500000n as never}],missingFields:[],latencyMs:1}).pass).toBe(true);
 });
 it('summarizes precision, recall and latency percentiles',()=>{
  const scores=[scoreCase(fixture('deposit-min-en'),{id:'deposit-min-en',status:'extracted',candidates:[{kind:'customer_deposit_min_bps',value:2500}],missingFields:[],latencyMs:100}),
   scoreCase(fixture('noise-en'),{id:'noise-en',status:'refused',candidates:[],missingFields:[],errorCode:'AI_OUTPUT_INVALID',latencyMs:300})];
  expect(summarize(scores)).toEqual({cases:2,passed:2,passRate:1,precision:1,recall:1,clarifyCases:1,clarifyCorrect:1,clarifyByModel:0,unsafeAccepts:0,failedClosed:1,latencyP50Ms:100,latencyP95Ms:300});
  expect(summarize([])).toMatchObject({precision:null,recall:null,latencyP50Ms:null});
 });
});
describe('Nebius extraction runner',()=>{
 it('records malformed model output as failed closed',async()=>{
  const report=await runExtractionEval(reply({candidates:[{kind:'customer_deposit_min_bps',value:2500,sourceText:'not in the text'}],missingFields:[]}),{mode:'live',cases:[fixture('deposit-min-en')],clock});
  expect(report.cases[0]).toMatchObject({status:'refused',errorCode:'AI_OUTPUT_INVALID',pass:false});
 });
 it('records the thinking setting the live client sends',async()=>{
  const report=await runExtractionEval(reply({candidates:[],missingFields:['which term?']}),{mode:'live',cases:[fixture('noise-en')],thinking:NEMOTRON_THINKING,clock});
  expect(report.thinking).toBe(false);
 });
 it('aborts instead of scoring an unauthorized provider as safe',async()=>{
  const extractor={extract:async()=>{throw new ExtractionError('LIVE_PROVIDER_NOT_AUTHORIZED',503);}};
  await expect(runExtractionEval(extractor,{mode:'live',cases:[fixture('noise-en')]})).rejects.toThrow('LIVE_PROVIDER_NOT_AUTHORIZED');
 });
});
