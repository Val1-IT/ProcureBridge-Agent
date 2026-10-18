import type {EvaluationScenario} from './scenario-schema';
import {parseScenarios} from './scenario-schema';
export function generateScenarios(seed:number,count:number):readonly EvaluationScenario[]{
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isInteger(count)||count<1||count>250)throw new Error('INVALID_GENERATOR_INPUT');
 let state=seed;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0;
 const cash=(base:bigint,span:number)=>(base+BigInt(next()%span)).toString();
 const rows:EvaluationScenario[]=[];
 for(let index=0;index<count;index++){
  const deposit=1000+(next()%31)*100;const balance=2+next()%18;
  const cost=index%11===0?31:index%7===0?balance:index%5===0?4:2+next()%15;
  rows.push({id:`generated-${seed}-${index}`,tags:[...(cost===balance||cost===4?['same_day']:[]),...(cost>26?['late']:[])],
   cash:{openingRupiah:cash(23000000n,10000001),floorRupiah:'5000000',payableRupiah:cash(10000000n,15000001),receivableRupiah:cash(10000000n,20000001)},
   deal:{revenueRupiah:cash(40000000n,30000001),directCostRupiah:cash(30000000n,35000001),depositBps:deposit,balanceDays:balance,costDays:cost},
   amendment:{maxDepositBps:Math.min(4000,deposit+200),minBalanceDays:Math.max(0,balance-2),maxCostDays:cost+2,allowSupplier:true,receiptDelayDays:3}});
 }
 return parseScenarios(rows);
}
