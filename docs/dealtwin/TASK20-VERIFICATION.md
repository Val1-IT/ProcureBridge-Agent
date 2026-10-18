# Task20 - deterministic named Stress Lab and executable replay

Local continuation from `3b12e36327e5e39942019b8fff4da703943c8b1b`, same managed worktree and LENOVO-VT. No cloud execution, production, Arvanta, push, merge or deploy. No schema, privilege or dependency changes.

## Core contract

`applyStressTransform(CompileInput, StressScenario)` preserves fixed commercial terms and the ERP snapshot. An explicit typed timeline projection delays candidate customer receipts by3/7/14days, increases only candidate direct costs with bigint ceiling rounding, delays one specified expected receipt, or inserts one specified hypothetical obligation. Existing AP, confirmed cash, ordering, provenance and approval authority are not silently changed. Invalid targets/versions/parameters, duplicate scenario IDs and ambiguous stacked transforms fail closed. Every named run is independent and names only the scenario actually executed, never probability or universal safety.

The shared pure runner compiles each projection and records exact canonical parameters, engine/input/result versions, input/output hashes and actual encoded results. The application service is a thin surface; proof/recompiler may consume pure core without importing application/server/provider code.

New named-stress proofs use additive engine `dealtwin-engine-v2` with canonicalization/ERP adapter v1. Replay genuinely executes base and every named scenario from the immutable base inputs, then compares recomputed record/result/proof hashes. A forged stress success fails even after its output and outer proof hashes are recomputed. Unknown versions and attempts to relabel named/legacy formats fail before compiler invocation. Historical v1/no-named proof hashes and compatible base replay remain unchanged. Legacy opaque v1 stress records remain historical hash-attested metadata, not evidence that the new named-stress engine executed them; the new solver/workflow must not treat them as required-stress eligibility.

## Actual RED/GREEN

- First test declaration failed because `%j` cannot print bigint; no assertions ran, so not behavioral RED. Changed only formatter and the correct canonical approval constraint ID.
- Behavioral RED:17/17failed,894ms, after minimal import/type scaffold. Wrong receipt dates/costs, absent obligation/result and missing validation were observed.
- Initial GREEN: stress+compiler+proof63/63PASS,2.19s; typecheckPASS.
- Executable replay RED:3failed17passed,631ms. New format was still v1, compiler ran only for base, and a forged rehashed stress success was accepted.
- Replay GREEN:66/66PASS,2.19s. Typecheck then caught readonly JSON-array narrowing; runtime array guard retained and explicit record narrowing fixed the type error.
- Engine-provenance RED:1failure with19filtered cases; no engine version in recorded input. Provenance plus pure-runner separation GREEN66/66PASS2.76s/typecheckPASS.
- Expanded focused gate:71/71PASS,7files,3.38s. Includes all distinct named transform round-trips, exact decimal-string obligation parameters, unsupported/downgrade denial and nested-transform rejection.

Locked candidate25% base/+3days retains minimumRp5m. +3moves deposit toSept19 and balance toOct3 while existing AR staysSept20. +7/+14produce negativeRp10m projected minimum; +14expands horizon throughOct14. +500bps makesRp42m costRp44.1m/minimumRp2.9m; aRp1 cost rounds conservatively toRp2. SpecifiedRp1m extra obligation onSept22/order300 yields minimumRp4m. All values are actual compiler assertions, not UI literals.

Final full command: `npm.cmd run test:coverage -- --testTimeout=60000 --hookTimeout=60000 --reporter=dot --reporter=json --outputFile=.cache/task20-full.json`, verified local disposable URL. **94files966testsPASS0skips295.15s**, including140realPG+826nonPG (18injected-client cases included),25Task20 cases and all Task16-19/payment/reset/schema/RLS regressions. Legacy configured coverage gatePASS97.78% statements/lines,85.64%branches,99.21%functions; not full DealTwin coverage.

Typecheck/lint/build/diff-checkPASS; no lint warnings. Existing vinext plugin-timing/static-classification notices remain. Disposable PG15.4 uses loopback55432/dealtwin_test, fsync/synchronous_commitON, WALcap256MB, application SQLtimeout5s unchanged. Original checkout remains clean at e69b60c. Hosted CI/PG16/browser E2E remain unrun.

## Scope rulings

1. Fixed deposit/acceptance date contracts are not rewritten for adverse receipts: stress is a typed projection. Cost if wrong: new stress versions need explicit compatible projection semantics.
2. Executable named replay requires additive v2, not relabeling historical v1 data. Cost if wrong: release gates must not treat legacy opaque metadata as required-stress verification.
3. A separate pure runner and small canonical encoder exports preserve dependency direction/reuse. Cost if wrong: broader DTO extraction can be considered later, not an ERP rewrite now.

This is the core Stress Lab/proof-format gate. No new live HTTP stress/proof workflow, v2 database workflow or UI is claimed before Task22-24 integration. Current PG suites are regression evidence, not a new v2 browser/server journey. One final whole-branch independent review remains due at the end of inline execution.

Next gate: Task21 finite lexicographic solver and exact-tuple atomic replacement of a still-reserved aggregate, preserving a committed Deal's existing Sales Order/capacity.

Completed code SHA: `e003528c3e67554132c17db58dd9d6b67c867a0f`. Completion gate at this SHA:25/25PASS0skips3.25s. Subsequent documentation closure does not change tested runtime content.
