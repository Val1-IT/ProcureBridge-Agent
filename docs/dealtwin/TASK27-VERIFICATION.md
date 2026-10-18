# Task27 — local synthetic benchmark checkpoint

Started from57f45d31809d7d240d9cb1072070ad404253daf8 on2026-10-13, same managed
isolated worktree. Tasks1–26 implementation was not restarted. First source
checkpoint d31f0bac5eb2c7a2e4babde5e7ad7e68d6fd1f61. Reviewed/fixed executable
checkpoint1e65a803720280ebd518ab8bfcb7696af7a6de43. Independent static review
and one fix pass finished. The previously pending full gate passed on2026-10-15
from clean2da5f5a511131ad8753333c55c1608f238ed9795. Task27 local gate is closed;
this is NOT public/deployment/competition release readiness.

## Closure evidence — 2026-10-15

Same managed detached worktree, verified cleanHEAD2da5f5a before execution;
original checkout clean/unchanged at e69b60caa8d4aa108cebc199b4ce49a42f64b3b7.
Prior inventory-test blocker no longer present: native process preflight found
no heavy test/build before startup and again immediately before the full gate.
Reused installed Node24.19.0/Vitest3.2.4/V8 coverage and native PostgreSQL15.4;
no dependency installation or schema/code/configuration edits. Exact owned
loopback55632/dealtwin_test/datadir, fsync/synchronous_commitON, app/reset
NOSUPERUSER/NOBYPASSRLS logins, source_text prerequisite and0other clients
verified together. Existing harness migrations and actual app/reset-role
commands executed as part of the full suite, not mocked database evidence.

Actual command (one serial run, unchanged60s test/hook limits):
`task-done docs/superpowers/plans/2026-09-11-dealtwin-proof-carrying-commerce.md 27 57f45d31809d7d240d9cb1072070ad404253daf8 -- npm.cmd run test:coverage -- --testTimeout=60000 --hookTimeout=60000 --reporter=dot --reporter=json --outputFile=.cache/task27-closure-20261015.json`.
Exit0:118files1147/1147testsPASS,0failed/0pending/0todo/0skips,750.49s.
JSON success=true and every file passed; completion ledger appended only after
test/coverage success. Source was unchanged throughout the run.

Retained actual PostgreSQL payment lifecycle2, financial reset3, Judge reset6,
schema11, RLS7, repositories5, commitment transaction28/lifecycle37/race23/
failure-injection7, invalidation16/primitive4 all PASS. Evaluation suites31cases
PASS (28oracle/metrics,1realPG observer,1actual CLI,1fingerprint). All legacy
finance/sales and remaining non-PostgreSQL tests also ran in the same gate.
These are regression counts, not new benchmark sample denominators.

| Coverage group | Lines / statements | Functions | Branches |
|---|---:|---:|---:|
| Configured global (4239 lines) | 95.98% | 99.36% | 83.60% |
| DealTwin domain | 92.90% | 100% | 86.30% |
| DealTwin compiler | 95.08% | 100% | 88.81% |
| DealTwin proof | 93.02% | 100% | 75.17% |
| DealTwin recompiler | 100% | 100% | 90.38% |
| DealTwin application | 98.15% | 98.46% | 81.87% |

All unchanged70line/function/statement60branch global AND per-group gates PASS;
no exclusions or threshold reductions. Configured coverage is not whole-repo
coverage of every adapter/UI module. Full JSON is
.cache/task27-closure-20261015.json; coverage/coverage-summary.json and
.superpowers/sdd/2026-09-11-dealtwin-proof-carrying-commerce/task-27-tests.log
retained locally. Known pg queued-query deprecation/future9 warning observed,
not a test failure or driver remediation; no second reviewer dispatched.

The three Important review fixes now have their prior behavioral RED→GREEN
AND fresh full1147/1147 regression evidence. Review itself remains the prior
single static Astra review; parent runtime evidence is not independent runtime
acceptance. Minor replay.json replacement remains deferred, unchanged.

Unchanged standalone benchmark/replay/typecheck/lint/build were not repeated;
their dated prior evidence remains below, not relabelled as newly executed.
The full suite did execute its existing actual-CLI regression once as included
coverage, without overwriting preserved named benchmark/replay artifacts.
Readback of that fresh CLI artifact confirms clean2da5f5a and exact executable
fingerprint5546a538cf13f5c33d19e4b7ec2e8a11ec2f1b9ada778df2a2cdcd021ed39ee6,
identical to the preserved measured benchmark. Final bounded pattern scan of
20changed files found0secret-pattern matching files; not exhaustive security
certification. git diff --check PASS.
Only docs/status/traceability are changed for this closure checkpoint. After
all tests, exact ownedDB/port/datadir and0other clients verified again; normal
pg_ctl fast/wait30 shutdown completed, status3 confirmed stopped. Data/cache,
worktree and private artifacts retained, unrelated processes/services untouched.
PowerShell propagated the expected native stopped-status3 as a nonzero wrapper
exit; explicit read-only status check confirmed3/normal stopped state.

Ruling: reuse unchanged prior benchmark and one completed review/fix pass;
only the missing full gate is fresh here. Cost: no new live-provider/browser/
hostedCI/PG16/release evidence is implied. Ruling: preserve worktree/ledger and
stop now per direct instruction rather than skill cleanup/next-task defaults.
Cost: further maintenance and Tasks28–29 require a new instruction. No push,
merge, deploy, publish, production or real data. Next action: human review.

## Preserved measured benchmark (2026-10-13)

On clean1e65a803720280ebd518ab8bfcb7696af7a6de43:
`npm.cmd run benchmark:dealtwin -- --run-id task27-final-20261013` PASS.
Executable fingerprint:
`5546a538cf13f5c33d19e4b7ec2e8a11ec2f1b9ada778df2a2cdcd021ed39ee6`.
`npm.cmd run benchmark:dealtwin -- --replay task27-final-20261013` PASS,
57/57 mismatches reproduced,0 failures; all mismatches fixed_rule only.
13core+100generated(seed27)=113cases. Compiler false-feasible0/68,
false-infeasible0/45; fixed rule35/68 and22/45; same-day0/40;
replay/amendment0/113; duplicate/missed-stale/idempotency/race each0/3;
offline extraction contract correct4/4; LLM-only NOT_MEASURED.
Ignored artifacts in output/dealtwin/task27/task27-final-20261013/ are retained.
Final replay was invoked once; prior measured run is also preserved separately.

Latest focused command:
`npm.cmd test -- tests/dealtwin/evaluation tests/dealtwin/proof/replay-proof.test.ts tests/dealtwin/compiler --reporter=dot --reporter=json --outputFile=.cache/task27-review-green-20261013.json --hookTimeout=60000`:
65/65PASS9files14.58s. Typecheck/lint0warnings/build PASS after minimal fixture
type-inference correction; no runtime source change after focused GREEN.
Actual build command: `npm.cmd run judge:build`, all five local Node build
stages PASS; existing ineffective dynamic-import notices remain warnings.

### Historical pause — superseded by the closure above

At checkpoint2da5f5a mandatory full frozen-source regression/coverage had NOT RUN. Before the long
gate, exact process inventory found unrelated
`node --test --test-concurrency=1 ... inventory-opening-cost-application-v2.test.mjs`
(38368 plus child13416, started17:44:44), still active17:55:54 local time.
Repeated guarded launches exited3 before invoking test runner; no task-done
completion record or final JSON was created. Human instruction forbids heavy
overlap, and stopping the other project is not authorized. Task27 stays
in_progress. No coverage percentage, full finance/security regression pass,
or independent runtime acceptance is inferred from focused results.

Once laptop lane is free, preserve the same worktree and executable fingerprint,
restore disposable55632 profile (fsync/synchronous_commitON), verify exactDB,
app/resetroles/source_text and0other clients together, then run:
`task-done docs/superpowers/plans/2026-09-11-dealtwin-proof-carrying-commerce.md 27 57f45d31809d7d240d9cb1072070ad404253daf8 -- npm.cmd run test:coverage -- --testTimeout=60000 --hookTimeout=60000 --reporter=dot --reporter=json --outputFile=.cache/task27-final-20261013.json`.
Do not rerun unchanged focused/benchmark gates; whole-suite gate is new, still
unexecuted. Do not lower thresholds, skip finance/RLS/reset cases, restart
Tasks25–26, seek a second reviewer, or startTasks28–29.

Before stopping for review: exact dealtwin_test/55632/datadir and0other clients
read back; owned cluster stopped normally with pg_ctl fast/wait30s and status
confirmed no server. Cache/data/artifacts retained; unrelated services untouched.
Scoped secret-pattern scan20changed files0matching files, not a full security
audit. Original checkout clean at e69b60c; final docs-only checkpoint preserves
tested executable source1e65a80. Worktree remains detached and retained.

## Delivered profile and truthful scope

13 hand-authored core fixtures plus100 deterministic generated cases (seed27).
The bounded profile has one product/direct-cost event, one authoritative AP and
AR chain, exact IDR opening/floor, fixed September12/16/15/20 dates, and bounded
deposit/customer/supplier amendments with explicitly required receipt-delay
stress. Inputs/identities/decimal money/search bounds are strict and unique.
This is not a claim about every ERP lifecycle, policy, stock configuration or
random interleaving. Existing broader financial/tenancy tests remain regression
gates, not fabricated benchmark observations.

The independent oracle imports no production financial/timeline/compiler/search
or stress helpers: it independently visits every ordered cash prefix and every
bounded grid point, tests base/required stress, and ranks by the five numeric
lexicographic coordinates. Those coordinates uniquely identify a point in this
single-cost profile, so a canonical-hash tie cannot occur. Production evaluation
uses genuine buildSnapshot, compileDeal, findSmallestAmendment, buildDealProof
and replayProof. Every case carries exact financial evidence, counts, context
hash and oracle result. Financial eligibility includes CONDITIONALLY_VALID and
does NOT grant approval or guarantee operational COMMIT/legacy-bridge support.

The fixed baseline is explicitly predeclared: revenue>=direct cost AND deposit
>=20%; it ignores cash/timing by design. It is neither an authoritative policy
nor a claim about best available heuristics. No LLM-only score is invented:
equivalent-context captured provider evidence is absent, so NOT_MEASURED.

Service observations run actual trusted local commands using separate app/reset
roles and only dealtwin-judge-v1. Three command flows and three races are sampled
by default; the latter use two distinct application pools. Jobs/tests/other
commands are serial. Offline extraction correctness covers four synthetic
ProviderReply schema/confirmation contracts, NOT live language/model accuracy.
Measurement scopes are embedded in report JSON, not merely an external footnote.

## Historical evidence at first source checkpoint (superseded by review fixes)

- Initial scaffolds:20fail6.32s (19 assertions plus missing-report property access,
  subsequently changed to explicit shape assertion). Actual role-based service
  observer RED1fail4.05s; actual CLI absent artifact RED1fail2.35s.
- Core GREEN20/20PASS969ms; real service1/1PASS5.76s.
- CLI exposed genuine zero-floor replay defects. Direct regressions:3FAIL/21PASS
  1.38s (zero floor, zero opening, incomplete observation). Minimal decoder fix
  plus strict observation validation:39/39PASS9.29s, then final focused40/40PASS
  4files15.44s (three evaluation files plus retained proof regression).
- Typecheck incremental=false/lint max-warnings0 PASS. Full coverage and build
  results are not inferred from these focused gates.
- Measured command on clean d31f0ba:
  `npm.cmd run benchmark:dealtwin -- --run-id task27-measured-20261013`.
  Source tree fingerprint93b8d5a574cd2d3c04338181e7e3cecf1444b0b80745bde5aec924d8c154f061.
- New-process independent mismatch replay:
  `npm.cmd run benchmark:dealtwin -- --replay task27-measured-20261013`:
  56/56 reproduced,0failures. Every reported mismatch belongs to the fixed rule;
  zero compiler/financial/amendment/replay mismatches in this measured corpus.

| Measurement | Actual numerator / denominator | Meaning |
|---|---|---|
| Compiler false feasible | 0/67 | Oracle-negative cases incorrectly called eligible |
| Compiler false infeasible | 0/45 | Oracle-positive cases incorrectly rejected |
| Fixed rule false feasible | 34/67 | Measured naive-rule misses, not compiler failures |
| Fixed rule false infeasible | 22/45 | Measured naive-rule misses |
| Same-day ordering mismatch | 0/40 | Tagged corpus subset only |
| Proof replay mismatch | 0/112 | Genuine compatible recomputation |
| Amendment mismatch | 0/112 | Winner and exhaustive counts match independent oracle |
| Duplicate commitment | 0/3 | Single SO/commitment, second COMMIT blocked |
| Missed staleness | 0/3 | AP19 mutation stales proof, historical payload retained |
| Idempotency failure | 0/3 | Original responses and state/revision unchanged on retry |
| Race behavior failure | 0/3 | One success/conflict/commitment/revision advance |
| Offline extraction contract correct | 4/4 | Synthetic outputs only, NOT live LLM accuracy |
| LLM-only | NOT_MEASURED | Missing equivalent-context provider capture |

Ignored local artifacts: output/dealtwin/task27/task27-measured-20261013/report.json,
mismatch-fixtures.json and replay.json. No artifact/score has been published.
Report/mismatch writes reject overwriting previous evidence. Replay checks the source
fingerprint and reexecutes oracle/compiler, not a stored-output redisplay.

## Prior review fix pass — full gate now closed above

One fresh GPT-6 Astra read-only review of57f45d3..d31f0ba returned
CHANGES_REQUIRED:3Important,0Critical,1Minor. Reviewer did not execute tests,
database commands or build. Both severity and scope retained; no second review.
Five genuine assertion failures/24passes,29cases12.21s reproduce the Important
findings (capture null/expected tampering, missing observed case, zero-opening
diagnostics, excluded mapper fingerprint). Single parent TDD fix pass then
65/65PASS9files14.58s, including actual application/reset-role PostgreSQL,
actual CLI/new-process replay, compiler and legacy proof regression. Latest
typecheck incremental=false/lint max-warnings0/local Node judge:build PASS.

1. Capture integrity: observer v2 requires planned iterations1..10, exactly four
   service cases per iteration plus four offline cases, unique/code-owned IDs
   and metrics, strict metric-specific actual shapes and trusted fixed invariant
   comparisons. A failed race is counted1/1, not made successful by altered
   expected fields; absent/null/cross-metric/wrong-source evidence is rejected.
   Cost: old v1 captures remain historical artifacts, not acceptable current
   scoring evidence. Privileged operator fabrication is not cryptographically
   prevented; this is validation/provenance, not external attestation.
2. Zero opening: prepend an as-of zero balance observation, never a zero cash
   event. Compiler/oracle now agree first violationSeptember12 and shortfall5m,
   notSeptember15/18m. Include this boundary in checked-in core corpus. Positive
   event contracts and immutable historic proof bytes remain unchanged. Cost:
   previously incorrect zero-opening diagnostics may fail genuine new replay;
   never silently rewrite old evidence/hashes or interpret that as authorization.
3. Fingerprint: all lib (including ERP persistence/repository money mappers),
   evaluation, local scripts/schema and package/type/test configuration now
   included. Behavioral test changes real temporary Git fixture mapper/validator
   bytes and verifies hash changes. Cost: broader executable dependency changes
   invalidate replay; documentation-only changes do not.

Deferred Minor: replay.json currently uses replacing write. Report/mismatch
files remain create-only. Keep one final replay invocation and preserved old
artifacts; stronger append-only replay evidence needs a separately reviewed fix.

Reviewer declined widerTasks1–26 correctness, generalized zero-opening effects,
multi-product/multi-cost/unresolved-order/wider-policy evaluation, exhaustive
race/load/rollback/PG-version certification, live extraction/LLM baseline,
HTTP-session/browser/publicMCPAlexa/deployment/real-data claims, independent
full-gate attestation, privileged-operator attestation, and checkout cleanliness.
Ruling: none become implied acceptance; parent executes final local regression,
build and live Git checks, bounded profile stays explicit. Costs: broader
semantic/platform/auth/provider/release evidence remains a later authorized
gate, final runtime results are parent-owned, and localPG15 is not hostedCI16.

## Proven production fix and boundaries

Canonical proof decoding used truthiness on allowed zero cash-floor/opening
balances. Four guards now distinguish null (invalid/missing) from0n (valid).
Positive cash events/price/obligation validation, canonical hashes, immutable
payloads, proof versions, role/approval/revision/transaction behavior unchanged.
No schema, grant, dependency, deployment or domain architecture change.

One late-outflow test originally used75m while expecting-13m ending cash; hand
arithmetic is30-18+20+60-105=-13, so only its cost fixture was corrected to105m.
The compiler/oracle were not weakened to satisfy a wrong fixture.

Owned PostgreSQL15.4/dealtwin_test/55632, same preserved cache datadir,
fsync/synchronous_commitON, actual app/reset NOSUPERUSER/NOBYPASSRLS roles and
source_text prerequisite verified together. First startup omitted the historical
ephemeral flags and attempted default5432; failed bind, logs/config read, then
restored the exact owned55632 profile. No firewall/reservation or unrelated
service changes, production connection, dataset deletion or cloud fallback.

## Rulings and costs

1. Retain unchanged Task26 baseline evidence; final whole suite proves newTask27
   source. Cost: inherited regression can still surface and must be reported.
2. Independent one-cost/AP/AR oracle profile, not universal economic simulation.
   Cost: do not extrapolate rates to arbitrary multi-source ERP/policy schedules.
3. Actual three Judge flows/races, not old unit-test counts relabelled as metrics.
   Cost: not exhaustive interleaving/load or authenticated HTTP-session evidence.
4. Offline extraction contract fixtures only. Cost: live model quality needs
   separately authorized, context-matched captured evidence.
5. LLM-only unmeasured; no speculative importer/live call. Cost: a future fair
   captured-provider baseline needs authorized evidence and a bounded extension.
6. Separate tiny CLI wrapper and two extra CLI/PG behavior suites. Cost: routine
   maintenance of real runner/measurement boundaries beyond the listed brief.
7. Fractional report rates use JSON structural comparison; financial canonical
   JSON remains safe-integer-only. Cost: rates are descriptive, never rupiah or
   allocation authority.
8. Extend unchanged70% line/function/statement and60% branch thresholds to each
   authoritative DealTwin group. Cost: new uncovered behavior needs actual tests,
   not lowered thresholds or exclusions.
9. Four measured zero-vs-null replay guards extend production scope minimally.
   Cost: retained proof and whole regression must catch broader decode effects.
10. Checkpoint source before benchmark for exact SHA; one static review precedes
    final frozen full gate to avoid repeated lengthy suites. Cost: reviewer does
    not independently attest later runtime/coverage; parent gate stays mandatory.
11. Preserve worktree/ignored ledger/artifacts and stopTask27, not cleanup or
    Task28 continuation. Cost: later maintenance and further work need direction.

Task28–29, public Alexa/OAuth/client/provider integration, hosted CI/PG16,
production/migration release certification, publish/submit/push/merge/deploy
remain outside this request. Local full-gate closure is recorded above;
broader release and public integration acceptance is not implied.
