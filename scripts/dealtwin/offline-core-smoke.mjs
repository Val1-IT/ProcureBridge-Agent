// Supplemental Node 24 smoke for an offline source-only handoff.
// Runs actual pure modules. It does not replace Vitest, coverage, PostgreSQL,
// browser, MCP/provider, or release gates. No database or network is used.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
import test from 'node:test';

// Native type stripping does not resolve the source's extensionless imports.
// Keep the resolver local to this process; do not transform production files.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL) {
      const candidate = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(candidate)) return next(candidate.href, context);
    }
    return next(specifier, context);
  },
});

const {createJudgeScenario} = await import('../../lib/dealtwin/judge/scenario.ts');
const {compileDeal} = await import('../../lib/dealtwin/compiler/compile-deal.ts');
const {buildSnapshot} = await import('../../lib/dealtwin/erp/build-snapshot.ts');
const {hashCanonicalCashEvents} = await import('../../lib/dealtwin/domain/canonical-event.ts');
const {findSmallestAmendment} = await import('../../lib/dealtwin/recompiler/recompile-deal.ts');
const {runStressLab} = await import('../../lib/dealtwin/stress/run-stress-lab.ts');
const {createDealVersion} = await import('../../lib/dealtwin/domain/deal.ts');
const {buildDealProof} = await import('../../lib/dealtwin/proof/build-proof.ts');
const {replayProof} = await import('../../lib/dealtwin/proof/replay-proof.ts');

const judge = createJudgeScenario();
const initial = {snapshot: judge.snapshot, terms: judge.initialTermsA,
  constraints: judge.constraints, policy: judge.policy, approvedApprovalCodes: []};
const candidate = {...initial, terms: judge.candidateTermsA};
const delay = days => ({schemaVersion: 'dealtwin.stress-scenario.v1',
  id: `receipts-plus-${days}`, type: 'customer_receipt_delay', days});
const amendmentPolicy = {schemaVersion: 'dealtwin.amendment-policy.v1',
  depositMaximumBps: 4000, earliestCustomerBalanceDays: 2,
  latestSupplierPaymentDays: 14, supplierApprovalPermitted: true,
  requiredStressScenarios: [delay(3)]};
function snapshot(state, commitments = [], self = null) {
  const result = buildSnapshot({state, tenantId: judge.tenantId,
    asOfDate: judge.snapshot.asOfDate, requestedHorizonEnd: judge.snapshot.requestedHorizonEnd,
    adapterVersion: judge.snapshot.adapterVersion, commitments, self});
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result.value;
}
function proof() {
  const version = createDealVersion({id: 'offline-version', dealId: 'offline-deal',
    version: 1, terms: candidate.terms, createdBy: 'synthetic-offline-smoke',
    createdAt: '2026-09-16T00:00:00.000Z'});
  const result = buildDealProof({proofId: 'offline-proof', dealId: version.dealId, version,
    snapshot: candidate.snapshot, constraints: candidate.constraints, policy: candidate.policy,
    baseResult: compileDeal(candidate), stressRuns: runStressLab(candidate, [delay(3)]),
    assumptions: [], approvals: [{id: 'offline-approval', proofId: 'offline-proof',
      dealVersionId: version.id, kind: 'non_arithmetic_authorization', status: 'pending'}],
    approvedApprovalCodes: [], generatedAt: '2026-09-16T00:00:00.000Z'});
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result.value.dto;
}

test('initial profitable-looking deal fails by exactly Rp3m on September 22', () => {
  const result = compileDeal(initial);
  assert.equal(result.outcome, 'DOES_NOT_COMPILE');
  assert.equal(result.reasonCode, 'MINIMUM_CASH_VIOLATION');
  assert.equal(result.firstViolationDate, '2026-09-22');
  assert.equal(result.shortfallRupiah, 3000000n);
  assert.equal(result.timeline.minimumProjectedBalance, 2000000n);
});

test('25% deposit reaches Rp5m but retains the approval requirement', () => {
  const result = compileDeal(candidate);
  assert.equal(result.outcome, 'CONDITIONALLY_VALID');
  assert.equal(result.reasonCode, 'APPROVAL_REQUIRED');
  assert.equal(result.timeline.minimumProjectedBalance, 5000000n);
});

for (const [days, minimum, outcome] of [[3, 5000000n, 'CONDITIONALLY_VALID'],
  [7, -10000000n, 'DOES_NOT_COMPILE'], [14, -10000000n, 'DOES_NOT_COMPILE']]) {
  test(`named +${days}-day stress recomputes exact cash and preserves inputs`, () => {
    const before = structuredClone(candidate);
    const [run] = runStressLab(candidate, [delay(days)]);
    assert.equal(run.result.outcome, outcome);
    assert.equal(run.result.timeline.minimumProjectedBalance, minimum);
    assert.deepEqual(candidate, before);
    if (days === 14) assert.equal(run.result.effectiveHorizonEnd, '2026-10-14');
  });
}

test('bounded solver examines 2457 candidates and chooses only 25% deposit', () => {
  const result = findSmallestAmendment(initial, amendmentPolicy);
  assert.equal(result.outcome, 'AMENDMENT_FOUND');
  assert.equal(result.evaluatedCandidates, 2457);
  assert.deepEqual(result.candidate.changedFields, ['deposit_basis_points']);
  assert.equal(result.candidate.terms.customerPaymentEvents[0].basisPoints, 2500);
  assert.equal(result.candidate.terms.customerPaymentEvents[1].daysFromAcceptance, 14);
  assert.equal(result.candidate.terms.directCostEvents[0].daysFromAcceptance, 6);
  assert.equal(result.candidate.baseResult.timeline.minimumProjectedBalance, 5000000n);
});

test('increased AP yields a 27% proposal with Rp5.2m floor', () => {
  const result = findSmallestAmendment({...initial, snapshot: snapshot(judge.apMutationState)}, amendmentPolicy);
  assert.equal(result.outcome, 'AMENDMENT_FOUND');
  assert.equal(result.candidate.terms.customerPaymentEvents[0].basisPoints, 2700);
  assert.equal(result.candidate.baseResult.timeline.minimumProjectedBalance, 5200000n);
});

test('an exhausted amendment policy returns no feasible amendment', () => {
  assert.deepEqual(findSmallestAmendment(initial, {...amendmentPolicy,
    depositMaximumBps: 2000, earliestCustomerBalanceDays: 14,
    latestSupplierPaymentDays: 6, supplierApprovalPermitted: false}),
  {outcome: 'NO_FEASIBLE_AMENDMENT', evaluatedCandidates: 1, feasibleCandidates: 0});
});

test('proof replay invokes the real compiler for base and named stress', () => {
  let invocations = 0;
  const result = replayProof(proof(), input => {invocations++; return compileDeal(input);});
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(invocations, 2);
  assert.equal(result.value.resultHash, result.value.recomputedResultHash);
});

test('altered proof hash fails closed', () => {
  const result = replayProof({...proof(), proofHash: 'b'.repeat(64)});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'REPLAY_MISMATCH');
});

test('in-memory capacity projection blocks B and exact self identity counts A once', () => {
  // This is a pure projection, NOT a PostgreSQL reservation or race test.
  const events = compileDeal(candidate).timeline.events.filter(event => event.dependencyKey.startsWith('deal:event:'));
  const identity = {proofId: 'projection-proof', dealVersionId: 'projection-version',
    canonicalEventHash: hashCanonicalCashEvents(events)};
  const commitment = {...identity, id: 'projection-commitment', status: 'reserved', events};
  const alone = compileDeal({...initial, terms: judge.collisionTermsB});
  assert.equal(alone.outcome, 'CONDITIONALLY_VALID');
  const collision = compileDeal({...initial, terms: judge.collisionTermsB,
    snapshot: snapshot(judge.erpState, [commitment])});
  assert.equal(collision.outcome, 'DOES_NOT_COMPILE');
  assert.equal(collision.shortfallRupiah, 5000000n);
  assert.equal(collision.firstViolationDate, '2026-09-23');
  assert.deepEqual(collision.conflictingCommitmentIds, [commitment.id]);
  assert.deepEqual(compileDeal({...candidate,
    snapshot: snapshot(judge.erpState, [commitment], identity)}), compileDeal(candidate));
});
