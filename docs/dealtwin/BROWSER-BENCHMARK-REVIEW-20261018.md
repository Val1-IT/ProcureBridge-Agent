# Browser completion and benchmark/restore review

## Browser evidence

After the owner closed Chrome, the isolated Playwright harness completed **11/11 checks: ten browser cases and one HTTP control**, zero failures, skipped or flaky results, exit 0, **115.887 seconds**. Chromium sandboxing remained enabled, one worker and zero retries. The run began at 2026-10-18 23:35:56 UTC.

Evidence: `output/browser-5376bf0-20261018-2335/browser.json`, `summary.json`, resource samples and screenshots under `playwright/evidence/`. Durable Judge journeys passed at 1440, 1024 and 820 px; keyboard/navigation checks passed at 390 and 1440 px. Error recovery, reset cancellation, signed-session bootstrap, unauthorized mutations, lost-response retry, hydration assets and traversal denial passed.

Source attribution: HEAD was `5376bf03944b020ddcf8c7b40a905635d0e49a05`, with only the untracked draft `tests/dealtwin/evaluation/benchmark-output.test.ts` present. That draft was not loaded by Playwright. All application/browser source remained identical to the previously tested `17b5c75` product tree; all 128 Node artifact hashes were verified against its manifest before execution. This is explicitly not a clean-HEAD browser invocation, and it does not create a new full-suite result. The **1328/1328 tests across 135 files** and completed coverage/build evidence remain attributed to `17b5c75be4b9116a59e7db4606c0dac9fc49db18`.

Available RAM was 5461 MiB at launch; recorded in-run samples were 5246, 4875, 4793, 4989 and 5788 MiB, all above the unchanged 4096 MiB guard. The previous interrupted browser run remains incomplete and preserved. The fixture performed automatic crash recovery from that previous interruption, then reported ready. At completion, graceful PostgreSQL stop returned 0, authorized status returned 3 (stopped), and purpose-bound inspection found no remaining owned demo/browser processes. `cleanup.json` records this. No user Chrome session was reopened and no unrelated process was killed.

## Concrete benchmark defect and scoped correction

`runBenchmarkCommand` previously called `measureDisposableServices` before creating its supposedly immutable output directory. Those observations reset and mutate the synthetic Judge fixture. Consequently, reuse of an existing run ID could reach database work before failing with `EEXIST`, and a later output-directory failure could leave mutations with no reserved evidence destination.

The correction atomically reserves the new directory **before service work**, using the existing non-recursive `mkdirSync(folder)` refusal for duplicate IDs. Failed/incomplete run directories remain reserved; retry requires a fresh ID. Existing evidence is never overwritten. No financial algorithm, application endpoint or browser behavior changes.

Three regression assertions use the real CLI function and real temporary output files, with the database-pool boundary replaced by an immediate throw so that the reproduction cannot connect or mutate data. The first run was interrupted by the RAM guard before assertions and is not RED evidence. After Chrome closed, the completed RED run failed all three assertions: duplicate completed/incomplete IDs reached the database boundary, and a failed new run had not reserved a directory. The correction then passed **32/32 tests in three files**, including existing actual CLI output/replay and benchmark calculation tests, in **13.92 seconds**. No database was started for these tests.

Evidence: `output/benchmark-reservation-20261018/red-2.json`, `green.json`, `verification.json`. The passing run is bound to base `5376bf0` plus the exact source/test hashes in that receipt; it is not a new whole-suite claim. Typecheck and changed-file lint both completed with exit 0, recorded in `source-checks.json`. A standalone service benchmark has not yet been claimed by this section.

## Completed standalone benchmark and replay

The correction was committed as **`d9ae617793449ffd0ba9a8a553bbcf655ef324ce`**. The standalone benchmark then ran from that clean commit with the existing disposable PostgreSQL fixture, a 512 MiB heap cap and no live provider. Both benchmark and independent replay exited 0. Source fingerprint: `ae25978d111697ce248603d98f06f005a9f5e181bd0bedd86aff2bb9f3ffbd98`.

| Measured result | Actual value |
|---|---:|
| Corpus | 13 core + 100 generated = **113 cases** |
| Compiler false-feasible / false-infeasible | **0/68**, **0/45** |
| Same-day ordering mismatch | **0/40** |
| Canonical proof replay / amendment mismatch | **0/113**, **0/113** |
| Duplicate commitment / missed staleness / idempotency / race failures | **0/3 each**, actual service observations |
| Offline extraction contract checks | **4/4**; not live model accuracy |
| Fixed-rule false-feasible / false-infeasible baseline | **35/68**, **22/45** |
| Independent mismatch replay | **57/57 reproduced**, zero failed; all are fixed-rule baseline mismatches |
| Live LLM-only baseline | **NOT_MEASURED: PROVIDER_EVIDENCE_MISSING** |

The report and independent replay are in `output/dealtwin/task27/final-d9ae617-20261018/`. Command logs, exit receipts, summary, resource samples and cleanup are in `output/benchmark-d9ae617-20261018/`. This closes the bounded standalone synthetic benchmark gap, not physical restore or live extraction evidence. The three measured two-pool races are not exhaustive scheduling evidence.

PostgreSQL was gracefully stopped after completion (stop 0, authorized status 3), and no process using this project's pinned Node executable remained. No browser, database or test session is left active. The `readiness-packet.json` retains all **14 base gates and 42 requirement mappings**, explicitly labels mixed source scopes, and returns `ready: false`, `exactShaComplete: false`. It must not be passed off as an immutable single-candidate release-gate success. The isolated CLI fix does not justify repeating the 18-minute application suite now; schedule any required consolidated exact-candidate pass after remaining changes and gates are settled.

## Dependency disposition review

- All **10 installed braces files** match the maintained patch manifest's expected SHA256 bytes, including unchanged source/license/package files. The installer preflights every locked copy/file before writes, rejects unknown provenance/bytes, and atomically replaces individual files. Interrupted batches can be repaired from known original/patched states. No additional installer defect was established by this review.
- All **five embedded Undici bundle files** match the hashes recorded in the earlier review: Cloudflare plugin, Wrangler, and three Next Edge copies. `source-review.json` and `embedded-verification.json` record the fresh byte checks. No package or bundled source was changed.
- The latest completed audit remains the one at `17b5c75`: **eight high package aggregates** rooted in `GHSA-vfj7-8cjw-p6xm`. Checked local mitigation is not an audit waiver. This source review did not query current upstream availability, rerun audit, or establish a new supported replacement.
- The earlier private Node journey reachability findings remain bounded to their reviewed paths. Unchanged bytes do not establish public/Edge safety. The isolated Node 24.22.0 fix does not rewrite other bundles.
- CI still pins **Node 22.13.0** in `.github/workflows/ci.yml:37`; the four native runtime tests use a `.node.mjs` entry point outside the Vitest include. Do not claim the Windows Node 24.22.0 receipt also validates CI. A CI-runtime alignment needs its own verified platform check; this review does not change or execute CI.

Smallest dependency next step: retain the checked patch and fail-closed audit gate; investigate an upstream replacement only with current primary-source evidence and scoped compatibility tests. Any time-bounded risk disposition is a separate explicit decision. No blanket dependency upgrade, audit suppression or new waiver is warranted by this review.

## Physical restore readiness — concrete safety gap

The historical passing drill at `413c0e4` is preserved under `docs/dealtwin/evidence/cloud-gates-20261018/`. It is **not an executable Windows continuation harness**: its config, imports, binaries, artifact directory and provisioning code hard-code Linux `/workspace/...` locations. Its provisioning script creates a separate PostgreSQL 16 cluster. Its `prepare-target` phase drops the target's `public` schema.

Only `.cache/pg-browser-20261018` was found among this worktree's existing PostgreSQL cache directories. That is the source/demo fixture, not an independently identified restore target. Do not direct the historical destructive target-preparation phase at it. The current URL guard allows only loopback, database `dealtwin_test`, ports 55432/55632; do not broaden it merely to make the drill convenient.

Smallest safe sequence once a distinct disposable target is explicitly identified/authorized and resources permit:

1. Bind source and target to verified directory, port, database and role identities; require different clusters and reject ambiguity before any destructive action. Adapt historical paths explicitly for Windows without executing its provisioning script unchanged.
2. Preserve a source snapshot with actual payment/reversal, proof, commitment/Sales Order link and idempotency receipts. Record candidate, migration digests, seed, PostgreSQL version and dump checksum.
3. Dump the source and restore transactionally with `--exit-on-error --single-transaction` into the independently verified empty target. No source overwrite and no unowned database/service cleanup.
4. Compare all table rows and catalogs, including RLS/policies, grants, constraints, triggers, role flags and memberships. Preserve the historical parser-based CHECK-constraint canonicalization rather than removing constraints from comparison.
5. Verify proof replay, original retry responses with unchanged state, foreign-tenant denial, append-only receipts, reset seed, and post-restore payment/cancellation. Stop only owned target work and save exact outcomes, including failed attempts.

A dump listing, current reset test, historical restore, or browser pass cannot close this gate. No dump/restore or new cluster was executed during this review. Target isolation and Windows harness preparation are local readiness work; missing Nebius/Alexa/public identity approvals are separate external blockers.

## Remaining boundaries

Task 29 / DT-042 remain PARTIAL. Browser execution is now evidenced for the unchanged application tree, and the standalone synthetic benchmark/replay passed on clean d9ae617. Physical restore, dependency audit/embedded-source disposition, real Nebius model/access/budget evidence, real Alexa account/profile/consent, public identity/TLS and hosting ownership/deployment evidence remain open. No push, publication, deployment, paid call, credential or security/network-setting change, or final video occurred.
