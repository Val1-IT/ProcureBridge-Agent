import {describe,expect,it} from 'vitest';
import {parseIntent} from '../../../lib/dealtwin/alexa/intents';
import {EXPLAIN_PROMPT_VERSION,EXPLAIN_SCHEMA_VERSION,NemotronVerdictExplainer,checkExplanation,fillFacts,renderFact,templateExplanation,timelineOf,verdictExplainerFromEnv,type VerdictFacts} from '../../../lib/dealtwin/ai/verdict-explainer';
import {latestBaseRun,verdictFacts} from '../../../lib/dealtwin/ai/verdict-facts';
import {ExtractionError,type ConstraintProvider} from '../../../lib/dealtwin/ai/constraint-extractor';
import {runAlexaTurn,type AlexaPorts} from '../../../lib/server/dealtwin/alexa-orchestrator';
import type {AlexaPendingAction} from '../../../lib/server/dealtwin/alexa-ticket';

const event=(eventId:string,date:string,direction:'inflow'|'outflow',amountRupiah:string,own:boolean)=>({eventId,date,direction,amountRupiah,certainty:'expected',eventClass:own?'projected':'projected',dependencyKey:own?`deal:event:${eventId}`:`erp:ap:${eventId}`});
/** A stored base run shaped like get_deal's compileRuns rows (to_jsonb of dealtwin_compile_runs). */
const run={id:'run-2',deal_version_id:'version-3',kind:'base',outcome:'DOES_NOT_COMPILE',cash_floor_rupiah:5000000,shortfall_rupiah:3000000,worst_minimum_rupiah:2000000,
 first_violation_date:'2026-09-22',created_at:'2026-09-14T10:00:00Z',violation_data:{timeline:{events:[
  event('opening','2026-09-14','inflow','20000000',false),event('deposit','2026-09-15','inflow','6000000',true),event('existing-ap','2026-09-15','outflow','18000000',false),
  event('supplier','2026-09-20','outflow','11000000',true),event('balance','2026-10-14','inflow','24000000',true)]}}};
const facts=verdictFacts(run,'deal A')!;
const reply=(sentences:string[],language='en')=>JSON.stringify({schemaVersion:EXPLAIN_SCHEMA_VERSION,language,sentences});
const provider=(content:string):ConstraintProvider&{calls:{system:string;user:string}[]}=>{const calls:{system:string;user:string}[]=[];
 return {calls,complete:async input=>{calls.push(input);return {content,provider:'nebius',model:'nvidia/nemotron-fake'};}};};

describe('verdict facts from a stored compile run',()=>{
 it('reads the compiler figures and regroups its own events around the violation day',()=>{
  expect(facts.outcome).toBe('DOES_NOT_COMPILE');
  expect(facts.values).toEqual({cashFloor:{kind:'rupiah',value:'5000000'},lowestBalance:{kind:'rupiah',value:'2000000'},violationDate:{kind:'date',value:'2026-09-22'},
   shortfall:{kind:'rupiah',value:'3000000'},supplierPaid:{kind:'rupiah',value:'11000000'},supplierDate:{kind:'date',value:'2026-09-20'},
   depositAmount:{kind:'rupiah',value:'6000000'},depositDate:{kind:'date',value:'2026-09-15'},balanceAmount:{kind:'rupiah',value:'24000000'},balanceDate:{kind:'date',value:'2026-10-14'},
   otherBills:{kind:'rupiah',value:'18000000'}});
 });
 it('picks the latest base run of the current version only',()=>{
  const rows=[{...run,id:'run-1',created_at:'2026-09-13T10:00:00Z'},run,{...run,id:'run-3',kind:'stress',created_at:'2026-09-15T10:00:00Z'},{...run,id:'run-4',deal_version_id:'version-2',created_at:'2026-09-16T10:00:00Z'}];
  expect(latestBaseRun(rows,'version-3')?.id).toBe('run-2');expect(latestBaseRun(rows,'version-9')).toBeNull();
 });
 it('refuses a failing run without its violation date or shortfall',()=>{
  expect(verdictFacts({...run,first_violation_date:null},'deal A')).toBeNull();expect(verdictFacts({...run,outcome:'UNRESOLVED'},'deal A')).toBeNull();
 });
});

describe('Nemotron verdict explanation',()=>{
 it('accepts words with placeholders and fills every figure from the compile run',async()=>{
  const fake=provider(reply(['On {violationDate} your cash drops {shortfall} under your floor of {cashFloor}.','The supplier gets {supplierPaid} before the customer pays {balanceAmount} on {balanceDate}.','Ask what would make it work.']));
  const result=await new NemotronVerdictExplainer(fake).explain(facts,'en');
  expect(result.sentences).toEqual(['On September 22 your cash drops Rp 3,000,000 under your floor of Rp 5,000,000.','The supplier gets Rp 11,000,000 before the customer pays Rp 24,000,000 on October 14.','Ask what would make it work.']);
  expect(result.spoken).toContain('3 million rupiah');
  expect(result.metadata).toEqual({provider:'nebius',model:'nvidia/nemotron-fake',promptVersion:EXPLAIN_PROMPT_VERSION,schemaVersion:EXPLAIN_SCHEMA_VERSION});
  // The model is told the facts, but only as placeholders it may use; the prompt forbids writing figures.
  const sent=JSON.parse(fake.calls[0]!.user) as {facts:{placeholder:string}[]};
  expect(sent.facts.map(row=>row.placeholder)).toContain('{shortfall}');expect(fake.calls[0]!.system).toMatch(/Never write digits/);
 });
 it('renders Indonesian amounts and dates',async()=>{
  const result=await new NemotronVerdictExplainer(provider(reply(['Pada {violationDate} kas Anda kurang {shortfall} dari batas minimum {cashFloor}.'],'id'))).explain(facts,'id');
  expect(result.sentences).toEqual(['Pada 22 September kas Anda kurang Rp3.000.000 dari batas minimum Rp5.000.000.']);
  expect(result.spoken).toBe('Pada 22 September kas Anda kurang 3 juta rupiah dari batas minimum 5 juta rupiah.');
 });
 it.each([
  ['a digit','On {violationDate} you are 3000000 short, {shortfall}.','AI_UNGROUNDED_NUMBER'],
  ['a number word','On {violationDate} you are three million short, {shortfall}.','AI_UNGROUNDED_NUMBER'],
  ['a percentage','Raise the deposit by {shortfall} or 5%, from {violationDate}.','AI_UNGROUNDED_NUMBER'],
  ['a month name','On September {violationDate} you are {shortfall} short.','AI_UNGROUNDED_NUMBER'],
  ['a currency word','On {violationDate} you are Rp {shortfall} short.','AI_UNGROUNDED_NUMBER'],
  ['an Indonesian number word','Pada {violationDate} kurang tiga juta, {shortfall}.','AI_UNGROUNDED_NUMBER'],
  ['an unknown placeholder','On {violationDate} you owe {interest}, {shortfall}.','AI_FACT_UNKNOWN'],
  ['a malformed placeholder','On {violationDate} you are {short fall} short, {shortfall}.','AI_UNGROUNDED_NUMBER'],
  ['no shortfall','On {violationDate} cash is below {cashFloor}.','AI_FACT_MISSING'],
 ])('fails closed on %s',(_name,sentence,code)=>{
  expect(()=>checkExplanation(reply([sentence]),facts,'en')).toThrow(code);
 });
 it.each([
  ['wrong language',reply(['Pada {violationDate} kurang {shortfall}.'],'id')],
  ['extra keys',JSON.stringify({schemaVersion:EXPLAIN_SCHEMA_VERSION,language:'en',sentences:['On {violationDate} {shortfall}.'],verdict:'COMPILES'})],
  ['too many sentences',reply(Array(5).fill('On {violationDate} {shortfall}.'))],
  ['an overlong sentence',reply(['On {violationDate} you are {shortfall} short'+' and short'.repeat(40)+'.'])],
  ['not JSON','On {violationDate} you are {shortfall} short.'],
 ])('rejects %s as invalid output',(_name,content)=>{
  expect(()=>checkExplanation(content,facts,'en')).toThrow('AI_OUTPUT_INVALID');
 });
 it('accepts a whole timeline told in one long sentence',()=>{
  const sentence='The customer deposit of {depositAmount} arrived on {depositDate}, then the deal paid suppliers {supplierPaid} by {supplierDate}, and on {violationDate} cash fell {shortfall} below the cash floor of {cashFloor}, finally the customer balance of {balanceAmount} arrived on {balanceDate}.';
  expect(sentence.length).toBeGreaterThan(280);expect(checkExplanation(reply([sentence]),facts,'en')).toEqual([sentence]);
 });
 it('allows the verb "may" but not the Indonesian month',()=>{
  expect(checkExplanation(reply(['On {violationDate} you are {shortfall} short; you may ask what would fix it.']),facts,'en')).toHaveLength(1);
  expect(()=>checkExplanation(reply(['Pada Mei {violationDate} kurang {shortfall}.'],'id'),facts,'id')).toThrow('AI_UNGROUNDED_NUMBER');
 });
 it('keeps the deterministic template grounded by the same rules',()=>{
  for(const language of ['en','id'] as const){
   const template=templateExplanation(facts,language);
   expect(checkExplanation(reply(template,language),facts,language)).toEqual(template);
   expect(fillFacts(template,facts,language).join(' ')).not.toMatch(/\{/);
  }
  const passing:VerdictFacts={outcome:'COMPILES',deal:'deal A',values:{cashFloor:{kind:'rupiah',value:'5000000'},lowestBalance:{kind:'rupiah',value:'5000000'}}};
  expect(fillFacts(templateExplanation(passing,'en'),passing,'en')).toEqual(['Your projected cash never falls below your cash floor of Rp 5,000,000; at its lowest it is Rp 5,000,000.']);
 });
 it('formats non-round and negative amounts without rounding them',()=>{
  expect(renderFact({kind:'rupiah',value:'2750000'},'en',true)).toBe('2.75 million rupiah');
  expect(renderFact({kind:'rupiah',value:'1234567'},'id',true)).toBe('Rp1.234.567');
  expect(renderFact({kind:'rupiah',value:'-400000'},'en')).toBe('-Rp 400,000');
 });
 it('hands the model the events already in date order',()=>{
  expect(timelineOf(facts).map(row=>row.when)).toEqual(['{depositDate}','{supplierDate}','{violationDate}','{balanceDate}']);
  const sameDay:VerdictFacts={...facts,values:{...facts.values,supplierDate:{kind:'date',value:'2026-09-22'},depositDate:{kind:'date',value:'2026-09-22'}}};
  expect(timelineOf(sameDay).map(row=>row.when)).toEqual(['{depositDate}','{supplierDate}','{violationDate}','{balanceDate}']);
  expect(timelineOf(facts)[2]!.what).toContain('{otherBills}');
 });
 it('is off unless the live provider is enabled',()=>{
  expect(verdictExplainerFromEnv({})).toBeUndefined();
  expect(verdictExplainerFromEnv({DEALTWIN_NEBIUS_LIVE_ENABLED:'true',NEBIUS_API_KEY:'k',NEBIUS_MODEL:'nvidia/nemotron-x'})).toBeInstanceOf(NemotronVerdictExplainer);
 });
});

describe('explain turn',()=>{
 it.each([['Why does deal A not work?','en'],['Explain it in Indonesian.','id'],['Kenapa deal A tidak bisa?','id']] as const)('parses "%s" as an explain request',(text,language)=>{
  expect(parseIntent(text)).toMatchObject({kind:'explain',language});
 });
 function ports(explainVerdict?:AlexaPorts['explainVerdict'],runs:unknown[]=[run]){
  const calls:string[]=[];
  const value:AlexaPorts={
   async mcp(_method,params){const {name}=params as {name:string};calls.push(name);
    return {status:200,body:{jsonrpc:'2.0',id:1,result:{structuredContent:{tool:name,httpStatus:200,references:{},
     data:{revision:7,deal:{id:'judge-deal-a'},currentVersion:{id:'version-3',version:3,terms:{}},constraints:[],proofs:[],compileRuns:runs}}}}};},
   confirm:()=>'grant',issueTicket:action=>JSON.stringify(action),verifyTicket:ticket=>JSON.parse(ticket) as AlexaPendingAction,newKey:()=>'key-1',
   ...(explainVerdict?{explainVerdict}:{}),
  };
  return {calls,ports:value};
 }
 it('shows Nemotron\'s words with the compiler\'s numbers and writes nothing',async()=>{
  const explainer=new NemotronVerdictExplainer(provider(reply(['On {violationDate} your cash falls {shortfall} below {cashFloor}.'])));
  const {calls,ports:p}=ports((f,l)=>explainer.explain(f,l));
  const turn=await runAlexaTurn({utterance:'Why does deal A not work?'},p);
  expect(calls).toEqual(['get_deal']);expect(turn.pending).toBeNull();
  expect(turn.card).toMatchObject({kind:'explanation',title:'Why deal A does not work',tone:'bad',body:['On September 22 your cash falls Rp 3,000,000 below Rp 5,000,000.']});
  expect(turn.card.subtitle).toContain('Words by nvidia/nemotron-fake');
  expect(turn.card.facts).toEqual(expect.arrayContaining([{label:'Shortfall',value:'Rp 3,000,000'},{label:'Cash floor',value:'Rp 5,000,000'},{label:'Words',value:'Nemotron'}]));
  expect(turn.trace.at(-1)).toEqual({method:'explain/verdict',httpStatus:200});
 });
 it('falls back to the template when Nemotron writes a number of its own',async()=>{
  const explainer=new NemotronVerdictExplainer(provider(reply(['Pada {violationDate} kurang 3000000, yaitu {shortfall}.'],'id')));
  const turn=await runAlexaTurn({utterance:'Explain it in Indonesian.'},ports((f,l)=>explainer.explain(f,l)).ports);
  expect(turn.language).toBe('id');expect(turn.card.title).toBe('Kenapa deal A tidak bisa jalan');
  expect(turn.card.body?.[0]).toBe('Pada 22 September kas Anda turun Rp3.000.000 di bawah batas minimum kas Rp5.000.000.');
  expect(turn.card.subtitle).toContain('Nemotron fell back: AI_UNGROUNDED_NUMBER');
  expect(turn.trace.at(-1)).toEqual({method:'explain/verdict',httpStatus:422,code:'AI_UNGROUNDED_NUMBER'});
 });
 it('uses the template without calling anything when no explainer is configured',async()=>{
  const turn=await runAlexaTurn({utterance:'Why does deal A not work?'},ports().ports);
  expect(turn.card.facts).toContainEqual({label:'Words',value:'Template'});expect(turn.trace.some(row=>row.method==='explain/verdict')).toBe(false);
 });
 it('says there is nothing to explain before the deal was checked',async()=>{
  const turn=await runAlexaTurn({utterance:'Why does deal A not work?'},ports(async()=>{throw new ExtractionError('AI_PROVIDER_UNAVAILABLE',503);},[]).ports);
  expect(turn.card.title).toBe('Nothing to explain yet');expect(turn.trace.some(row=>row.method==='explain/verdict')).toBe(false);
 });
});
