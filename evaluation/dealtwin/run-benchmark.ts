import type {EvaluationScenario} from './scenario-schema';
import type {OracleResult} from './exhaustive-oracle';
import {evaluateExhaustively} from './exhaustive-oracle';
import {parseScenarios} from './scenario-schema';
import {z} from 'zod';
import {validateServiceEvidence,serviceObservationMatches,type ServiceObservation,type ServiceEvidence} from './service-evidence';
export type {ServiceObservation,ServiceEvidence} from './service-evidence';
import {createJudgeScenario} from '../../lib/dealtwin/judge/scenario';
import {buildSnapshot} from '../../lib/dealtwin/erp/build-snapshot';
import {compileDeal,type CompileInput} from '../../lib/dealtwin/compiler/compile-deal';
import {isoDate,addCalendarDays} from '../../lib/dealtwin/domain/date';
import {rupiah} from '../../lib/dealtwin/domain/money';
import {basisPoints} from '../../lib/dealtwin/domain/rate';
import {validateConstraints} from '../../lib/dealtwin/domain/constraint';
import {findSmallestAmendment} from '../../lib/dealtwin/recompiler/recompile-deal';
import {createDealVersion} from '../../lib/dealtwin/domain/deal';
import {buildDealProof} from '../../lib/dealtwin/proof/build-proof';
import {encodeProof} from '../../lib/dealtwin/proof/proof-dto';
import {replayProof} from '../../lib/dealtwin/proof/replay-proof';
import {sha256Canonical,type CanonicalJsonValue} from '../../lib/dealtwin/domain/canonical-json';
import {DEALTWIN_ENGINE_VERSION,NAMED_STRESS_ENGINE_VERSION,CANONICALIZATION_VERSION} from '../../lib/dealtwin/proof/version';
export interface CompilerObservation extends OracleResult {readonly replayMatched:boolean;readonly contextHash:string}
export interface RunMetadata {readonly sourceSha:string;readonly sourceTreeHash:string;readonly dirty:boolean;readonly seed:number;readonly generatedAt:string}
export interface Metric {readonly status:'MEASURED'|'NOT_MEASURED';readonly numerator:number|null;readonly denominator:number;readonly rate:number|null;readonly reason:string|null}
export interface MethodMetrics {readonly falseFeasible:Metric;readonly falseInfeasible:Metric}
export interface BenchmarkCase {readonly scenario:EvaluationScenario;readonly oracle:OracleResult;readonly compiler:CompilerObservation;readonly fixedRuleEligible:boolean}
export interface BenchmarkReport {readonly schemaVersion:'dealtwin.benchmark.v1';readonly metadata:RunMetadata|null;readonly serviceEvidence:ServiceEvidence|null;readonly measurementScopes:Readonly<Record<string,string>>;readonly versions:Readonly<Record<string,string>>;readonly corpusHash:string;readonly cases:readonly BenchmarkCase[];readonly methods:{readonly compiler:MethodMetrics;readonly fixedRule:MethodMetrics;readonly llmOnly:{readonly status:'NOT_MEASURED';readonly reason:string}};readonly metrics:Readonly<Record<string,Metric>>;readonly mismatches:readonly {scenarioId:string;method:string;reason:string}[]}
export interface BenchmarkOptions {readonly metadata?:RunMetadata;readonly compilerEvaluator?:(scenario:EvaluationScenario)=>CompilerObservation|undefined;readonly serviceEvidence?:ServiceEvidence}
const wire=(value:unknown):CanonicalJsonValue=>JSON.parse(JSON.stringify(value,(_key,item:unknown)=>typeof item==='bigint'?item.toString():item)) as CanonicalJsonValue;
const legacy=(value:string)=>{const exact=BigInt(value),number=Number(exact);if(!Number.isSafeInteger(number)||BigInt(number)!==exact)throw new Error('UNSAFE_EVALUATION_LEGACY_FIXTURE');return number;};
export function createCompileInputForScenario(value:EvaluationScenario):CompileInput{
 const s=parseScenarios([value])[0]!;const judge=createJudgeScenario();const state=structuredClone(judge.erpState);
 state.cashAccounts[0]!.openingBalanceRupiah=s.cash.openingRupiah;
 const payable=legacy(s.cash.payableRupiah),receivable=legacy(s.cash.receivableRupiah);
 state.supplierInvoices[0]!.totalAmount=payable;state.supplierInvoices[0]!.lines[0]!.unitPrice=payable;
 state.purchaseOrders[0]!.lines[0]!.unitPrice=payable;state.goodsReceipts[0]!.lines[0]!.unitPrice=payable;
 state.customerInvoices[0]!.totalAmount=receivable;state.customerInvoices[0]!.lines[0]!.unitPrice=receivable;
 state.salesOrders[0]!.lines[0]!.unitPrice=receivable;state.deliveryOrders[0]!.lines[0]!.unitPrice=receivable;
 const snapshot=buildSnapshot({state,tenantId:judge.tenantId,asOfDate:isoDate('2026-09-12'),requestedHorizonEnd:isoDate('2026-10-12'),adapterVersion:judge.snapshot.adapterVersion,commitments:[],self:null});
 if(!snapshot.ok)throw new Error(`EVALUATION_SNAPSHOT:${snapshot.error.code}`);
 const base=judge.initialTermsA;
 const terms={...base,productLines:[{...base.productLines[0]!,unitPriceRupiah:rupiah(BigInt(s.deal.revenueRupiah))}],
  customerPaymentEvents:[{...base.customerPaymentEvents[0],basisPoints:basisPoints(s.deal.depositBps)},
   {...base.customerPaymentEvents[1],basisPoints:basisPoints(10000-s.deal.depositBps),daysFromAcceptance:s.deal.balanceDays,effectiveDate:addCalendarDays(base.acceptedDate,s.deal.balanceDays)}] as const,
  directCostEvents:[{...base.directCostEvents[0]!,amountRupiah:rupiah(BigInt(s.deal.directCostRupiah)),daysFromAcceptance:s.deal.costDays,effectiveDate:addCalendarDays(base.acceptedDate,s.deal.costDays)}]};
 const constraints=validateConstraints(judge.constraints.constraints.map(row=>row.kind==='minimum_cash_rupiah'?{...row,value:rupiah(BigInt(s.cash.floorRupiah))}:row.kind==='customer_deposit_max_bps'?{...row,value:basisPoints(s.amendment.maxDepositBps)}:row));
 if(!constraints.ok)throw new Error('EVALUATION_CONSTRAINTS');
 return {snapshot:snapshot.value,terms,constraints:constraints.value,policy:{...judge.policy,minimumCashRupiah:rupiah(BigInt(s.cash.floorRupiah))},approvedApprovalCodes:[]};
}
export function evaluateCompilerScenario(scenario:EvaluationScenario):CompilerObservation{
 const input=createCompileInputForScenario(scenario);const base=compileDeal(input);
 if(!base.timeline)throw new Error('MISSING_FINANCIAL_RESULT');
 const found=findSmallestAmendment(input,{schemaVersion:'dealtwin.amendment-policy.v1',depositMaximumBps:basisPoints(scenario.amendment.maxDepositBps),earliestCustomerBalanceDays:scenario.amendment.minBalanceDays,latestSupplierPaymentDays:scenario.amendment.maxCostDays,supplierApprovalPermitted:scenario.amendment.allowSupplier,
  requiredStressScenarios:scenario.amendment.receiptDelayDays===0?[]:[{schemaVersion:'dealtwin.stress-scenario.v1',id:'evaluation-receipt-delay',type:'customer_receipt_delay',days:scenario.amendment.receiptDelayDays}]});
 const at='2026-09-16T12:00:00.000Z',proofId=`evaluation-proof:${scenario.id}`,versionId=`evaluation-version:${scenario.id}`,dealId=`evaluation-deal:${scenario.id}`;
 const version=createDealVersion({id:versionId,dealId,version:1,terms:input.terms,createdBy:'synthetic-evaluator',createdAt:at});
 const proof=buildDealProof({proofId,dealId,version,snapshot:input.snapshot,constraints:input.constraints,policy:input.policy,baseResult:base,stressRuns:[],assumptions:[],approvals:[{id:`evaluation-approval:${scenario.id}`,proofId,dealVersionId:versionId,kind:'non_arithmetic_authorization',status:'pending',requirementCode:'owner_commercial_exception'}],approvedApprovalCodes:[],generatedAt:at});
 if(!proof.ok)throw new Error(`EVALUATION_PROOF:${proof.error.code}`);
 return {eligible:base.outcome==='COMPILES'||base.outcome==='CONDITIONALLY_VALID',minimumRupiah:base.timeline.minimumProjectedBalance.toString(),firstViolationDate:base.firstViolationDate,shortfallRupiah:base.shortfallRupiah?.toString()??null,
  winner:found.outcome==='AMENDMENT_FOUND'?[found.candidate.terms.customerPaymentEvents[0].basisPoints,found.candidate.terms.customerPaymentEvents[1].daysFromAcceptance,found.candidate.terms.directCostEvents[0]!.daysFromAcceptance]:null,
  evaluatedCandidates:found.evaluatedCandidates,feasibleCandidates:found.feasibleCandidates,replayMatched:replayProof(encodeProof(proof.value)).ok,contextHash:sha256Canonical(wire(input))};
}
export function measured(numerator:number,denominator:number):Metric{return denominator===0?{status:'NOT_MEASURED',numerator:null,denominator:0,rate:null,reason:'NO_ELIGIBLE_CASES'}:{status:'MEASURED',numerator,denominator,rate:numerator/denominator,reason:null};}
export function fixedRuleDecision(s:EvaluationScenario):boolean{return BigInt(s.deal.revenueRupiah)>=BigInt(s.deal.directCostRupiah)&&s.deal.depositBps>=2000;}
const same=(a:unknown,b:unknown)=>sha256Canonical(wire(a))===sha256Canonical(wire(b));
const observationSchema=z.strictObject({eligible:z.boolean(),minimumRupiah:z.string().max(21).regex(/^(0|-?[1-9][0-9]*)$/),firstViolationDate:z.iso.date().nullable(),shortfallRupiah:z.string().max(21).regex(/^(0|[1-9][0-9]*)$/).nullable(),winner:z.tuple([z.number().int().min(0).max(10000),z.number().int().min(0).max(60),z.number().int().min(0).max(60)]).nullable(),evaluatedCandidates:z.number().int().min(1).max(5000),feasibleCandidates:z.number().int().min(0).max(5000),replayMatched:z.boolean(),contextHash:z.string().regex(/^[0-9a-f]{64}$/)}).refine(row=>row.feasibleCandidates<=row.evaluatedCandidates);
export function runBenchmark(values:readonly EvaluationScenario[],options:BenchmarkOptions={}):BenchmarkReport{
 const scenarios=parseScenarios(values);const cases:BenchmarkCase[]=scenarios.map(scenario=>{
  const compiler=(options.compilerEvaluator??evaluateCompilerScenario)(scenario);
  if(!compiler)throw new Error(`MISSING_COMPILER_RESULT:${scenario.id}`);
  return {scenario,oracle:evaluateExhaustively(scenario),compiler:observationSchema.parse(compiler),fixedRuleEligible:fixedRuleDecision(scenario)};
 });
 const metrics=(predict:(row:BenchmarkCase)=>boolean):MethodMetrics=>({falseFeasible:measured(cases.filter(row=>!row.oracle.eligible&&predict(row)).length,cases.filter(row=>!row.oracle.eligible).length),falseInfeasible:measured(cases.filter(row=>row.oracle.eligible&&!predict(row)).length,cases.filter(row=>row.oracle.eligible).length)});
 const mismatches:BenchmarkReport['mismatches'][number][]=[];
 for(const row of cases){
  if(row.compiler.eligible!==row.oracle.eligible)mismatches.push({scenarioId:row.scenario.id,method:'compiler',reason:'CLASSIFICATION_MISMATCH'});
  if(!same([row.compiler.minimumRupiah,row.compiler.firstViolationDate,row.compiler.shortfallRupiah],[row.oracle.minimumRupiah,row.oracle.firstViolationDate,row.oracle.shortfallRupiah]))mismatches.push({scenarioId:row.scenario.id,method:'compiler',reason:'FINANCIAL_EVIDENCE_MISMATCH'});
  if(!same([row.compiler.winner,row.compiler.evaluatedCandidates,row.compiler.feasibleCandidates],[row.oracle.winner,row.oracle.evaluatedCandidates,row.oracle.feasibleCandidates]))mismatches.push({scenarioId:row.scenario.id,method:'compiler',reason:'AMENDMENT_MISMATCH'});
  if(!row.compiler.replayMatched)mismatches.push({scenarioId:row.scenario.id,method:'compiler',reason:'REPLAY_MISMATCH'});
  if(row.fixedRuleEligible!==row.oracle.eligible)mismatches.push({scenarioId:row.scenario.id,method:'fixed_rule',reason:'CLASSIFICATION_MISMATCH'});
 }
 const sameDay=cases.filter(row=>row.scenario.tags.includes('same_day'));
 const absent:Metric={status:'NOT_MEASURED',numerator:null,denominator:0,rate:null,reason:'SERVICE_OBSERVATIONS_MISSING'};
 const evidence=options.serviceEvidence?validateServiceEvidence(options.serviceEvidence,options.metadata?.sourceSha):null;
 const service=(metric:ServiceObservation['metric']):Metric=>{const rows=evidence?.observations.filter(row=>row.metric===metric)??[];return rows.length===0?absent:measured(rows.filter(row=>metric==='extractionCorrectness'?serviceObservationMatches(row):!serviceObservationMatches(row)).length,rows.length);};
 return {schemaVersion:'dealtwin.benchmark.v1',metadata:options.metadata??null,serviceEvidence:evidence,measurementScopes:{classification:'One product/cost plus AP/AR; financial eligibility includes CONDITIONAL and never grants COMMIT approval',sameDayOrdering:'Tagged same-day corpus cases only',replayMismatch:'Genuine canonical proof recomputation for each corpus case',amendmentMismatch:'Exhaustive bounded one-cost deposit/customer/supplier grid with required receipt-delay stress',serviceMetrics:'Disposable synthetic Judge command flows and two-distinct-pool races only; not exhaustive schedules',extractionCorrectness:'Four offline synthetic ProviderReply schema/confirmation contracts; NOT live LLM extraction accuracy'},versions:{compiler:DEALTWIN_ENGINE_VERSION,stress:NAMED_STRESS_ENGINE_VERSION,recompiler:'dealtwin.amendment-policy.v1',oracle:'independent-prefix-grid-v1',fixedRule:'margin-and-20pct-v1',adapter:'dealtwin-erp-adapter-v1',canonicalization:CANONICALIZATION_VERSION,extraction:'offline-synthetic-contract-v1'},corpusHash:sha256Canonical(wire(scenarios)),cases,
  methods:{compiler:metrics(row=>row.compiler.eligible),fixedRule:metrics(row=>row.fixedRuleEligible),llmOnly:{status:'NOT_MEASURED',reason:'PROVIDER_EVIDENCE_MISSING'}},
  metrics:{sameDayOrdering:measured(sameDay.filter(row=>!same([row.compiler.minimumRupiah,row.compiler.firstViolationDate],[row.oracle.minimumRupiah,row.oracle.firstViolationDate])).length,sameDay.length),
   replayMismatch:measured(cases.filter(row=>!row.compiler.replayMatched).length,cases.length),amendmentMismatch:measured(cases.filter(row=>!same([row.compiler.winner,row.compiler.evaluatedCandidates,row.compiler.feasibleCandidates],[row.oracle.winner,row.oracle.evaluatedCandidates,row.oracle.feasibleCandidates])).length,cases.length),duplicateCommitment:service('duplicateCommitment'),missedStaleness:service('missedStaleness'),idempotency:service('idempotency'),raceBehavior:service('raceBehavior'),extractionCorrectness:service('extractionCorrectness')},mismatches};
}
