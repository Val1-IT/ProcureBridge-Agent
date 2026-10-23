import {describe,expect,it} from 'vitest';
import {parseIntent,suggestedUtterances} from '../../../lib/dealtwin/alexa/intents';
import {describeConstraint,runAlexaTurn,type AlexaPorts} from '../../../lib/server/dealtwin/alexa-orchestrator';
import type {AlexaPendingAction} from '../../../lib/server/dealtwin/alexa-ticket';

describe('natural-language constraint intents',()=>{
 it('keeps the words after the colon verbatim, including rupiah formatting',()=>{
  expect(parseIntent('Alexa, terms for deal B: deposit at least 30%, keep Rp 5,000,000 in the bank.')).toEqual({kind:'constraints',deal:'b',text:'deposit at least 30%, keep Rp 5,000,000 in the bank.'});
  expect(parseIntent('For deal A: DP minimal 30%, pelunasan paling lambat 14 hari.')).toEqual({kind:'constraints',deal:'a',text:'DP minimal 30%, pelunasan paling lambat 14 hari.'});
  expect(parseIntent('Constraints: no new borrowing')).toEqual({kind:'constraints',deal:null,text:'no new borrowing'});
 });
 it('routes "confirm the constraints" to the constraint set, not to a pending yes',()=>{
  expect(parseIntent('Confirm the constraints for deal A')).toEqual({kind:'confirm_constraints',deal:'a'});
  expect(parseIntent('confirm')).toEqual({kind:'confirm'});
  expect(parseIntent('Yes, go ahead')).toEqual({kind:'confirm'});
 });
 it('leaves the judge script unchanged',()=>{
  expect(suggestedUtterances.map(row=>parseIntent(row).kind)).toEqual(['launch','compile','amend','proof','stress','reserve','commit','compile','supplier_increase','status','amend','replay']);
 });
 it('reads every constraint kind back in plain words',()=>{
  expect(describeConstraint({kind:'customer_deposit_min_bps',value:3000})).toBe('deposit at least 30%');
  expect(describeConstraint({kind:'minimum_cash_rupiah',value:'5000000'})).toBe('keep at least 5 million rupiah in cash');
  expect(describeConstraint({kind:'new_borrowing_allowed',value:false})).toBe('no new borrowing');
  expect(describeConstraint({kind:'required_inventory_available',value:{productId:'judge-product-a',warehouseId:'judge-warehouse',quantity:120}})).toBe('120 units of judge-product-a available in judge-warehouse');
 });
});

type Call={name:string;args:Record<string,unknown>};
/** Fake MCP: one deal, scripted execute answers. Nothing here reaches a provider. */
function harness(options:{constraints?:unknown[];execute?:(call:Call)=>{httpStatus:number;data:unknown}}={}){
 const calls:Call[]=[];
 const result=(tool:string,httpStatus:number,data:unknown,prepared=false)=>({status:200,body:{jsonrpc:'2.0',id:1,result:{structuredContent:{tool,httpStatus,data,references:{},...(prepared?{prepared:true}:{})}}}});
 const ports:AlexaPorts={
  async mcp(method,params){
   const {name,arguments:args}=params as {name:string;arguments:Record<string,unknown>};calls.push({name,args});
   if(name==='get_deal')return result(name,200,{revision:7,deal:{id:'judge-deal-a'},currentVersion:{id:'version-3',version:3,terms:{}},constraints:options.constraints??[],proofs:[]});
   if(args.mode==='prepare')return result(name,200,{ok:true,outcome:'PREPARED',requiresConfirmation:true},true);
   const answer=options.execute?.({name,args})??{httpStatus:500,data:{}};return result(name,answer.httpStatus,answer.data);
  },
  confirm:()=>'grant',
  issueTicket:action=>JSON.stringify(action),
  verifyTicket:ticket=>JSON.parse(ticket) as AlexaPendingAction,
  newKey:()=>'key-1',
 };
 return {calls,ports};
}

describe('Alexa constraint front door over MCP',()=>{
 it('prepares extraction with the raw words and calls nothing until a human says yes',async()=>{
  const {calls,ports}=harness();
  const turn=await runAlexaTurn({utterance:'Terms for deal A: deposit at least 30%, no borrowing'},ports);
  expect(turn.intent).toBe('constraints');
  expect(turn.speech).toContain('I heard: deposit at least 30%, no borrowing');
  expect(turn.speech).toContain('Nemotron on Nebius');
  expect(turn.pending?.tool).toBe('extract_constraints');
  expect(calls.map(row=>[row.name,row.args.mode])).toEqual([['get_deal',undefined],['extract_constraints','prepare']]);
  expect(calls[1]!.args.input).toMatchObject({dealId:'judge-deal-a',dealVersionId:'version-3',text:'deposit at least 30%, no borrowing',expectedRevision:7});
 });
 it('reads Nemotron drafts back as non-authoritative after execution',async()=>{
  const {ports}=harness({execute:()=>({httpStatus:201,data:{dealId:'judge-deal-a',version:4,candidates:[{kind:'customer_deposit_min_bps',value:3000,sourceText:'deposit at least 30%'}],requiresConfirmation:true,metadata:{model:'nvidia/nemotron-test',promptVersion:'dealtwin.constraints.prompt.v1'}}})});
  const prepared=await runAlexaTurn({utterance:'Terms for deal A: deposit at least 30%'},ports);
  const turn=await runAlexaTurn({action:'confirm',ticket:prepared.pending!.ticket},ports);
  expect(turn.speech).toContain('Nemotron proposed 1 constraint for deal A: deposit at least 30%. They are drafts only.');
  expect(turn.card).toMatchObject({kind:'constraints',tone:'info'});
  expect(turn.card.facts).toContainEqual({label:'Model',value:'nvidia/nemotron-test'});
 });
 it('speaks the clarifying question when Nemotron reports missing information',async()=>{
  const {ports}=harness({execute:()=>({httpStatus:422,data:{ok:false,error:{code:'MISSING_COMMERCIAL_INFORMATION'},missingFields:['When is the balance due?']}})});
  const prepared=await runAlexaTurn({utterance:'Terms for deal A: the customer pays the rest later'},ports);
  const turn=await runAlexaTurn({action:'confirm',ticket:prepared.pending!.ticket},ports);
  expect(turn.speech).toBe('I need more detail before I can draft constraints. Missing: When is the balance due? Nothing was saved.');
  expect(turn.card.kind).toBe('clarify');
 });
 it('fails closed with a plain explanation when the live provider is off',async()=>{
  const {ports}=harness({execute:()=>({httpStatus:503,data:{ok:false,error:{code:'LIVE_PROVIDER_NOT_AUTHORIZED'}}})});
  const prepared=await runAlexaTurn({utterance:'Constraints for deal A: no new borrowing'},ports);
  const turn=await runAlexaTurn({action:'confirm',ticket:prepared.pending!.ticket},ports);
  expect(turn.speech).toBe('Live AI extraction is switched off in this demo. Nothing was sent anywhere.');
  expect(turn.card.kind).toBe('refusal');
 });
 it('confirms the whole constraint set only after reading the drafts back',async()=>{
  const constraints=[{id:'c-1',kind:'new_borrowing_allowed',value:false,provenance:'user_confirmed',resolution:'confirmed'},
   {id:'c-2',kind:'customer_deposit_min_bps',value:3000,provenance:'ai_extracted',resolution:'pending_confirmation'}];
  const {calls,ports}=harness({constraints,execute:()=>({httpStatus:201,data:{dealId:'judge-deal-a',version:5,constraints:constraints.map(row=>({...row,resolution:'confirmed'}))}})});
  const prepared=await runAlexaTurn({utterance:'Confirm the constraints'},ports);
  expect(prepared.speech).toBe("The proposed constraint is: deposit at least 30%. I'll confirm that constraint as your own terms for deal A. That saves a new deal version; the drafts stay on record as AI-proposed. Shall I go ahead?");
  expect(calls[1]!.args.input).toMatchObject({constraintIds:['c-1','c-2']});
  const turn=await runAlexaTurn({action:'confirm',ticket:prepared.pending!.ticket},ports);
  expect(turn.speech).toBe('Confirmed. Deal A version 5 now carries 2 confirmed constraints. Ask me whether you can accept it.');
 });
 it('has nothing to confirm when no draft is waiting',async()=>{
  const {calls,ports}=harness({constraints:[{id:'c-1',kind:'new_borrowing_allowed',value:false,resolution:'confirmed'}]});
  const turn=await runAlexaTurn({utterance:'confirm the constraints'},ports);
  expect(turn.pending).toBeNull();expect(turn.card.title).toBe('Nothing to confirm');
  expect(calls.map(row=>row.name)).toEqual(['get_deal']);
 });
});
