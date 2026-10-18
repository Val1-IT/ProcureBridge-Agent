import type {CommercialConstraint} from '../domain/constraint';
import type {CanonicalJsonValue} from '../domain/canonical-json';
import {z} from 'zod';
import {validateConstraints} from '../domain/constraint';
import {decodeConstraints} from '../proof/replay-proof';
import {sha256Canonical} from '../domain/canonical-json';
import {PROMPT_VERSION,SYSTEM_PROMPT} from './prompt';
export class ExtractionError extends Error {constructor(readonly code:string,readonly httpStatus=422){super(code);}}
export interface ConstraintExtractionInput {readonly text:string;readonly confirmedConstraints:readonly CommercialConstraint[];readonly context:CanonicalJsonValue}
export interface ProviderReply {readonly content:string;readonly provider:string;readonly model:string}
export interface ConstraintProvider {complete(input:{system:string;user:string}):Promise<ProviderReply>}
export interface ConstraintExtractionResult {readonly schemaVersion:'dealtwin.constraint-extraction.v1';readonly candidates:readonly CommercialConstraint[];readonly missingFields:readonly string[];readonly metadata:{provider:string;model:string;promptVersion:string;schemaVersion:string;inputHash:string}}
export interface ConstraintExtractionPort {extract(input:ConstraintExtractionInput):Promise<ConstraintExtractionResult>}
const id=z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/);
const quoted={sourceText:z.string().min(1).max(3000).refine(value=>value.trim()===value)};
const rate=z.number().int().min(0).max(10000);const days=z.number().int().min(0).max(36500);
const candidate=z.discriminatedUnion('kind',[
 z.strictObject({...quoted,kind:z.literal('customer_deposit_max_bps'),value:rate}),
 z.strictObject({...quoted,kind:z.literal('customer_deposit_min_bps'),value:rate}),
 z.strictObject({...quoted,kind:z.literal('customer_balance_due_days'),value:days}),
 z.strictObject({...quoted,kind:z.literal('supplier_payment_due_days'),value:days}),
 z.strictObject({...quoted,kind:z.literal('protect_existing_supplier_due_dates'),value:z.literal(true)}),
 z.strictObject({...quoted,kind:z.literal('new_borrowing_allowed'),value:z.literal(false)}),
 z.strictObject({...quoted,kind:z.literal('minimum_cash_rupiah'),value:z.string().regex(/^(0|[1-9][0-9]{0,17})$/)}),
 z.strictObject({...quoted,kind:z.literal('required_inventory_available'),value:z.strictObject({productId:id,warehouseId:id,quantity:z.number().int().positive().max(1000000)})}),
 z.strictObject({...quoted,kind:z.literal('required_approval'),value:z.strictObject({approvalCode:id})}),
]);
const schema=z.strictObject({schemaVersion:z.literal('dealtwin.constraint-extraction.v1'),candidates:z.array(candidate).max(16),missingFields:z.array(z.string().trim().min(1).max(512)).max(16)})
 .refine(value=>value.candidates.length+value.missingFields.length>0);
const operators={customer_deposit_max_bps:'lte',customer_deposit_min_bps:'gte',customer_balance_due_days:'lte',supplier_payment_due_days:'gte',protect_existing_supplier_due_dates:'eq',new_borrowing_allowed:'eq',minimum_cash_rupiah:'gte',required_inventory_available:'gte',required_approval:'eq'} as const;
function wire(value:unknown):CanonicalJsonValue{return JSON.parse(JSON.stringify(value,(_key,item:unknown)=>typeof item==='bigint'?item.toString():item)) as CanonicalJsonValue;}
export class NemotronConstraintExtractor implements ConstraintExtractionPort {
 constructor(private readonly provider:ConstraintProvider){}
 async extract(input:ConstraintExtractionInput):Promise<ConstraintExtractionResult>{
  if(typeof input.text!=='string'||!input.text.trim()||input.text.length>3000||!validateConstraints(input.confirmedConstraints).ok||input.confirmedConstraints.some(row=>row.resolution!=='confirmed'))throw new ExtractionError('AI_INPUT_INVALID');
  const payload=wire(input);const inputHash=sha256Canonical(payload);const user=JSON.stringify(payload);
  if(Buffer.byteLength(user)>32768)throw new ExtractionError('AI_INPUT_INVALID');
  const reply=await this.provider.complete({system:SYSTEM_PROMPT,user});
  let parsed:z.infer<typeof schema>;
  try{if(reply.content.length>65536)throw new Error();parsed=schema.parse(JSON.parse(reply.content));}catch{throw new ExtractionError('AI_OUTPUT_INVALID');}
  if(parsed.candidates.some(row=>!input.text.includes(row.sourceText)))throw new ExtractionError('AI_OUTPUT_INVALID');
  const rows=parsed.candidates.map((row,index)=>({...row,id:'ai-candidate:'+index,operator:operators[row.kind],provenance:'ai_extracted',resolution:'pending_confirmation'}));
  const decoded=decodeConstraints(wire(rows));if(!decoded.ok)throw new ExtractionError('AI_OUTPUT_INVALID');
  if(!validateConstraints([...input.confirmedConstraints,...decoded.value.constraints]).ok)throw new ExtractionError('CONFLICTING_CONFIRMED_CONSTRAINT');
  if(!reply.provider||!reply.model||reply.provider.length>64||reply.model.length>160)throw new ExtractionError('AI_OUTPUT_INVALID');
  return {schemaVersion:parsed.schemaVersion,candidates:decoded.value.constraints,missingFields:parsed.missingFields,metadata:{provider:reply.provider,model:reply.model,promptVersion:PROMPT_VERSION,schemaVersion:parsed.schemaVersion,inputHash}};
 }
}
