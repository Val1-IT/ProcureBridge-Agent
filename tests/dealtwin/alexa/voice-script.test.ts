import {writeFileSync} from 'node:fs';
import {afterAll,describe,expect,it,vi} from 'vitest';
import {POST as turn} from '../../../app/api/dealtwin/alexa/turn/route';
import {POST as mcp} from '../../../app/api/dealtwin/mcp/route';
import {POST as approve} from '../../../app/api/dealtwin/approvals/[approvalId]/decision/route';
import type {AlexaTurnResult} from '../../../lib/server/dealtwin/alexa-orchestrator';
import {workspace,request,evidence} from '../api/workflow-harness';

let db:ReturnType<typeof workspace>;
vi.mock('../../../lib/server/dealtwin/workflow-runtime',async()=>{
 const actual=await vi.importActual<typeof import('../../../lib/server/dealtwin/workflow-runtime')>('../../../lib/server/dealtwin/workflow-runtime');
 return {...actual,getWorkflowRuntime:()=>actual.createPostgresWorkflowRuntime(db().appPool)};
});
vi.mock('../../../lib/server/dealtwin/runtime',async()=>{
 const actual=await vi.importActual<typeof import('../../../lib/server/dealtwin/runtime')>('../../../lib/server/dealtwin/runtime');
 return {...actual,getJudgeRuntime:()=>actual.createPostgresJudgeRuntime(db().appPool,db().resetPool)};
});
type Turn=AlexaTurnResult&{ok:boolean};
const transcript:string[]=[];
async function post(body:Record<string,unknown>,role:'admin'|'approver'='admin'):Promise<{status:number;body:Turn}>{
 const response=await turn(request('alexa/turn',body,role));
 return {status:response.status,body:await response.json() as Turn};
}
function createSession(){
 let conversation:string|undefined;let ticket:string|undefined;
 async function say(utterance:string):Promise<Turn>{
  const {status,body}=await post({utterance,...(conversation?{conversation}:{}),...(ticket?{ticket}:{})});
  expect(status).toBe(200);conversation=body.conversation;ticket=body.pending?.ticket;
  transcript.push('USER: '+utterance,'ALEXA: '+body.speech);
  return body;
 }
 return {say,get ticket(){return ticket;}};
}
async function approvalFor(dealId:string){
 const response=await mcp(new Request('http://localhost/api/dealtwin/mcp',{method:'POST',headers:{...Object.fromEntries(request('mcp',{}).headers),accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_deal',arguments:{dealId}}})}));
 const data=(await response.json() as {result:{structuredContent:{data:{revision:number;currentVersion:{id:string};proofs:{id:string;dealVersionId:string;generatedAt:string;approvals:{id:string;status:string}[]}[]}}}}).result.structuredContent.data;
 const proof=data.proofs.filter(row=>row.dealVersionId===data.currentVersion.id).sort((l,r)=>l.generatedAt.localeCompare(r.generatedAt)).at(-1)!;
 return {revision:data.revision,proof,approval:proof.approvals.find(row=>row.status==='pending')!};
}

describe('simulated Alexa+ voice script / real MCP route and PostgreSQL',()=>{
 db=workspace();
 it('runs the judge script with prepare-then-confirm on every write',async()=>{
  const alexa=createSession();
  const launch=await alexa.say('Alexa, open DealTwin');
  expect(launch.card.kind).toBe('connected');expect(launch.trace.map(row=>row.method)).toEqual(['initialize','tools/list']);

  const before=await evidence(db());
  const ask=await alexa.say('Can I accept deal A?');
  expect(ask.pending?.tool).toBe('compile_deal');expect(ask.trace.at(-1)).toMatchObject({tool:'compile_deal',mode:'prepare'});
  // Structured terms come from get_deal before the verdict; the voice layer invents none of them.
  expect(ask.speech).toMatch(/^Here are the terms of deal A\. It is .+ rupiah, with a \d+(\.\d+)?% deposit and the balance due in \d+ days/);
  expect(ask.card.facts.map(fact=>fact.label)).toEqual(expect.arrayContaining(['Customer','Deal value','Deposit','Balance due','Supplier costs']));
  expect(await evidence(db())).toEqual(before);
  const failed=await alexa.say('Yes');
  expect(failed.speech).toContain('3 million rupiah short');expect(failed.speech).toContain('September 22');expect(failed.card.tone).toBe('bad');

  await alexa.say('What would it take to make it work?');
  const amended=await alexa.say('Yes');
  expect(amended.card.kind).toBe('amendment');expect(amended.speech).toContain('25% deposit');expect(amended.speech).toContain('5 million rupiah');

  const proof=await alexa.say('Show me the proof');
  expect(proof.card.kind).toBe('proof');expect(proof.pending).toBeNull();

  await alexa.say('What if the customer pays three days late?');
  const stressed=await alexa.say('Yes');expect(stressed.card.kind).toBe('stress');

  await alexa.say('Reserve the cash for deal A');
  expect((await alexa.say('Yes')).card.kind).toBe('reserve');

  await alexa.say('Commit deal A');
  const blocked=await alexa.say('Yes');
  expect(blocked.card.title).toBe('Approval required');expect(blocked.speech).toContain('finance approver');

  const {revision,proof:a,approval}=await approvalFor('judge-deal-a');
  const decided=await approve(request('approvals/'+approval.id+'/decision',{proofId:a.id,dealVersionId:a.dealVersionId,decision:'approved',comment:'Synthetic approver signs off the fixed proof',expectedRevision:revision,idempotencyKey:'alexa-approval'},'approver'),{params:Promise.resolve({approvalId:approval.id})});
  expect(decided.status).toBe(200);

  await alexa.say('Commit deal A');
  const committed=await alexa.say('Yes');
  expect(committed.card.kind).toBe('commit');expect(committed.speech).toContain('sales order');

  await alexa.say('Check deal B');
  const b=await alexa.say('Yes');
  expect(b.speech).toContain('5 million rupiah short');

  await alexa.say('The supplier invoice went up to 19 million');
  expect((await alexa.say('Yes')).card.kind).toBe('erp');
  const stale=await alexa.say('Is the deal A proof still valid?');
  expect(stale.speech).toContain('stale');

  await alexa.say('Fix deal A');
  const remediation=await alexa.say('Yes');
  expect(remediation.card.kind).toBe('remediation');expect(remediation.speech).toContain('27%');expect(remediation.speech).toContain('5.2 million rupiah');

  await alexa.say('Replay the original proof');
  const replay=await alexa.say('Yes');
  expect(replay.card.kind).toBe('replay');expect(replay.speech).toContain('stale');
 },60000);
 // Optional evidence: DEALTWIN_ALEXA_TRANSCRIPT=<file> writes the spoken script for docs review.
 afterAll(()=>{if(process.env.DEALTWIN_ALEXA_TRANSCRIPT)writeFileSync(process.env.DEALTWIN_ALEXA_TRANSCRIPT,transcript.join('\n')+'\n');});

 it('never executes without a matching signed ticket, and cancels without writes',async()=>{
  const alexa=createSession();
  const prepared=await alexa.say('Can I accept deal A?');
  const before=await evidence(db());
  const cancelled=await post({action:'cancel',ticket:prepared.pending!.ticket});
  expect(cancelled.body.card.kind).toBe('cancelled');expect(await evidence(db())).toEqual(before);
  const forged=prepared.pending!.ticket.slice(0,-2)+(prepared.pending!.ticket.endsWith('AA')?'BB':'AA');
  expect((await post({action:'confirm',ticket:forged})).body.card.kind).toBe('expired');
  expect((await post({utterance:'yes'})).body.card.kind).toBe('expired');
  expect(await evidence(db())).toEqual(before);
  // A ticket is bound to the actor that prepared it.
  const other=await turn(request('alexa/turn',{action:'confirm',ticket:prepared.pending!.ticket},'sales'));
  expect((await other.json() as Turn).card.kind).toBe('expired');
  expect(JSON.stringify(prepared)).not.toMatch(/confirmationToken/);
 });

 it('refuses roles outside the MCP allow-list and unauthenticated callers',async()=>{
  expect((await post({utterance:'open DealTwin'},'approver')).status).toBe(403);
  expect((await turn(request('alexa/turn',{utterance:'open DealTwin'},null))).status).toBe(401);
 });
});
