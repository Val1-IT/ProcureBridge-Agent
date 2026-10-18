import { describe, expect, it } from 'vitest';
import { findSmallestAmendment } from '../../../lib/dealtwin/recompiler/recompile-deal';
import type { AmendmentPolicy } from '../../../lib/dealtwin/recompiler/search-space';
import { compileDeal, type CompileInput } from '../../../lib/dealtwin/compiler/compile-deal';
import { runStressLab } from '../../../lib/dealtwin/stress/run-stress-lab';
import { createJudgeFixture } from '../fixtures/judge-scenario';
import { createJudgeScenario } from '../../../lib/dealtwin/judge/scenario';
import { buildSnapshot } from '../../../lib/dealtwin/erp/build-snapshot';
import { basisPoints } from '../../../lib/dealtwin/domain/rate';
import { isoDate, addCalendarDays } from '../../../lib/dealtwin/domain/date';
import { rupiah } from '../../../lib/dealtwin/domain/money';
import { canonicalizeDealTermsV1, type DealTermsV1 } from '../../../lib/dealtwin/domain/deal-terms';
import { sha256Canonical, type CanonicalJsonValue } from '../../../lib/dealtwin/domain/canonical-json';

function input(): CompileInput { const a = createJudgeFixture(); return { snapshot: a.snapshot, terms: a.initialTermsA, constraints: a.constraints, policy: a.policy, approvedApprovalCodes: [] }; }
function policy(overrides: Partial<AmendmentPolicy> = {}): AmendmentPolicy {
  return { schemaVersion: 'dealtwin.amendment-policy.v1', depositMaximumBps: basisPoints(4000), earliestCustomerBalanceDays: 2,
    latestSupplierPaymentDays: 14, supplierApprovalPermitted: true,
    requiredStressScenarios: [{ schemaVersion: 'dealtwin.stress-scenario.v1', id: 'required-receipts-plus-3', type: 'customer_receipt_delay', days: 3 }], ...overrides };
}
function terms(base: DealTermsV1, deposit: number, customer: number, supplier: number): DealTermsV1 {
  return { ...base, customerPaymentEvents: [{ ...base.customerPaymentEvents[0], basisPoints: basisPoints(deposit) },
    { ...base.customerPaymentEvents[1], basisPoints: basisPoints(10000-deposit), daysFromAcceptance: customer, effectiveDate: addCalendarDays(base.acceptedDate,customer) }],
    directCostEvents: base.directCostEvents.map(row => ({ ...row, daysFromAcceptance: supplier, effectiveDate: addCalendarDays(base.acceptedDate,supplier) })) };
}
function found(result: ReturnType<typeof findSmallestAmendment>) { expect(result.outcome).toBe('AMENDMENT_FOUND'); if (result.outcome !== 'AMENDMENT_FOUND') throw new Error('Missing feasible amendment'); return result.candidate; }

describe('bounded deterministic minimum-amendment solver, never AI-ranked', () => {
  it('exact locked Judge winner changes only deposit to25%, retaining14day balance/6day cost and required+3stress', () => {
    const base = input(); const before = structuredClone(base); const result = findSmallestAmendment(base,policy()); const candidate = found(result);
    expect(candidate.terms.customerPaymentEvents[0].basisPoints).toBe(2500); expect(candidate.terms.customerPaymentEvents[1].daysFromAcceptance).toBe(14);
    expect(candidate.terms.directCostEvents[0]!.daysFromAcceptance).toBe(6); expect(candidate.changedFields).toEqual(['deposit_basis_points']);
    expect(candidate.score.slice(0,5)).toEqual([1,5,500,0,0]); expect(candidate.baseResult.timeline?.minimumProjectedBalance).toBe(5000000n);
    expect(candidate.baseResult.outcome).toBe('CONDITIONALLY_VALID'); expect(candidate.stressRuns).toHaveLength(1);
    expect(candidate.stressRuns[0]!.result.timeline?.minimumProjectedBalance).toBe(5000000n); expect(base).toEqual(before);
    expect(result.evaluatedCandidates).toBe(2457);
  });
  it('after the one AP obligation rises18m->19m, proposes27% with5.2m minimum while26% fails400k', () => {
    const judge = createJudgeScenario(); const state = structuredClone(judge.erpState);
    state.supplierInvoices[0]!.totalAmount = 19000000; state.supplierInvoices[0]!.lines[0]!.unitPrice = 19000000;
    state.goodsReceipts[0]!.lines[0]!.unitPrice = 19000000; state.purchaseOrders[0]!.lines[0]!.unitPrice = 19000000; state.revision++;
    const snapshot = buildSnapshot({ state, tenantId: judge.tenantId, asOfDate: isoDate('2026-09-12'), requestedHorizonEnd: isoDate('2026-10-12'), adapterVersion: judge.snapshot.adapterVersion, commitments: [], self: null });
    expect(snapshot.ok).toBe(true); if (!snapshot.ok) throw new Error(snapshot.error.message);
    const base = { ...input(), snapshot: snapshot.value }; const candidate = found(findSmallestAmendment(base,policy()));
    expect(candidate.terms.customerPaymentEvents[0].basisPoints).toBe(2700); expect(candidate.baseResult.timeline?.minimumProjectedBalance).toBe(5200000n);
    expect(candidate.stressRuns[0]!.result.timeline?.minimumProjectedBalance).toBe(5200000n);
    const rejected = compileDeal({ ...base, terms: terms(base.terms,2600,14,6) }); expect(rejected.shortfallRupiah).toBe(400000n);
  });
  it('agrees with an independently enumerated exhaustive2457candidate oracle and literal lexicographic objective', () => {
    const base = input(); const feasible: { values: number[]; hash: string }[] = [];
    for (let deposit=2000; deposit<=4000; deposit+=100) for (let customer=14; customer>=2; customer--) for (let supplier=6; supplier<=14; supplier++) {
      const candidate = terms(base.terms,deposit,customer,supplier); const value = { ...base, terms: candidate };
      const result = compileDeal(value); if (result.outcome !== 'COMPILES' && result.outcome !== 'CONDITIONALLY_VALID') continue;
      if (runStressLab(value,policy().requiredStressScenarios).some(run => run.result.outcome !== 'COMPILES' && run.result.outcome !== 'CONDITIONALLY_VALID')) continue;
      feasible.push({ values: [Number(deposit!==2000)+Number(customer!==14)+Number(supplier!==6),(deposit-2000)/100+14-customer+supplier-6,deposit-2000,14-customer,supplier-6], hash: sha256Canonical(canonicalizeDealTermsV1(candidate) as unknown as CanonicalJsonValue) });
    }
    feasible.sort((a,b) => { for (let i=0; i<5; i++) if (a.values[i]!==b.values[i]) return a.values[i]!-b.values[i]!; return a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0; });
    expect(feasible[0]!.values).toEqual([1,5,500,0,0]);
    const result = findSmallestAmendment(base,policy()); const candidate = found(result);
    expect(candidate.score).toEqual([...feasible[0]!.values,feasible[0]!.hash]); expect(result.feasibleCandidates).toBe(feasible.length);
  });
  it('uses the locked deposit/customer/supplier tie-break priority after field count and normalized steps', () => {
    const base = input(); const custom = terms(base.terms,2000,6,6);
    const value = { ...base, approvedApprovalCodes: ['owner_commercial_exception'], terms: { ...custom, directCostEvents: [{ ...custom.directCostEvents[0]!, amountRupiah: rupiah(39600000n) }] } };
    const candidate = found(findSmallestAmendment(value,policy({ depositMaximumBps: basisPoints(2100), earliestCustomerBalanceDays: 5, latestSupplierPaymentDays: 7, requiredStressScenarios: [] })));
    expect(candidate.score.slice(0,5)).toEqual([1,1,0,0,1]); expect(candidate.terms.customerPaymentEvents[0].basisPoints).toBe(2000);
    expect(candidate.terms.customerPaymentEvents[1].daysFromAcceptance).toBe(6); expect(candidate.terms.directCostEvents[0]!.daysFromAcceptance).toBe(7);
    expect(candidate.constraints.constraints.filter(row=>row.kind==='required_approval').map(row=>row.value)).toContainEqual({ approvalCode:'supplier_timing_exception' });
    expect(candidate.baseResult.outcome).toBe('CONDITIONALLY_VALID');
  });
  it('never changes supplier timing when supplier approval is not permitted', () => {
    const base = input(); const custom = terms(base.terms,2000,6,6); const value = { ...base, terms: { ...custom, directCostEvents: [{ ...custom.directCostEvents[0]!, amountRupiah: rupiah(39600000n) }] } };
    const candidate = found(findSmallestAmendment(value,policy({ depositMaximumBps: basisPoints(2100), earliestCustomerBalanceDays: 5, latestSupplierPaymentDays: 7, supplierApprovalPermitted: false, requiredStressScenarios: [] })));
    expect(candidate.score.slice(0,5)).toEqual([1,1,0,1,0]); expect(candidate.terms.directCostEvents[0]!.daysFromAcceptance).toBe(6);
  });
  it('returns a real no-solution result rather than inventing an amendment or skipping required stress', () => {
    const result = findSmallestAmendment(input(),policy({ depositMaximumBps: basisPoints(2000), earliestCustomerBalanceDays: 14, latestSupplierPaymentDays: 6, supplierApprovalPermitted: false }));
    expect(result).toEqual({ outcome: 'NO_FEASIBLE_AMENDMENT', evaluatedCandidates: 1, feasibleCandidates: 0 });
  });
  it('steps from a valid fractional-percent current deposit without requiring the policy cap to lie on that grid',()=>{
    const base=input(); const result=findSmallestAmendment({ ...base,terms:terms(base.terms,2050,14,6) },policy()); const candidate=found(result);
    expect(candidate.terms.customerPaymentEvents[0].basisPoints).toBe(2550);
    expect(candidate.score.slice(0,5)).toEqual([1,5,500,0,0]); expect(candidate.baseResult.timeline?.minimumProjectedBalance).toBe(5300000n);
    expect(result.evaluatedCandidates).toBe(2340);
  });
  it('rejects a base-only feasible solution when its required stress fails', () => {
    const base = input(); const value = { ...base, terms: terms(base.terms,2000,6,6) };
    const bounds = policy({ depositMaximumBps: basisPoints(2000), earliestCustomerBalanceDays: 6, latestSupplierPaymentDays: 7, requiredStressScenarios: [] });
    expect(findSmallestAmendment(value,bounds).outcome).toBe('AMENDMENT_FOUND');
    expect(findSmallestAmendment(value,{ ...bounds, requiredStressScenarios: policy().requiredStressScenarios }).outcome).toBe('NO_FEASIBLE_AMENDMENT');
  });
  it('is deterministic under input ordering and never mutates the confirmed source terms/policy', () => {
    const base = input(); const p = policy(); const before = structuredClone({ base,p });
    const a = findSmallestAmendment(base,p); const b = findSmallestAmendment({ ...base, constraints: { ...base.constraints, constraints: [...base.constraints.constraints].reverse() } },p);
    expect(b).toEqual(a); expect({ base,p }).toEqual(before);
  });
});
