import {randomUUID} from 'node:crypto';
import {parseIntent,type AlexaIntent,type DealRef} from '../../dealtwin/alexa/intents';
import {advanceConversation,deserializeConversation,initialConversation,serializeConversation,type ConversationState} from '../../dealtwin/mcp/conversation-state';
import type {DealTwinToolResult} from '../../dealtwin/mcp/tool-handlers';
import type {ToolName} from '../../dealtwin/mcp/tool-schemas';
import type {AlexaPendingAction} from './alexa-ticket';

/** One JSON-RPC exchange with the real DealTwin MCP route. */
export type McpExchange=(method:string,params:unknown)=>Promise<{status:number;body:unknown}>;
export interface AlexaPorts {
 mcp:McpExchange;
 /** Server-only: mints the MCP confirmation grant AFTER a human said yes. */
 confirm(action:AlexaPendingAction):string;
 issueTicket(action:AlexaPendingAction):string;
 verifyTicket(ticket:string):AlexaPendingAction|null;
 newKey?():string;
}
export interface AlexaTurnInput {utterance?:string;conversation?:string;ticket?:string;action?:'confirm'|'cancel'}
export type Tone='good'|'bad'|'warn'|'info';
export interface AlexaCard {kind:string;title:string;subtitle?:string;tone:Tone;facts:{label:string;value:string}[]}
export interface TraceEntry {method:string;tool?:string;mode?:'prepare'|'execute';httpStatus:number;code?:string}
export interface AlexaTurnResult {
 intent:AlexaIntent['kind'];speech:string;card:AlexaCard;
 pending:{ticket:string;tool:ToolName;summary:string}|null;
 conversation:string;trace:TraceEntry[];
}
type Json=Record<string,unknown>;
const obj=(value:unknown):Json=>value&&typeof value==='object'&&!Array.isArray(value)?value as Json:{};
const arr=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const str=(value:unknown):string|undefined=>typeof value==='string'?value:undefined;
const dealIds={a:'judge-deal-a',b:'judge-deal-b'} as const;
export function dealLabel(dealId:string|undefined):string{return dealId==='judge-deal-b'?'deal B':dealId==='judge-deal-a'?'deal A':dealId??'the deal';}
/** "3000000" → "3 million rupiah". Inputs are the engine's decimal strings. */
export function spokenRupiah(value:unknown):string{
 const text=typeof value==='string'||typeof value==='number'?String(value):'';
 if(!/^-?\d+$/.test(text))return 'an unknown amount';
 const n=Number(text),abs=Math.abs(n),sign=n<0?'minus ':'';
 if(abs>=1e9)return sign+trim(abs/1e9)+' billion rupiah';
 if(abs>=1e6)return sign+trim(abs/1e6)+' million rupiah';
 return sign+abs.toLocaleString('en-US')+' rupiah';
}
function trim(n:number){return String(Number(n.toFixed(2)));}
function displayRupiah(value:unknown):string{const text=String(value??'');return /^-?\d+$/.test(text)?'Rp '+Number(text).toLocaleString('en-US'):'—';}
function spokenDate(value:unknown):string{
 const text=str(value);if(!text||!/^\d{4}-\d{2}-\d{2}$/.test(text))return 'an unknown date';
 return new Date(text+'T00:00:00Z').toLocaleDateString('en-US',{month:'long',day:'numeric',timeZone:'UTC'});
}
function percent(basisPoints:unknown){return typeof basisPoints==='number'?trim(basisPoints/100)+'%':'—';}
function depositBasisPoints(proof:Json):number|undefined{
 const events=arr(obj(proof.terms).customerPaymentEvents).map(obj);
 const deposit=events.find(row=>row.role==='customer_deposit'||/deposit/i.test(String(row.kind??row.type??row.id??'')))??events[0];
 return typeof deposit?.basisPoints==='number'?deposit.basisPoints:undefined;
}
type Fact={label:string;value:string};
/** Structured terms of one deal version (DealTermsV1 DTO) as Alexa reads them back before any verdict. */
export function describeTerms(terms:unknown):{facts:Fact[];spoken:string}|null{
 const t=obj(terms),lines=arr(t.productLines).map(obj),payments=arr(t.customerPaymentEvents).map(obj),costs=arr(t.directCostEvents).map(obj);
 const int=(value:unknown)=>typeof value==='string'&&/^\d+$/.test(value)?BigInt(value):typeof value==='number'&&Number.isSafeInteger(value)?BigInt(value):null;
 let revenue=0n,cost=0n;
 for(const line of lines){const qty=int(line.quantity),price=int(line.unitPriceRupiah);if(qty===null||price===null)return null;revenue+=qty*price;}
 for(const row of costs){const amount=int(row.amountRupiah);if(amount===null)return null;cost+=amount;}
 const deposit=payments.find(row=>row.role==='customer_deposit'),balance=payments.find(row=>row.role==='customer_balance');
 if(!lines.length||!deposit||!balance)return null;
 const days=Number(balance.daysFromAcceptance);
 const facts:Fact[]=[{label:'Customer',value:String(t.customerId??'—')},{label:'Deal value',value:displayRupiah(revenue.toString())},
  {label:'Deposit',value:percent(deposit.basisPoints)+' at acceptance'},{label:'Balance due',value:`${days} days after acceptance`},
  {label:'Supplier costs',value:displayRupiah(cost.toString())},{label:'Accepted on',value:String(t.acceptedDate??'—')}];
 return {facts,spoken:`It is ${spokenRupiah(revenue.toString())}, with a ${percent(deposit.basisPoints)} deposit and the balance due in ${days} days, against ${spokenRupiah(cost.toString())} of supplier costs.`};
}
function pendingApprovals(proof:Json){return arr(proof.approvals).map(obj).filter(row=>row.status==='pending').length;}
function errorCode(result:DealTwinToolResult):string|undefined{return str(obj(obj(result.data).error).code);}
interface DealView {dealId:string;revision:number;currentVersionId:string;currentVersion:number;committed:boolean;proofs:Json[];currentProof?:Json;terms:unknown}
function latest(rows:Json[]):Json|undefined{return [...rows].sort((l,r)=>String(l.generatedAt).localeCompare(String(r.generatedAt))).at(-1);}

export async function runAlexaTurn(input:AlexaTurnInput,ports:AlexaPorts):Promise<AlexaTurnResult>{
 const trace:TraceEntry[]=[];
 let conversation:ConversationState=initialConversation;
 if(input.conversation){try{conversation=deserializeConversation(input.conversation);}catch{conversation=initialConversation;}}
 const newKey=ports.newKey??(()=>'alexa-'+randomUUID());
 const done=(intent:AlexaIntent['kind'],speech:string,card:AlexaCard,pending:AlexaTurnResult['pending']=null):AlexaTurnResult=>
  ({intent,speech,card,pending,conversation:serializeConversation(conversation),trace});

 async function rpc(method:string,params:unknown){
  const {status,body}=await ports.mcp(method,params);const envelope=obj(body),error=obj(envelope.error);
  trace.push({method,httpStatus:status,...(str(error.message)?{code:str(error.message)}:{})});
  if(status!==200||envelope.error)throw new AlexaRefusal(str(error.message)??'MCP_UNAVAILABLE');
  return obj(envelope.result);
 }
 async function tool(name:ToolName,args:Json):Promise<DealTwinToolResult>{
  const {status,body}=await ports.mcp('tools/call',{name,arguments:args});const envelope=obj(body);
  const mode=args.mode==='prepare'||args.mode==='execute'?args.mode:undefined;
  if(status!==200||envelope.error){
   const code=str(obj(envelope.error).message)??'MCP_UNAVAILABLE';trace.push({method:'tools/call',tool:name,...(mode?{mode}:{}),httpStatus:status,code});
   throw new AlexaRefusal(code);
  }
  const result=obj(envelope.result).structuredContent as DealTwinToolResult;
  const code=errorCode(result);
  trace.push({method:'tools/call',tool:name,...(mode?{mode}:{}),httpStatus:result.httpStatus,...(code?{code}:{})});
  conversation=advanceConversation(conversation,result);
  return result;
 }
 async function readDeal(ref:DealRef):Promise<DealView>{
  const dealId=ref?dealIds[ref]:conversation.dealId&&Object.values(dealIds).includes(conversation.dealId as never)?conversation.dealId:dealIds.a;
  const result=await tool('get_deal',{dealId});
  if(result.httpStatus!==200)throw new AlexaRefusal(errorCode(result)??'DEAL_UNAVAILABLE');
  const data=obj(result.data),current=obj(data.currentVersion),proofs=arr(data.proofs).map(obj);
  const currentVersionId=String(current.id);
  return {dealId,revision:Number(data.revision),currentVersionId,currentVersion:Number(current.version??1),committed:!!str(obj(data.deal).committedSalesOrderId),
   terms:current.terms,proofs,currentProof:latest(proofs.filter(row=>row.dealVersionId===currentVersionId))};
 }
 async function prepare(name:ToolName,fields:Json,revision:number,summary:string,intent:AlexaIntent['kind'],context?:{spoken:string;facts:Fact[]}|null):Promise<AlexaTurnResult>{
  const action:AlexaPendingAction={tool:name,input:{...fields,expectedRevision:revision,idempotencyKey:newKey()}};
  const result=await tool(name,{mode:'prepare',input:action.input});
  if(!result.prepared)return refusal(intent,errorCode(result)??'PREPARE_REJECTED');
  // Every tool call below writes something, so every one asks first; the words say what.
  const effect=erpWriters.has(name)?'That changes your synthetic ERP':'I will record the run as audit evidence';
  return done(intent,(context?context.spoken+' ':'')+`I'll ${summary}. ${effect}. Shall I go ahead?`,
   {kind:'confirm',title:'Waiting for your confirmation',subtitle:'Prepared over MCP — nothing has executed yet',tone:'info',
    facts:[...(context?.facts??[]),{label:'Tool',value:name},{label:'Expected revision',value:String(revision)},{label:'Grant',value:'Minted server-side only after you say yes'}]},
   {ticket:ports.issueTicket(action),tool:name,summary});
 }
 function refusal(intent:AlexaIntent['kind'],code:string):AlexaTurnResult{
  const spoken=refusalSpeech[code]??`DealTwin refused that request with code ${code.replaceAll('_',' ').toLowerCase()}. Nothing was changed.`;
  return done(intent,spoken,{kind:'refusal',title:titleCase(code),tone:code==='APPROVAL_REQUIRED'?'warn':'bad',facts:[{label:'Reason code',value:code}]});
 }

 try{
  // Confirmation path: a human said yes (button or voice) to a signed, actor-bound prepared action.
  const intent:AlexaIntent=input.action==='confirm'?{kind:'confirm'}:input.action==='cancel'?{kind:'cancel'}:parseIntent(input.utterance??'');
  if(intent.kind==='confirm'||intent.kind==='cancel'){
   const action=input.ticket?ports.verifyTicket(input.ticket):null;
   if(intent.kind==='cancel')return done('cancel',action?'Okay, cancelled. Nothing was written.':'Okay.',{kind:'cancelled',title:'Cancelled',tone:'info',facts:[]});
   if(!action)return done('confirm','There is nothing waiting for confirmation, or it expired after five minutes. Ask me again.',{kind:'expired',title:'Nothing to confirm',tone:'warn',facts:[]});
   const grant=ports.confirm(action);
   const result=await tool(action.tool,{mode:'execute',input:action.input,confirmationToken:grant});
   return speakExecution(action,result);
  }
  switch(intent.kind){
   case 'launch':{
    const init=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'dealtwin-alexa-simulator',title:'Simulated Alexa+',version:'1.0.0'}});
    const tools=arr((await rpc('tools/list',{})).tools).map(row=>String(obj(row).name));
    return done('launch',`DealTwin is connected. I can see ${tools.length} tools. Try asking: can I accept deal A?`,
     {kind:'connected',title:'DealTwin connected over MCP',subtitle:String(obj(init.serverInfo).name??'DealTwin'),tone:'good',
      facts:[{label:'Protocol',value:String(init.protocolVersion)},{label:'Transport',value:'Streamable HTTP (stateless JSON)'},{label:'Tools',value:tools.join(', ')}]});
   }
   case 'help':return done('help','Ask whether you can accept a deal, what it would take to make it work, what happens if the customer pays late, then reserve and commit the cash. I prepare every change and only run it after you say yes.',
    {kind:'help',title:'What you can say',tone:'info',facts:[{label:'Check',value:'“Can I accept deal A?”'},{label:'Fix',value:'“What would it take to make it work?”'},{label:'Stress',value:'“What if the customer pays three days late?”'},{label:'Book',value:'“Reserve the cash” → “Commit deal A”'}]});
   case 'list':{
    const result=await tool('list_deals',{});const deals=arr(obj(result.data).deals).map(obj);
    return done('list',`You have ${deals.length} deals: `+deals.map(row=>`${dealLabel(str(row.id))}, ${String(row.status??'open').toLowerCase().replaceAll('_',' ')}`).join('; ')+'.',
     {kind:'deals',title:'Deals in the pipeline',tone:'info',facts:deals.map(row=>({label:dealLabel(str(row.id)),value:String(row.status??'—')}))});
   }
   case 'timeline':{
    const result=await tool('inspect_timeline',{});const data=obj(result.data);
    return done('timeline',`Your synthetic ERP is at revision ${String(data.revision)}. The full timeline is on the card.`,
     {kind:'timeline',title:'Cash timeline',tone:'info',facts:[{label:'Revision',value:String(data.revision)},{label:'Events',value:String(arr(data.timeline).length)}]});
   }
   case 'status':case 'proof':{
    const view=await readDeal(intent.deal);const proof=view.currentProof;
    if(!proof){
     if(intent.kind==='proof')return prepare('generate_proof',{dealId:view.dealId,dealVersionId:view.currentVersionId},view.revision,`generate a proof for ${dealLabel(view.dealId)}, version ${view.currentVersion}`,'proof');
     return done(intent.kind,`${cap(dealLabel(view.dealId))} has no proof yet. Ask me whether you can accept it.`,{kind:'status',title:'No proof yet',tone:'info',facts:[]});
    }
    const status=String(proof.currentStatus??proof.status);
    const stale=status==='STALE'||status==='INVALID';
    return done(intent.kind,stale
     ?`No. The ${dealLabel(view.dealId)} proof is stale: an ERP fact it depended on changed after it was generated. The booked order stands, but the conclusion needs remediation. Say: fix ${dealLabel(view.dealId)}.`
     :`The ${dealLabel(view.dealId)} proof for version ${view.currentVersion} is ${status.toLowerCase().replaceAll('_',' ')}. Its hash starts with ${String(proof.proofHash).slice(0,8)}.`
      +(pendingApprovals(proof)>0?` It still needs ${pendingApprovals(proof)===1?'one human approval':pendingApprovals(proof)+' human approvals'} before it can be committed.`:''),
     {kind:'proof',title:`Proof ${status}`,subtitle:`${cap(dealLabel(view.dealId))} · version ${view.currentVersion}`,tone:stale?'bad':'good',
      facts:[{label:'Proof hash',value:String(proof.proofHash).slice(0,16)+'…'},{label:'ERP revision at proof',value:String(proof.erpRevision)},{label:'Engine',value:String(proof.engineVersion)}]});
   }
   case 'compile':{
    const view=await readDeal(intent.deal);
    // Read the structured terms back first, so the human hears exactly what is being checked.
    const terms=describeTerms(view.terms);
    return prepare('compile_deal',{dealId:view.dealId,dealVersionId:view.currentVersionId},view.revision,`check ${dealLabel(view.dealId)}, version ${view.currentVersion}, against your projected cash`,'compile',
     terms&&{spoken:`Here are the terms of ${dealLabel(view.dealId)}. ${terms.spoken}`,facts:terms.facts});
   }
   case 'amend':{
    const view=await readDeal(intent.deal);
    return prepare('recompile_deal',{dealId:view.dealId,dealVersionId:view.currentVersionId},view.revision,
     view.committed?`search for the smallest remediation of booked ${dealLabel(view.dealId)}`:`search for the smallest change that makes ${dealLabel(view.dealId)} work`,'amend');
   }
   case 'stress':{
    const view=await readDeal(intent.deal);const proof=view.currentProof;
    if(!proof)return done('stress',`${cap(dealLabel(view.dealId))} needs a proof before I can stress it. Ask what it would take to make it work.`,{kind:'status',title:'No proof to stress',tone:'warn',facts:[]});
    return prepare('stress_deal',{proofId:String(proof.id),scenarios:[{schemaVersion:'dealtwin.stress-scenario.v1',id:`delay-${intent.days}`,type:'customer_receipt_delay',days:intent.days}]},view.revision,
     `replay the ${dealLabel(view.dealId)} proof with the customer paying ${intent.days} ${intent.days===1?'day':'days'} late`,'stress');
   }
   case 'reserve':case 'commit':{
    const view=await readDeal(intent.deal);const proof=view.currentProof;
    if(!proof)return done(intent.kind,`${cap(dealLabel(view.dealId))} has no valid proof, so there is nothing safe to ${intent.kind}. Ask me whether you can accept it first.`,{kind:'status',title:'No proof',tone:'warn',facts:[]});
    const fields={dealId:view.dealId,proofId:String(proof.id),dealVersionId:view.currentVersionId,canonicalEventHash:String(proof.canonicalEventHash)};
    return intent.kind==='reserve'
     ?prepare('reserve_liquidity',fields,view.revision,`reserve the cash timeline for ${dealLabel(view.dealId)} so no other deal can spend it`,'reserve')
     :prepare('commit_deal',fields,view.revision,`commit ${dealLabel(view.dealId)} and create the sales order in the ERP`,'commit');
   }
   case 'replay':{
    const view=await readDeal(intent.deal);
    const proof=latest(view.proofs.filter(row=>row.currentStatus==='STALE'&&row.dealVersionId===view.currentVersionId))??view.currentProof;
    if(!proof)return done('replay',`${cap(dealLabel(view.dealId))} has no proof to replay yet.`,{kind:'status',title:'No proof',tone:'warn',facts:[]});
    return prepare('replay_proof',{proofId:String(proof.id)},view.revision,`replay the original ${dealLabel(view.dealId)} proof from its frozen inputs`,'replay');
   }
   case 'supplier_increase':{
    const result=await tool('list_deals',{});const revision=Number(obj(result.data).revision);
    return prepare('mutate_judge_obligation',{invoiceId:'judge-existing-ap',amountRupiah:'19000000'},revision,'record the supplier invoice increase to 19 million rupiah','supplier_increase');
   }
   default:return done('unknown',"Sorry, I didn't catch that. Try: can I accept deal A?",{kind:'help',title:'Try one of the suggestions',tone:'info',facts:[]});
  }
 }catch(error){
  if(error instanceof AlexaRefusal)return refusal('unknown',error.code);
  throw error;
 }

 function speakExecution(action:AlexaPendingAction,result:DealTwinToolResult):AlexaTurnResult{
  const code=errorCode(result);
  if(result.httpStatus<200||result.httpStatus>=300)return refusal('confirm',code??'TOOL_FAILED');
  const data=obj(result.data),proof=obj(data.proof),deal=dealLabel(str(data.dealId)??str(action.input.dealId));
  switch(action.tool){
   case 'compile_deal':{
    const outcome=String(data.outcome);
    if(outcome==='DOES_NOT_COMPILE'){
     const blocked=arr(data.conflictingCommitmentIds).length>0;
     return done('confirm',`No. ${cap(deal)} breaks your cash floor on ${spokenDate(data.firstViolationDate)}. You would be ${spokenRupiah(data.shortfallRupiah)} short`+
      (blocked?', because that cash is already committed to another deal.':'. Ask me what it would take to make it work.'),
      {kind:'compile',title:'Does not compile',subtitle:cap(deal),tone:'bad',facts:[{label:'Shortfall',value:displayRupiah(data.shortfallRupiah)},{label:'First violation',value:String(data.firstViolationDate)},
       {label:'Cash floor',value:displayRupiah(obj(data.cashFloorRupiah).amount??data.cashFloorRupiah)},...(blocked?[{label:'Blocked by',value:arr(data.conflictingCommitmentIds).length+' committed reservation(s)'}]:[])]});
    }
    return done('confirm',`Yes. ${cap(deal)} compiles against your projected cash.`,{kind:'compile',title:outcome.replaceAll('_',' '),subtitle:cap(deal),tone:'good',facts:[{label:'Outcome',value:outcome}]});
   }
   case 'recompile_deal':{
    const outcome=String(data.outcome),bp=depositBasisPoints(proof),min=data.minimumProjectedBalanceRupiah;
    const facts=[{label:'Deposit',value:percent(bp)},{label:'Lowest projected balance',value:displayRupiah(min)},{label:'Candidates checked',value:String(data.evaluatedCandidates??'—')},{label:'New version',value:String(data.version??'—')}];
    if(outcome==='PROPOSED_AMENDMENT')return done('confirm',`I checked ${String(data.evaluatedCandidates)} options. The smallest change that works is a ${percent(bp)} deposit. Your lowest projected balance becomes ${spokenRupiah(min)}. I saved it as version ${String(data.version)} with a new proof.`,
     {kind:'amendment',title:'Smallest working amendment',subtitle:cap(deal),tone:'good',facts});
    if(outcome==='REMEDIATION_PENDING')return done('confirm',`${cap(deal)} is already booked, so I left the sales order alone and proposed a remediation: raise the deposit to ${percent(bp)}. The lowest projected balance becomes ${spokenRupiah(min)}. It needs a human to accept it.`,
     {kind:'remediation',title:'Remediation proposed',subtitle:`${cap(deal)} · booked order untouched`,tone:'warn',facts});
    return done('confirm',`I could not find an amendment inside policy for ${deal}.`,{kind:'amendment',title:outcome.replaceAll('_',' '),tone:'bad',facts:[{label:'Candidates checked',value:String(data.evaluatedCandidates??'—')}]});
   }
   case 'generate_proof':return done('confirm',`Proof generated for ${deal}. Its hash starts with ${String(proof.proofHash).slice(0,8)}.`,
    {kind:'proof',title:'Proof generated',subtitle:cap(deal),tone:'good',facts:[{label:'Proof hash',value:String(proof.proofHash).slice(0,16)+'…'},{label:'Status',value:String(proof.status)}]});
   case 'stress_deal':{
    const run=obj(arr(data.runs)[0]),stressed=obj(run.result),outcome=String(stressed.outcome??'UNKNOWN');
    const ok=outcome==='COMPILES'||outcome==='CONDITIONALLY_VALID';
    const min=obj(stressed.timeline).minimumProjectedBalance??obj(obj(stressed.worstLiquidityPoint)).balance;
    const days=Number(obj(arr(action.input.scenarios)[0]).days);
    return done('confirm',ok?`Still safe. Even if the customer pays ${days} ${days===1?'day':'days'} late, the deal stays above your cash floor`+(min!==undefined?`, with a lowest balance of ${spokenRupiah(min)}.`:'.')
     :`That breaks it. With the delay, you would miss your cash floor on ${spokenDate(stressed.firstViolationDate)}.`,
     {kind:'stress',title:ok?'Survives the stress':'Fails under stress',subtitle:String(obj(run.scenario).id??run.id??'stress'),tone:ok?'good':'bad',
      facts:[{label:'Outcome',value:outcome},{label:'Scope',value:'Historical proof (no ERP write)'},...(min!==undefined?[{label:'Lowest balance',value:displayRupiah(min)}]:[])]});
   }
   case 'reserve_liquidity':return done('confirm',`Reserved. The cash ${deal} needs is now earmarked, so no other deal can spend it.`,
    {kind:'reserve',title:'Liquidity reserved',subtitle:cap(deal),tone:'good',facts:[{label:'Commitment',value:String(data.commitmentId??result.references.commitmentId??'—')},{label:'Revision',value:String(result.references.revision??'—')}]});
   case 'commit_deal':return done('confirm',`Committed. ${cap(deal)} is booked and the sales order is in the ERP.`,
    {kind:'commit',title:'Deal committed',subtitle:cap(deal),tone:'good',facts:[{label:'Sales order',value:String(data.salesOrderId??result.references.salesOrderId??'—')},{label:'Status',value:String(data.status??'committed')}]});
   case 'mutate_judge_obligation':return done('confirm','Recorded. The supplier invoice is now 19 million rupiah. Any proof that relied on the old amount is now stale.',
    {kind:'erp',title:'ERP fact changed',subtitle:'Synthetic supplier invoice',tone:'warn',facts:[{label:'Invoice',value:'judge-existing-ap'},{label:'New amount',value:'Rp 19,000,000'}]});
   case 'replay_proof':{
    const historical=obj(data.historical);
    return done('confirm',`Replayed. The original proof reproduces exactly the same result from its frozen inputs. It is still marked ${String(data.currentStatus).toLowerCase()}, because the world changed, not the math.`,
     {kind:'replay',title:'Historical proof reproduced',tone:'good',facts:[{label:'Current status',value:String(data.currentStatus)},{label:'Proof hash',value:String(data.proofHash??'').slice(0,16)+'…'},
      ...(historical.resultHash?[{label:'Result hash match',value:String(historical.resultHash===historical.recomputedResultHash||historical.recomputedResultHash===undefined)}]:[])]});
   }
   default:return done('confirm','Done.',{kind:'done',title:'Done',tone:'good',facts:[]});
  }
 }
}
export class AlexaRefusal extends Error {constructor(readonly code:string){super(code);}}
const erpWriters=new Set<ToolName>(['reserve_liquidity','commit_deal','mutate_judge_obligation','recompile_deal']);
const refusalSpeech:Record<string,string>={
 APPROVAL_REQUIRED:"Not yet. This proof includes terms that need a finance approver's sign-off, and I'm not allowed to approve my own deal. Once the approver signs off, say commit again.",
 LIQUIDITY_COLLISION:'Blocked. That cash is already committed to another deal. Reserving it twice would double-spend your runway, so nothing was written.',
 REVISION_CONFLICT:'The books changed since I prepared that, so I stopped. Ask again and I will use the latest state.',
 CONFIRMATION_REQUIRED:'That confirmation is no longer valid. Ask again.',
 LIVE_PROVIDER_NOT_AUTHORIZED:'Live AI extraction is switched off in this demo. Nothing was sent anywhere.',
 PROOF_STALE:'That proof is stale. Ask me to fix the deal first.',
 FORBIDDEN_ROLE:'Your role is not allowed to do that.',
 UNAUTHENTICATED:'Your judge session expired. Open the judge link again.',
};
function cap(text:string){return text.charAt(0).toUpperCase()+text.slice(1);}
function titleCase(code:string){return cap(code.toLowerCase().replaceAll('_',' '));}
