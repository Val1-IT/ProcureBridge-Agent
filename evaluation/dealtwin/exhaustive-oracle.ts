import type {EvaluationScenario} from './scenario-schema';
import {parseScenarios} from './scenario-schema';
export interface OracleResult {readonly eligible:boolean;readonly minimumRupiah:string;readonly firstViolationDate:string|null;readonly shortfallRupiah:string|null;readonly winner:readonly [number,number,number]|null;readonly evaluatedCandidates:number;readonly feasibleCandidates:number}
// Independent reference: no production compiler, timeline, money, search or stress
// helper imports. Exhaust ALL bounded amendments and ALL ordered cash prefixes.
const date=(days:number)=>new Date(Date.UTC(2026,8,16)+days*86400000).toISOString().slice(0,10);
function walk(s:EvaluationScenario,deposit:number,balanceDays:number,costDays:number,delay:number){
 const revenue=BigInt(s.deal.revenueRupiah);const upfront=revenue*BigInt(deposit)/10000n;
 const events=[{id:'ap',date:'2026-09-15',order:300,amount:-BigInt(s.cash.payableRupiah)},
  {id:'ar',date:'2026-09-20',order:500,amount:BigInt(s.cash.receivableRupiah)},
  {id:'deposit',date:date(delay),order:500,amount:upfront},
  {id:'balance',date:date(balanceDays+delay),order:500,amount:revenue-upfront},
  {id:'cost',date:date(costDays),order:300,amount:-BigInt(s.deal.directCostRupiah)}].filter(row=>row.amount!==0n);
 events.sort((a,b)=>a.date.localeCompare(b.date)||a.order-b.order||a.id.localeCompare(b.id));
 let current=BigInt(s.cash.openingRupiah);let minimum=current;const floor=BigInt(s.cash.floorRupiah);
 const points=[{date:'2026-09-12',balance:current}];
 for(const event of events){current+=event.amount;points.push({date:event.date,balance:current});if(current<minimum)minimum=current;}
 const belowFloor=points.find(row=>row.balance<floor);const negative=points.find(row=>row.balance<0n);
 // Existing compiler contract selects first violating date, then no-borrowing
 // before minimum-cash if both failures occur on the same calendar date.
 const first=negative&&(!belowFloor||negative.date<=belowFloor.date)?negative:belowFloor;
 const boundary=first===negative?0n:floor;
 return {eligible:!first,minimumRupiah:minimum.toString(),firstViolationDate:first?.date??null,shortfallRupiah:first?(boundary-first.balance).toString():null};
}
export function evaluateExhaustively(value:EvaluationScenario):OracleResult{
 const s=parseScenarios([value])[0]!;const initial=walk(s,s.deal.depositBps,s.deal.balanceDays,s.deal.costDays,0);
 let evaluatedCandidates=0,feasibleCandidates=0;let winner:readonly [number,number,number]|null=null;let best:readonly number[]|null=null;
 const lastCost=s.amendment.allowSupplier?s.amendment.maxCostDays:s.deal.costDays;
 for(let deposit=s.deal.depositBps;deposit<=s.amendment.maxDepositBps;deposit+=100)
  for(let balance=s.deal.balanceDays;balance>=s.amendment.minBalanceDays;balance--)
   for(let cost=s.deal.costDays;cost<=lastCost;cost++){
    evaluatedCandidates++;
    if(!walk(s,deposit,balance,cost,0).eligible||!walk(s,deposit,balance,cost,s.amendment.receiptDelayDays).eligible)continue;
    feasibleCandidates++;const d=deposit-s.deal.depositBps,c=s.deal.balanceDays-balance,p=cost-s.deal.costDays;
    const score=[Number(d>0)+Number(c>0)+Number(p>0),d/100+c+p,d,c,p];
    const firstDifference=best?score.findIndex((part,index)=>part!==best![index]):-1;
    if(!best||(firstDifference>=0&&score[firstDifference]!<best[firstDifference]!)){best=score;winner=[deposit,balance,cost];}
   }
 // The five numeric ranking coordinates uniquely identify a point in this
 // one-line/one-cost grid; a canonical-hash tie cannot occur within this corpus.
 return {...initial,winner,evaluatedCandidates,feasibleCandidates};
}
