import { z } from 'zod';
const id=z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/);const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money=z.string().regex(/^(0|[1-9][0-9]{0,17})$/);
const days=z.number().int().min(0).max(36500);const order=z.number().int().min(0).max(100000);
const payment={eventId:id,basisPoints:z.number().int().min(0).max(10000),daysFromAcceptance:days,effectiveDate:date,sameDayOrder:order};
const terms=z.strictObject({schemaVersion:z.literal('dealtwin.deal-terms.v1'),currency:z.literal('IDR'),customerId:id,warehouseId:id,acceptedDate:date,
 productLines:z.array(z.strictObject({lineId:id,productId:id,quantity:z.number().int().positive().max(1000000),unitPriceRupiah:money})).min(1).max(16),
 customerPaymentEvents:z.tuple([z.strictObject({...payment,role:z.literal('customer_deposit'),daysFromAcceptance:z.literal(0)}),z.strictObject({...payment,role:z.literal('customer_balance')})]),
 directCostEvents:z.array(z.strictObject({eventId:id,role:z.literal('direct_cost'),supplierId:id.nullable(),productLineIds:z.array(id).min(1).max(16),amountRupiah:money,daysFromAcceptance:days,effectiveDate:date,sameDayOrder:order,
  orderingSource:z.enum(['explicit','conservative','unresolved']),provenance:z.strictObject({sourceType:z.string().trim().min(1).max(128),sourceId:id,sourceRevision:z.string().trim().min(1).max(128),evidence:z.string().trim().min(1).max(512)})})).max(16)});
const mutation=z.strictObject({expectedRevision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1),idempotencyKey:id});
const version=mutation.extend({dealVersionId:id});
const scenarioBase={schemaVersion:z.literal('dealtwin.stress-scenario.v1'),id};
const scenarios=z.array(z.discriminatedUnion('type',[
 z.strictObject({...scenarioBase,type:z.literal('customer_receipt_delay'),days}),
 z.strictObject({...scenarioBase,type:z.literal('direct_outflow_increase'),basisPoints:z.number().int().min(0).max(10000)}),
 z.strictObject({...scenarioBase,type:z.literal('specified_receipt_delay'),eventId:id,days}),
 z.strictObject({...scenarioBase,type:z.literal('new_obligation'),amountRupiah:money,date,sameDayOrder:order.refine(value=>value>0)}),
])).min(1).max(8);
const self=z.strictObject({proofId:id,dealVersionId:id,canonicalEventHash:z.string().regex(/^[0-9a-f]{64}$/)});
export const workflowSchemas={
 create:mutation.extend({title:z.string().trim().min(1).max(160),terms}),edit:version.extend({terms}),compile:version,generate:version,recompile:version,
 replay:mutation,confirm:version.extend({constraintIds:z.array(id).min(1).max(32)}),
 extract:version.extend({text:z.string().min(1).max(3000).refine(value=>value.trim().length>0)}),
 stress:mutation.extend({scenarios}),replace:mutation.extend({previous:self,replacement:self}),
 obligation:mutation.extend({amountRupiah:z.literal('19000000')}),
 approval:mutation.extend({proofId:id,dealVersionId:id,decision:z.enum(['approved','rejected']),comment:z.string().trim().min(1).max(1000)}),
} as const;
export type WorkflowOperation=keyof typeof workflowSchemas;
