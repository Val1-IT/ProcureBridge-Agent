import { describe, expect, it, vi } from 'vitest';
import { compileDeal, type CompileInput } from '../../../lib/dealtwin/compiler/compile-deal';
import { runStressLab } from '../../../lib/dealtwin/application/stress-lab-service';
import { applyStressTransform, type StressScenario } from '../../../lib/dealtwin/stress/stress-transform';
import { createJudgeFixture } from '../fixtures/judge-scenario';
import { isoDate } from '../../../lib/dealtwin/domain/date';
import { rupiah } from '../../../lib/dealtwin/domain/money';
import { createDealVersion } from '../../../lib/dealtwin/domain/deal';
import { buildDealProof } from '../../../lib/dealtwin/proof/build-proof';
import { replayProof } from '../../../lib/dealtwin/proof/replay-proof';
import { sha256Canonical, type CanonicalJsonValue } from '../../../lib/dealtwin/domain/canonical-json';

function input(): CompileInput {
  const judge = createJudgeFixture();
  return { snapshot: judge.snapshot, terms: judge.candidateTermsA, constraints: judge.constraints, policy: judge.policy, approvedApprovalCodes: ['owner_commercial_exception'] };
}
const delay = (days: number): StressScenario => ({ schemaVersion: 'dealtwin.stress-scenario.v1', id: `receipts-plus-${days}`, type: 'customer_receipt_delay', days });
const event = (result: ReturnType<typeof compileDeal>, id: string) => result.timeline?.events.find(row => row.eventId === id);
function namedProof(days = 3, scenario?: StressScenario) {
  const base = input(); const version = createDealVersion({ id: 'stress-version', dealId: 'stress-deal', version: 1, terms: base.terms, createdBy: 'synthetic-user', createdAt: '2026-09-16T00:00:00.000Z' });
  const proof = buildDealProof({ proofId: 'stress-proof', dealId: version.dealId, version, snapshot: base.snapshot,
    constraints: base.constraints, policy: base.policy, baseResult: compileDeal(base), stressRuns: runStressLab(base,[scenario ?? delay(days)]), assumptions: [],
    approvals: [{ id: 'stress-approval', proofId: 'stress-proof', dealVersionId: version.id, kind: 'non_arithmetic_authorization', status: 'approved' }],
    approvedApprovalCodes: base.approvedApprovalCodes, generatedAt: '2026-09-16T00:00:00.000Z' });
  expect(proof.ok).toBe(true); if (!proof.ok) throw new Error(proof.error.message); return proof.value.dto;
}

describe('named deterministic Stress Lab uses projections, never altered commercial terms or real cash', () => {
  it.each([
    { days: 3, deposit: '2026-09-19', balance: '2026-10-03', minimum: 5000000n, outcome: 'COMPILES' },
    { days: 7, deposit: '2026-09-23', balance: '2026-10-07', minimum: -10000000n, outcome: 'DOES_NOT_COMPILE' },
    { days: 14, deposit: '2026-09-30', balance: '2026-10-14', minimum: -10000000n, outcome: 'DOES_NOT_COMPILE' },
  ])('delays only candidate customer receipts by $days days with exact financial result', async row => {
    const base = input(); const before = structuredClone(base); const projected = applyStressTransform(base, delay(row.days));
    const result = compileDeal(projected);
    expect(event(result,'deal-a:deposit')?.date).toBe(row.deposit); expect(event(result,'deal-a:balance')?.date).toBe(row.balance);
    expect(event(result,'deal-a:direct-cost')?.date).toBe('2026-09-22');
    expect(result.timeline?.events.find(item => item.dependencyKey === 'erp.invoice:judge-existing-ar')?.date).toBe('2026-09-20');
    expect(result.timeline?.minimumProjectedBalance).toBe(row.minimum); expect(result.outcome).toBe(row.outcome);
    expect(projected.terms).toEqual(before.terms); expect(projected.snapshot).toEqual(before.snapshot); expect(base).toEqual(before);
    if (row.days === 14) { expect(result.effectiveHorizonEnd).toBe('2026-10-14'); expect(result.horizonExpanded).toBe(true); }
  });
  it('direct-outflow +500bps increases only candidate costs, with conservative ceiling rounding', () => {
    const base = input(); const scenario: StressScenario = { schemaVersion: 'dealtwin.stress-scenario.v1', id: 'cost-plus-500bps', type: 'direct_outflow_increase', basisPoints: 500 };
    const result = compileDeal(applyStressTransform(base, scenario));
    expect(event(result,'deal-a:direct-cost')?.amountRupiah).toBe(44100000n); expect(result.timeline?.minimumProjectedBalance).toBe(2900000n);
    expect(result.timeline?.events.find(item => item.dependencyKey === 'erp.invoice:judge-existing-ap')?.amountRupiah).toBe(18000000n);
    const small: CompileInput = { ...base, terms: { ...base.terms, directCostEvents: [{ ...base.terms.directCostEvents[0]!, amountRupiah: rupiah(1n) }] } };
    expect(event(compileDeal(applyStressTransform(small, scenario)), 'deal-a:direct-cost')?.amountRupiah).toBe(2n);
    expect(base.terms.directCostEvents[0]!.amountRupiah).toBe(42000000n);
  });
  it('selected receipt delay changes one expected ERP receipt, not the candidate deposit or obligations', () => {
    const base = input(); const target = base.snapshot.cashEvents.find(item => item.dependencyKey === 'erp.invoice:judge-existing-ar')!;
    const result = compileDeal(applyStressTransform(base, { schemaVersion: 'dealtwin.stress-scenario.v1', id: 'selected-ar-plus-7', type: 'specified_receipt_delay', eventId: target.eventId, days: 7 }));
    expect(event(result,target.eventId)?.date).toBe('2026-09-27'); expect(event(result,'deal-a:deposit')?.date).toBe('2026-09-16');
    expect(event(result,'deal-a:direct-cost')?.date).toBe('2026-09-22'); expect(base.snapshot.receipts[0]!.expectedDate).toBe('2026-09-20');
  });
  it('new obligation is inserted once at its exact date/order/amount without rewriting AP', () => {
    const base = input(); const before = structuredClone(base);
    const result = compileDeal(applyStressTransform(base, { schemaVersion: 'dealtwin.stress-scenario.v1', id: 'extra-cost', type: 'new_obligation', date: isoDate('2026-09-22'), sameDayOrder: 300, amountRupiah: rupiah(1000000n) }));
    const added = result.timeline?.events.filter(item => item.eventId === 'stress:extra-cost:obligation');
    expect(added).toHaveLength(1); expect(added?.[0]).toMatchObject({ date: '2026-09-22', sameDayOrder: 300, amountRupiah: 1000000n, direction: 'outflow', certainty: 'assumption' });
    expect(result.timeline?.minimumProjectedBalance).toBe(4000000n); expect(result.firstViolationDate).toBe('2026-09-22'); expect(base).toEqual(before);
  });
  it('records real compiled outputs and deterministic hashes, independent of scenario request order', () => {
    const base = input(); const before = structuredClone(base); const scenarios = [delay(3),delay(7)];
    const runs = runStressLab(base, scenarios); expect(runs).toHaveLength(2);
    expect(runs.map(run => run.result.outcome)).toEqual(['COMPILES','DOES_NOT_COMPILE']);
    for (const run of runs) { expect(run.inputHash).toMatch(/^[0-9a-f]{64}$/); expect(run.resultHash).toMatch(/^[0-9a-f]{64}$/); expect(run.parameters).toMatchObject({ days: run.scenario.type === 'customer_receipt_delay' ? run.scenario.days : null }); expect(run.inputPayload).toMatchObject({ engineVersion: 'dealtwin-engine-v2' }); }
    expect(runStressLab(base, [...scenarios].reverse())).toEqual(runs); expect(base).toEqual(before);
    expect(runs[0]!.inputHash).not.toBe(runs[1]!.inputHash); expect(runs[0]!.resultHash).not.toBe(runs[1]!.resultHash);
  });
  it('retains a non-arithmetic approval gate instead of treating stress success as approval', () => {
    const runs = runStressLab({ ...input(), approvedApprovalCodes: [] }, [delay(3)]); expect(runs).toHaveLength(1);
    expect(runs[0]!.result.outcome).toBe('CONDITIONALLY_VALID'); expect(runs[0]!.result.unresolvedConstraintIds).toContain('judge:owner-exception');
  });
  it.each([
    { ...delay(3), days: -1 }, { ...delay(3), days: 0.5 }, { ...delay(3), schemaVersion: 'unknown' },
    { schemaVersion: 'dealtwin.stress-scenario.v1', id: 'bad', type: 'specified_receipt_delay', eventId: 'not-present', days: 3 },
    { schemaVersion: 'dealtwin.stress-scenario.v1', id: 'bad', type: 'specified_receipt_delay', eventId: 'deal-a:direct-cost', days: 3 },
    { schemaVersion: 'dealtwin.stress-scenario.v1', id: 'bad', type: 'specified_receipt_delay', eventId: 'cash-opening:judge-cash:2026-09-12', days: 3 },
    { schemaVersion: 'dealtwin.stress-scenario.v1', id: 'bad', type: 'new_obligation', date: '2026-09-11', sameDayOrder: 300, amountRupiah: 1000000n },
    { schemaVersion: 'dealtwin.stress-scenario.v1', id: 'bad', type: 'new_obligation', date: '2026-09-22', sameDayOrder: 0, amountRupiah: 1000000n },
  ])('rejects invalid scenario/target instead of silently applying a different stress (%#)', scenario => {
    const base = input(); const before = structuredClone(base);
    expect(() => applyStressTransform(base, scenario as StressScenario)).toThrow('INVALID_STRESS_SCENARIO'); expect(base).toEqual(before);
  });
  it('rejects duplicate scenario IDs before recording ambiguous evidence', () => {
    expect(() => runStressLab(input(), [delay(3), { ...delay(7), id: 'receipts-plus-3' }])).toThrow('INVALID_STRESS_SCENARIO');
  });
  it('new named-stress proof selects a compatible v2 engine without relabeling legacy proofs', () => {
    const dto = namedProof(); expect(dto.engineVersion).toBe('dealtwin-engine-v2'); expect(replayProof(dto).ok).toBe(true);
  });
  it('replay invokes the real compiler for the base and recorded named stress, not copied output', () => {
    const dto = namedProof(); const compiler = vi.fn((value: CompileInput) => compileDeal(value));
    expect(replayProof(dto,compiler).ok).toBe(true); expect(compiler).toHaveBeenCalledTimes(2);
    expect(compiler.mock.calls[1]![0].stressScenario).toMatchObject({ type: 'customer_receipt_delay', days: 3 });
  });
  it('a forged stress success fails replay even after all result and proof hashes are recomputed', () => {
    const dto = structuredClone(namedProof(7)); const runs = dto.stressRuns as Record<string,CanonicalJsonValue>[];
    const payload = runs[0]!.resultPayload as Record<string,CanonicalJsonValue>; const result = payload.result as Record<string,CanonicalJsonValue>;
    const fake = { ...result, outcome: 'COMPILES', reasonCode: null, shortfallRupiah: null };
    runs[0]!.resultPayload = { ...payload, result: fake, resultHash: sha256Canonical(fake) };
    const resultHash = sha256Canonical({ baseResult: dto.baseResult, stressResults: runs.map(run => ({ id: run.id!, resultPayload: run.resultPayload! })) });
    const body = { ...dto, resultHash }; const withoutHash = Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'proofHash'));
    const forged = { ...body, proofHash: sha256Canonical(withoutHash as unknown as CanonicalJsonValue) };
    expect(replayProof(forged).ok).toBe(false);
  });
  it.each<StressScenario>([
    { schemaVersion: 'dealtwin.stress-scenario.v1', id: 'roundtrip-cost', type: 'direct_outflow_increase', basisPoints: 500 },
    { schemaVersion: 'dealtwin.stress-scenario.v1', id: 'roundtrip-ar', type: 'specified_receipt_delay', eventId: 'receivable:judge-existing-so', days: 7 },
    { schemaVersion: 'dealtwin.stress-scenario.v1', id: 'roundtrip-obligation', type: 'new_obligation', date: isoDate('2026-10-15'), sameDayOrder: 300, amountRupiah: rupiah(1000001n) },
  ])('replays a recorded distinct named transform with exact canonical parameters (%#)', scenario => {
    if (scenario.type === 'specified_receipt_delay') scenario = { ...scenario, eventId: input().snapshot.receipts[0]!.economicEventId };
    const dto = namedProof(3,scenario); const compiler = vi.fn((value: CompileInput) => compileDeal(value));
    expect(replayProof(dto,compiler).ok).toBe(true); expect(compiler).toHaveBeenCalledTimes(2);
    if (scenario.type === 'new_obligation') expect((dto.stressRuns as Record<string,CanonicalJsonValue>[])[0]!.parameters).toMatchObject({ amountRupiah: '1000001', date: '2026-10-15', sameDayOrder: 300 });
  });
  it('cannot relabel named stress as a legacy engine or request an unknown future engine', () => {
    const dto = namedProof(); const compiler = vi.fn((value: CompileInput) => compileDeal(value));
    const seal = (engineVersion: string) => { const body = Object.fromEntries(Object.entries({ ...dto, engineVersion }).filter(([key]) => key !== 'proofHash')); return { ...dto, engineVersion, proofHash: sha256Canonical(body as CanonicalJsonValue) }; };
    expect(replayProof(seal('dealtwin-engine-v1'),compiler)).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_STRESS_VERSION' } });
    expect(replayProof(seal('dealtwin-engine-v3'),compiler)).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_ENGINE_VERSION' } });
    expect(compiler).not.toHaveBeenCalled();
  });
  it('does not ambiguously stack stress transforms over an already stressed input', () => {
    expect(() => applyStressTransform(applyStressTransform(input(),delay(3)),delay(7))).toThrow('INVALID_STRESS_SCENARIO');
  });
});
