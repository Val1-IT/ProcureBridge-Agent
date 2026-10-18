import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe,it,expect } from 'vitest';
import { DealInbox } from '../../../components/dealtwin/deal-inbox';
import { DealCompiler } from '../../../components/dealtwin/deal-compiler';
import { ProofView } from '../../../components/dealtwin/proof-view';
import { CommitmentTimeline } from '../../../components/dealtwin/commitment-timeline';
import { ErpEvidence } from '../../../components/dealtwin/erp-evidence';
import { WorkspaceStatus } from '../../../components/dealtwin/workspace-status';
import type { CompileResultDto } from '../../../lib/dealtwin/ui/contracts';
import { createJudgeScenario } from '../../../lib/dealtwin/judge/scenario';
import { createDealVersion } from '../../../lib/dealtwin/domain/deal';
import { buildDealProof,encodeCompileResult } from '../../../lib/dealtwin/proof/build-proof';
function result():CompileResultDto{return encodeCompileResult(createJudgeScenario().initialResult) as unknown as CompileResultDto;}
function proof(){const scenario=createJudgeScenario();const version=createDealVersion({id:'ui-version',dealId:'ui-deal',version:1,terms:scenario.candidateTermsA,createdBy:'synthetic',createdAt:'2026-09-12T00:00:00.000Z'});
 const value=buildDealProof({proofId:'ui-proof',dealId:version.dealId,version,snapshot:scenario.snapshot,constraints:scenario.constraints,policy:scenario.policy,baseResult:scenario.candidateResult,stressRuns:[],assumptions:[{id:'ui-assumption',code:'RECEIPT_EXPECTED',detail:'Customer receipt is projected, not bank cash'}],approvals:[{id:'ui-approval',proofId:'ui-proof',dealVersionId:version.id,kind:'non_arithmetic_authorization',status:'pending'}],approvedApprovalCodes:[],generatedAt:version.createdAt});if(!value.ok)throw new Error(value.error.message);return value.value.dto;}
describe('DealTwin surfaces render only exact server DTO evidence',()=>{
 it('shows exact compiler outcome/date/shortfall/floor and labels confirmed separately from projected',()=>{
  const html=renderToStaticMarkup(createElement(DealCompiler,{result:result()}));
  for(const text of ['DOES_NOT_COMPILE','2026-09-22','Rp3.000.000','Rp5.000.000','Confirmed','Projected'])expect(html).toContain(text);
  expect(html).not.toMatch(/AI confidence|probably safe|99%/i);
 });
 it('never hardcodes the Judge result when the server returns different money/date/outcome',()=>{
  const changed={...result(),outcome:'DOES_NOT_COMPILE' as const,shortfallRupiah:'1234',cashFloorRupiah:'9876543',firstViolationDate:'2027-01-02',
   evaluations:result().evaluations.map(row=>row.status==='fail'?{...row,shortfallRupiah:'1234',violationDate:'2027-01-02'}:row)};
  const html=renderToStaticMarkup(createElement(DealCompiler,{result:changed}));
  expect(html).toContain('Rp1.234');expect(html).toContain('Rp9.876.543');expect(html).toContain('2027-01-02');expect(html).not.toContain('Rp3.000.000');
 });
 it('shows unresolved constraints and actual collision owners rather than generic advisory text',()=>{
  const changed={...result(),outcome:'UNRESOLVED' as const,unresolvedConstraintIds:['supplier-calendar-unknown'],conflictingCommitmentIds:['other-owner-7']};
  const html=renderToStaticMarkup(createElement(DealCompiler,{result:changed}));
  expect(html).toContain('UNRESOLVED');expect(html).toContain('supplier-calendar-unknown');expect(html).toContain('other-owner-7');
 });
 it('proof view separates STALE current metadata from historical proof and displays exact changed dependency keys',()=>{
  const html=renderToStaticMarkup(createElement(ProofView,{proof:proof(),currentStatus:'STALE',staleReason:'dependency_change:erp.invoice:changed-ap'}));
  expect(html).toContain('STALE');expect(html).toContain('erp.invoice:changed-ap');expect(html).toContain('Historical');expect(html).toContain('Current');expect(html).toContain(proof().proofHash);
 });
 it('proof view renders actual pending approval/assumption identity and genuinely recomputed replay result',()=>{
  const html=renderToStaticMarkup(createElement(ProofView,{proof:proof(),replay:{replayed:true,historical:{resultHash:'historical-hash',recomputedResultHash:'historical-hash'}}}));
  expect(html).toContain('ui-approval');expect(html).toContain('pending');expect(html).toContain('Customer receipt is projected, not bank cash');expect(html).toContain('Replay');expect(html).toContain('historical-hash');
 });
 it('timeline exposes actual event dates/order/certainty and does not relabel projected receipts as bank cash',()=>{
  const html=renderToStaticMarkup(createElement(CommitmentTimeline,{result:result()}));
  expect(html).toContain('2026-09-22');expect(html).toContain('300');expect(html).toContain('expected');expect(html).toContain('projected');expect(html).toContain('Dated cash events');
 });
 it('inbox has keyboard-accessible links and preserves distinct current status/Sales Order without invented data',()=>{
  const html=renderToStaticMarkup(createElement(DealInbox,{deals:[{id:'sample-not-judge',title:'Server supplied Deal',customerId:'customer-x',status:'COMMITTED',currentVersionId:'version-x',committedSalesOrderId:'so-linked-7'}]}));
  expect(html).toContain('/dealtwin/deals/sample-not-judge');expect(html).toContain('Server supplied Deal');expect(html).toContain('COMMITTED');expect(html).toContain('so-linked-7');expect(html).not.toContain('judge-deal-a');
 });
 it('ERP evidence displays only authoritative server opening cash/revision/events, not a default Judge balance',()=>{
  const html=renderToStaticMarkup(createElement(ErpEvidence,{openingCashRupiah:'9123456',asOfDate:'2027-01-02',revision:91,events:[]}));
  expect(html).toContain('Rp9.123.456');expect(html).toContain('91');expect(html).toContain('2027-01-02');expect(html).not.toContain('Rp30.000.000');
 });
 it.each(['loading','error','empty'] as const)('workspace%s status has accessible semantics, no fabricated balance and no implicit local fallback',state=>{
  const html=renderToStaticMarkup(createElement(WorkspaceStatus,{state,message:'Server snapshot unavailable'}));
  expect(html).toContain(state==='error'?'role="alert"':'role="status"');expect(html).toContain(state==='loading'?'Loading':state==='empty'?'No':'Server snapshot unavailable');expect(html).not.toContain('Rp');
 });
});
