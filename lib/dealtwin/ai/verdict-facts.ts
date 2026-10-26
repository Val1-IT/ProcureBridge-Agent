import type {FactKey,VerdictFact,VerdictFacts} from './verdict-explainer';
type Json=Record<string,unknown>;
const obj=(value:unknown):Json=>value&&typeof value==='object'&&!Array.isArray(value)?value as Json:{};
const money=(value:unknown)=>typeof value==='string'&&/^-?\d{1,19}$/.test(value)?value:typeof value==='number'&&Number.isSafeInteger(value)?String(value):null;
const day=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
/** Latest base compile run of one deal version, as get_deal returns it (snake_case rows). */
export function latestBaseRun(runs:readonly unknown[],dealVersionId:string):Json|null{
 const rows=runs.map(obj).filter(row=>row.deal_version_id===dealVersionId&&row.kind==='base');
 return rows.sort((left,right)=>String(left.created_at).localeCompare(String(right.created_at))||String(left.id).localeCompare(String(right.id))).at(-1)??null;
}
/** The facts an explanation may cite, read from one stored compile run. Nothing
 * here decides feasibility: the outcome, floor and shortfall are the compiler's,
 * and the timeline sums only regroup its own events around the violation day. */
export function verdictFacts(run:Json,deal:string):VerdictFacts|null{
 const outcome=run.outcome;
 if(outcome!=='COMPILES'&&outcome!=='CONDITIONALLY_VALID'&&outcome!=='DOES_NOT_COMPILE')return null;
 const values:Partial<Record<FactKey,VerdictFact>>={};
 const put=(key:FactKey,kind:VerdictFact['kind'],value:string|null)=>{if(value!==null)values[key]={kind,value};};
 const violation=day(run.first_violation_date);
 put('cashFloor','rupiah',money(run.cash_floor_rupiah));put('lowestBalance','rupiah',money(run.worst_minimum_rupiah));
 if(outcome==='DOES_NOT_COMPILE'){
  if(!violation||money(run.shortfall_rupiah)===null)return null;
  put('violationDate','date',violation);put('shortfall','rupiah',money(run.shortfall_rupiah));
  const events=(Array.isArray(obj(obj(run.violation_data).timeline).events)?obj(obj(run.violation_data).timeline).events as unknown[]:[]).map(obj)
   .filter(row=>day(row.date)&&money(row.amountRupiah)!==null).sort((left,right)=>String(left.date).localeCompare(String(right.date)));
  const own=(row:Json)=>String(row.dependencyKey).startsWith('deal:event:'),before=(row:Json)=>String(row.date)<=violation;
  const sum=(rows:Json[])=>rows.reduce((total,row)=>total+BigInt(money(row.amountRupiah)!),0n);
  const paid=events.filter(row=>own(row)&&row.direction==='outflow'&&before(row));
  if(paid.length){put('supplierPaid','rupiah',sum(paid).toString());put('supplierDate','date',String(paid[0]!.date));}
  const received=events.filter(row=>own(row)&&row.direction==='inflow');
  const deposit=received.find(before),balance=received.find(row=>!before(row));
  if(deposit){put('depositAmount','rupiah',money(deposit.amountRupiah));put('depositDate','date',String(deposit.date));}
  if(balance){put('balanceAmount','rupiah',money(balance.amountRupiah));put('balanceDate','date',String(balance.date));}
  const bills=events.filter(row=>!own(row)&&row.direction==='outflow'&&before(row));
  if(bills.length)put('otherBills','rupiah',sum(bills).toString());
 }
 return {outcome,deal,values};
}
