import {z} from 'zod';
export interface EvaluationScenario {
 readonly id:string; readonly tags:readonly string[];
 readonly cash:{readonly openingRupiah:string;readonly floorRupiah:string;readonly payableRupiah:string;readonly receivableRupiah:string};
 readonly deal:{readonly revenueRupiah:string;readonly directCostRupiah:string;readonly depositBps:number;readonly balanceDays:number;readonly costDays:number};
 readonly amendment:{readonly maxDepositBps:number;readonly minBalanceDays:number;readonly maxCostDays:number;readonly allowSupplier:boolean;readonly receiptDelayDays:number};
}
const money=z.string().regex(/^(0|[1-9][0-9]{0,17})$/);
const positive=money.refine(value=>BigInt(value)>0n);
const legacy=positive.refine(value=>BigInt(value)<=BigInt(Number.MAX_SAFE_INTEGER));
const day=z.number().int().min(0).max(60);const rate=z.number().int().min(0).max(10000);
export const scenarioSchema=z.strictObject({id:z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/),tags:z.array(z.enum(['judge','rounding','same_day','late','large'])).max(5),
 cash:z.strictObject({openingRupiah:money,floorRupiah:money,payableRupiah:legacy,receivableRupiah:legacy}),
 deal:z.strictObject({revenueRupiah:positive,directCostRupiah:positive,depositBps:rate,balanceDays:day,costDays:day}),
 amendment:z.strictObject({maxDepositBps:rate,minBalanceDays:day,maxCostDays:day,allowSupplier:z.boolean(),receiptDelayDays:z.number().int().min(0).max(14)}),
}).refine(row=>row.amendment.maxDepositBps>=row.deal.depositBps&&row.amendment.minBalanceDays<=row.deal.balanceDays&&row.amendment.maxCostDays>=row.deal.costDays)
 .refine(row=>(Math.floor((row.amendment.maxDepositBps-row.deal.depositBps)/100)+1)*(row.deal.balanceDays-row.amendment.minBalanceDays+1)*((row.amendment.allowSupplier?row.amendment.maxCostDays:row.deal.costDays)-row.deal.costDays+1)<=5000);
export function parseScenarios(value:unknown):readonly EvaluationScenario[]{
 const rows=z.array(scenarioSchema).min(1).max(250).parse(value);
 if(new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error('DUPLICATE_SCENARIO_ID');
 return rows;
}
