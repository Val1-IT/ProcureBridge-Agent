import {z} from 'zod';
import {workflowSchemas} from '../application/workflow-schemas';
const id=z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/);
const mutation=z.strictObject({expectedRevision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1),idempotencyKey:id});
const identity={proofId:id,dealVersionId:id,canonicalEventHash:z.string().regex(/^[0-9a-f]{64}$/)};
function mutating<T extends z.ZodType>(input:T){
 return z.strictObject({mode:z.enum(['prepare','execute']),input,confirmationToken:z.string().min(1).max(2048).optional()});
}
export const toolArgumentSchemas={
 list_deals:z.strictObject({}),get_deal:z.strictObject({dealId:id}),get_proof:z.strictObject({dealId:id,proofId:id}),inspect_timeline:z.strictObject({}),
 draft_deal:mutating(workflowSchemas.create),update_deal:mutating(workflowSchemas.edit.extend({dealId:id})),
 extract_constraints:mutating(workflowSchemas.extract.extend({dealId:id})),confirm_constraints:mutating(workflowSchemas.confirm.extend({dealId:id})),
 compile_deal:mutating(workflowSchemas.compile.extend({dealId:id})),generate_proof:mutating(workflowSchemas.generate.extend({dealId:id})),
 stress_deal:mutating(workflowSchemas.stress.extend({proofId:id})),replay_proof:mutating(workflowSchemas.replay.extend({proofId:id})),
 recompile_deal:mutating(workflowSchemas.recompile.extend({dealId:id})),
 reserve_liquidity:mutating(mutation.extend({...identity,dealId:id})),commit_deal:mutating(mutation.extend({...identity,dealId:id})),
 release_commitment:mutating(mutation.extend({...identity,commitmentId:id})),
 mutate_judge_obligation:mutating(workflowSchemas.obligation.extend({invoiceId:z.literal('judge-existing-ap')})),
} as const;
export type ToolName=keyof typeof toolArgumentSchemas;
export type DealTwinToolRequest={[K in ToolName]:{tool:K;arguments:z.infer<(typeof toolArgumentSchemas)[K]>}}[ToolName];
export const toolNames=Object.keys(toolArgumentSchemas) as ToolName[];
const requestSchema=z.union(toolNames.map(tool=>z.strictObject({tool:z.literal(tool),arguments:toolArgumentSchemas[tool]})));
export function parseToolRequest(value:unknown):DealTwinToolRequest{
 const encoded=JSON.stringify(value);
 if(!encoded||new TextEncoder().encode(encoded).length>4096)throw new Error('INVALID_TOOL_REQUEST');
 return requestSchema.parse(value) as DealTwinToolRequest;
}
export function isMutatingTool(name:ToolName):boolean{return !['list_deals','get_deal','get_proof','inspect_timeline'].includes(name);}
const descriptions:Record<ToolName,string>={
 list_deals:'List persisted synthetic deals and the current workspace revision.',
 get_deal:'Read one durable deal, its current version, constraints and proof history. Refresh after a revision conflict.',
 get_proof:'Read a selected proof belonging to the specified deal, including its current validity; historical proof bytes are not present-day eligibility.',
 inspect_timeline:'Read the server-owned synthetic cash timeline and revision; conversation memory is not financial truth.',
 draft_deal:'Create a durable synthetic draft from exact commercial terms; drafting does not reserve capacity or create a Sales Order.',
 update_deal:'Create a new immutable terms version for an existing deal; the prior version remains historical.',
 extract_constraints:'On execution, request commercial-language extraction from external Nebius/Nemotron only when explicitly enabled. Persist review-only pending candidates; unavailable live access fails closed. Human confirmation remains required.',
 confirm_constraints:'Confirm selected constraint IDs on the current deal version after human review; AI extraction cannot confirm its own candidates.',
 compile_deal:'Run the deterministic financial compiler against authoritative ERP state; return violations or conditional feasibility, never an AI verdict.',
 generate_proof:'Persist a replayable Deal Proof for the selected current version; pending non-arithmetic approvals do not authorize commitment.',
 stress_deal:'Evaluate explicit stress scenarios against a historical proof without changing the commercial terms or committing liquidity.',
 replay_proof:'Genuinely recompute a historical proof; replay success does not make a stale proof currently eligible.',
 recompile_deal:'Search bounded deterministic amendments against current ERP state; a committed deal produces pending remediation without a second Sales Order.',
 reserve_liquidity:'Reserve shared liquidity for the exact deal/version/proof/event-hash tuple; reject stale evidence and competing capacity collisions.',
 commit_deal:'Commit the exact reserved proof only after its required approval; create one linked Sales Order and preserve original-response idempotency.',
 release_commitment:'Release the identified reservation using its exact proof owner tuple; do not infer cancellation of a committed Sales Order.',
 mutate_judge_obligation:'Change only the allowlisted synthetic Judge AP obligation to Rp19m and invalidate affected proofs; never a general ERP mutation.',
};
export function listToolDefinitions(){
 return toolNames.map(name=>({name,description:descriptions[name]+(isMutatingTool(name)
  ?' Prepare only validates shape: no read, write or provider call. Execute requires server-signed human confirmation, current revision and an idempotency key; a model cannot issue the grant.'
  :' Read-only application service, not a permission grant.'),
  inputSchema:z.toJSONSchema(toolArgumentSchemas[name]),
  annotations:{readOnlyHint:!isMutatingTool(name),idempotentHint:true,destructiveHint:['commit_deal','release_commitment','mutate_judge_obligation'].includes(name),openWorldHint:name==='extract_constraints'}}));
}
