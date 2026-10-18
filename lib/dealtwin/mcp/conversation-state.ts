import {z} from 'zod';
import {toolNames} from './tool-schemas';
import type {DealTwinToolResult} from './tool-handlers';
import type {CanonicalJsonValue} from '../domain/canonical-json';
const id=z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/);
const stateSchema=z.strictObject({
 schemaVersion:z.literal('dealtwin.conversation.v1'),pendingIntent:z.enum(['none','prepared','refresh']),
 preparedTool:z.enum(toolNames as [typeof toolNames[number],...typeof toolNames[number][]]).optional(),
 dealId:id.optional(),dealVersionId:id.optional(),proofId:id.optional(),commitmentId:id.optional(),salesOrderId:id.optional(),
 revision:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
});
export type ConversationState=z.infer<typeof stateSchema>;
export const initialConversation:ConversationState=Object.freeze({schemaVersion:'dealtwin.conversation.v1',pendingIntent:'none'});
export function serializeConversation(state:ConversationState):string{return JSON.stringify(stateSchema.parse(state));}
export function deserializeConversation(value:string):ConversationState{
 if(new TextEncoder().encode(value).length>4096)throw new Error('INVALID_CONVERSATION');
 return stateSchema.parse(JSON.parse(value));
}
function object(value:CanonicalJsonValue|undefined):Readonly<Record<string,CanonicalJsonValue>>{
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Readonly<Record<string,CanonicalJsonValue>>:{};
}
/** Convenience identifiers only, never authentication or financial truth. */
export function advanceConversation(previous:ConversationState,result:DealTwinToolResult):ConversationState{
 const state=stateSchema.parse(previous);
 if(result.prepared)return {...state,pendingIntent:'prepared',preparedTool:result.tool};
 if(result.httpStatus<200||result.httpStatus>=300){
  const code=object(object(result.data).error).code;
  return ['REVISION_CONFLICT','VERSION_CONFLICT','PROOF_STALE','STALE_PROOF','PROOF_IDENTITY_MISMATCH'].includes(String(code))
   ?{...state,pendingIntent:'refresh'}:state;
 }
 const incoming=result.references;
 // Immutable success receipts are historical responses, not current-state reads.
 if(incoming.revision!==undefined&&state.revision!==undefined&&incoming.revision<state.revision)return {...state,pendingIntent:'refresh'};
 const proofChanged=incoming.proofId!==undefined&&incoming.proofId!==state.proofId;
 // Replay/stress responses can identify a proof without identifying its owner.
 // Never attach that proof to the previous aggregate or its occupied capacity.
 if(proofChanged&&(incoming.dealId===undefined||incoming.dealVersionId===undefined)){
  return stateSchema.parse({...initialConversation,proofId:incoming.proofId,revision:incoming.revision??state.revision,pendingIntent:'refresh'});
 }
 const data=object(result.data),proof=object(data.proof);
 const selectedProofId=incoming.proofId??state.proofId;
 const graphProof=Array.isArray(data.proofs)?data.proofs.map(value=>object(value)).find(value=>value.id===selectedProofId):undefined;
 const status=String(proof.currentStatus??data.currentStatus??graphProof?.currentStatus);
 const stale=['STALE','INVALID'].includes(status);
 const verifiedCurrent=['VALID','CONDITIONALLY_VALID'].includes(status);
 const changed=(incoming.dealId!==undefined&&incoming.dealId!==state.dealId)
  ||(incoming.dealVersionId!==undefined&&incoming.dealVersionId!==state.dealVersionId);
 const {preparedTool:_,...clean}=changed||proofChanged?initialConversation:state;void _;
 // Unrelated successful reads do not resolve a known stale/revision warning.
 const refresh=stale||(state.pendingIntent==='refresh'&&!changed&&!proofChanged&&!verifiedCurrent);
 return stateSchema.parse({...clean,...incoming,pendingIntent:refresh?'refresh':'none'});
}
