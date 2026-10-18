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
export function listToolDefinitions(){
 return toolNames.map(name=>({name,description:isMutatingTool(name)
  ?'Synthetic service only. Prepare is read-free/write-free; execution requires server-signed human consent, revision and operation key.'
  :'Read-only synthetic application service; persisted source of truth, not a permission grant.',
  inputSchema:z.toJSONSchema(toolArgumentSchemas[name]),
  annotations:{readOnlyHint:!isMutatingTool(name),idempotentHint:true,destructiveHint:['commit_deal','release_commitment','mutate_judge_obligation'].includes(name),openWorldHint:false}}));
}
