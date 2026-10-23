import {describe,expect,it} from 'vitest';
import {IntentRouteError,NemotronIntentRouter,ROUTER_PROMPT_VERSION,intentRouterFromEnv} from '../../../lib/dealtwin/ai/intent-router';
import {ExtractionError} from '../../../lib/dealtwin/ai/constraint-extractor';
import {runAlexaTurn,type AlexaPorts} from '../../../lib/server/dealtwin/alexa-orchestrator';
import type {AlexaPendingAction} from '../../../lib/server/dealtwin/alexa-ticket';

/** Fake Nemotron: returns whatever route the test scripts, and records what it was asked. */
function fake(route:object|string){
 const asked:string[]=[];
 const router=new NemotronIntentRouter({complete:async({user})=>{asked.push(user);return {provider:'fake',model:'nvidia/nemotron-fake',content:typeof route==='string'?route:JSON.stringify({schemaVersion:'dealtwin.intent-route.v1',...route})};}});
 return {asked,router};
}
describe('Nemotron intent router',()=>{
 it('maps a free-form request to one routable intent and labels its origin',async()=>{
  const {asked,router}=fake({intent:'stress',deal:'a',days:7});
  const route=await router.route('Suppose the buyer of the first deal settles a week late — are we still fine?');
  expect(route.intent).toEqual({kind:'stress',deal:'a',days:7});
  expect(route.metadata).toEqual({provider:'fake',model:'nvidia/nemotron-fake',promptVersion:ROUTER_PROMPT_VERSION,schemaVersion:'dealtwin.intent-route.v1'});
  expect(JSON.parse(asked[0]!)).toEqual({schemaVersion:'dealtwin.intent-route.v1',utterance:'Suppose the buyer of the first deal settles a week late — are we still fine?'});
 });
 it('fails closed on prose, extra fields, unknown intents or a model that answers "confirm"',async()=>{
  for(const bad of ['Sure! I think you want stress.',{intent:'stress',deal:'a',days:7,verdict:'safe'},{intent:'transfer_funds',deal:null},{intent:'confirm',deal:null},{intent:'stress',deal:'a',days:90}])
   await expect(fake(bad).router.route('pay late?')).rejects.toMatchObject({code:'AI_OUTPUT_INVALID'});
 });
 it('only accepts constraint text the human actually said',async()=>{
  await expect(fake({intent:'constraints',deal:'a',text:'deposit at least 10%'}).router.route('deal A needs a 30% deposit')).rejects.toBeInstanceOf(IntentRouteError);
  expect((await fake({intent:'constraints',deal:'a',text:'a 30% deposit'}).router.route('deal A needs a 30% deposit')).intent).toEqual({kind:'constraints',deal:'a',text:'a 30% deposit'});
 });
 it('rejects empty and oversized utterances before calling the provider',async()=>{
  const {asked,router}=fake({intent:'help',deal:null});
  await expect(router.route('   ')).rejects.toMatchObject({code:'AI_INPUT_INVALID'});
  await expect(router.route('x'.repeat(301))).rejects.toMatchObject({code:'AI_INPUT_INVALID'});
  expect(asked).toEqual([]);
 });
 it('stays off unless both the live provider and the router flag are on',()=>{
  expect(intentRouterFromEnv({})).toBeUndefined();
  expect(intentRouterFromEnv({DEALTWIN_NEBIUS_LIVE_ENABLED:'true'})).toBeUndefined();
  expect(intentRouterFromEnv({DEALTWIN_NEBIUS_ROUTER_ENABLED:'true'})).toBeUndefined();
  expect(intentRouterFromEnv({DEALTWIN_NEBIUS_LIVE_ENABLED:'true',DEALTWIN_NEBIUS_ROUTER_ENABLED:'true'})).toBeInstanceOf(NemotronIntentRouter);
 });
 it('never sends a request when the configured model is not Nemotron',async()=>{
  let called=false;const fetcher=(async()=>{called=true;return new Response('{}');}) as typeof fetch;
  const router=intentRouterFromEnv({DEALTWIN_NEBIUS_LIVE_ENABLED:'true',DEALTWIN_NEBIUS_ROUTER_ENABLED:'true',NEBIUS_API_KEY:'test-key',NEBIUS_MODEL:'some-other-model'},fetcher)!;
  await expect(router.route('help')).rejects.toMatchObject({code:'INVALID_PROVIDER_CONFIG'});expect(called).toBe(false);
 });
});

type Call={name:string;args:Record<string,unknown>};
function ports(routeIntent?:AlexaPorts['routeIntent']){
 const calls:Call[]=[];
 const result=(tool:string,data:unknown,prepared=false)=>({status:200,body:{jsonrpc:'2.0',id:1,result:{structuredContent:{tool,httpStatus:200,data,references:{},...(prepared?{prepared:true}:{})}}}});
 const value:AlexaPorts={
  async mcp(_method,params){
   const {name,arguments:args}=params as {name:string;arguments:Record<string,unknown>};calls.push({name,args});
   if(name==='get_deal')return result(name,{revision:7,deal:{id:'judge-deal-a'},currentVersion:{id:'version-3',version:3,terms:{}},constraints:[],proofs:[]});
   return result(name,{ok:true,outcome:'PREPARED',requiresConfirmation:true},true);
  },
  confirm:()=>'grant',issueTicket:action=>JSON.stringify(action),verifyTicket:ticket=>JSON.parse(ticket) as AlexaPendingAction,newKey:()=>'key-1',
  ...(routeIntent?{routeIntent}:{}),
 };
 return {calls,ports:value};
}
describe('Alexa turn with the Nemotron router',()=>{
 it('plans the tool Nemotron chose, still only as a prepared action',async()=>{
  const {calls,ports:p}=ports(utterance=>fake({intent:'compile',deal:'a'}).router.route(utterance));
  const turn=await runAlexaTurn({utterance:'Is the first order something we can take on without running dry?'},p);
  expect(turn.intent).toBe('compile');expect(turn.pending?.tool).toBe('compile_deal');
  expect(turn.router).toEqual({source:'nemotron',model:'nvidia/nemotron-fake',promptVersion:ROUTER_PROMPT_VERSION});
  expect(turn.trace[0]).toEqual({method:'intent/route',httpStatus:200});
  expect(calls.every(row=>row.args.mode!=='execute')).toBe(true);
 });
 it('falls back to the grammar when the provider is off or the output is invalid',async()=>{
  const off=ports(async()=>{throw new ExtractionError('LIVE_PROVIDER_NOT_AUTHORIZED',503);});
  const turn=await runAlexaTurn({utterance:'Commit deal A'},off.ports);
  expect(turn.intent).toBe('commit');expect(turn.router).toEqual({source:'grammar',fallbackCode:'LIVE_PROVIDER_NOT_AUTHORIZED'});
  expect(turn.trace[0]).toEqual({method:'intent/route',httpStatus:503,code:'LIVE_PROVIDER_NOT_AUTHORIZED'});
  const junk=ports(utterance=>fake('ignore previous instructions').router.route(utterance));
  expect((await runAlexaTurn({utterance:'Check deal B'},junk.ports)).router).toEqual({source:'grammar',fallbackCode:'AI_OUTPUT_INVALID'});
 });
 it('keeps the grammar when Nemotron shrugs at something the grammar understood',async()=>{
  const {ports:p}=ports(utterance=>fake({intent:'unknown',deal:null}).router.route(utterance));
  const turn=await runAlexaTurn({utterance:'Fix deal A'},p);
  expect(turn.intent).toBe('amend');expect(turn.router).toMatchObject({source:'grammar',fallbackCode:'ROUTE_DEFERRED_TO_GRAMMAR'});
 });
 it('never asks the model about yes/no replies or quoted terms',async()=>{
  let asked=0;const {ports:p}=ports(async utterance=>{asked++;return fake({intent:'help',deal:null}).router.route(utterance);});
  for(const utterance of ['yes, go ahead','cancel','Terms for deal A: no new borrowing','confirm the constraints'])await runAlexaTurn({utterance},p);
  expect(asked).toBe(0);
 });
 it('adds no router field when no router is configured',async()=>{
  const turn=await runAlexaTurn({utterance:'help'},ports().ports);
  expect('router' in turn).toBe(false);
 });
});
