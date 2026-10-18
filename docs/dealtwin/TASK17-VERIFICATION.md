# Task 17 — commitment lifecycle and immutable replay

Scope: local implementation from `00cd3af78b967ea22973047ba467fdcdd4d986f6`, detached managed worktree `C:/Users/Valen/.codex/worktrees/dealtwin-judge-state/DealTwin`. Its HEAD matched the requested SHA and tracked/untracked status was clean before work. Original checkout `C:/Users/Valen/Documents/ChatGPT/DealTwin` remained clean at `e69b60caa8d4aa108cebc199b4ce49a42f64b3b7`. No push, merge, deployment, production access or Task 18 work.

## Delivered contract

- `releaseCommitment`, `expireCommitment`, `cancelCommitment` share the existing Task 16 one-client transaction, workspace lock, least-privilege role guard and immutable audit-receipt store. The locked domain transition function remains authoritative: reserved can release/expire/cancel; committed can release/cancel; terminal states reject all new lifecycle requests.
- Successful receipt lookup occurs before expected-revision comparison and target/status lookup. Original HTTP status/body survive terminal transitions, changed server time, repository/runtime recreation and Judge reset. Actor authorization remains enforced; changed commitment/proof/version/hash/revision with an occupied success key returns `IDEMPOTENCY_KEY_REUSED` without writes.
- Parameterized conditional UPDATE matches tenant, commitment ID, exact proof/version/hash tuple, original status and permitted source statuses. Expiry additionally compares the persisted non-null deadline with the injected server clock. `RETURNING` supplies the full updated row and exactly one affected row is required.
- Only release writes `release_idempotency_key`, `released_at` and release evidence. Reserve/commit keys are preserved. Expire/cancel use only their namespaced audit-receipt keys; no schema, columns, migrations or privileges changed.
- Immutable canonical events/hash, historical proofs and Sales Order link are retained. Lifecycle only frees planning capacity; it never saves ERP business aggregates, creates cash movements, edits the Deal or permits a second COMMIT on an order-linked Deal. It adopts exactly one new workspace revision and one success operation audit. Separate proof-stale system audits may exist for other affected proofs.
- Capacity dependency hashes use the same validated canonical commitment normalizer/DTOs as the compiler adapter. Transaction-local Task 14 invalidation retains the exact proof/version/hash self exemption, invalidates other dependent proofs and rolls back with the entire operation on failure. STALE owner proof does not block legal cleanup or become VALID again.
- POST `/api/dealtwin/commitments/[commitmentId]` accepts only action `release|expire|cancel`, proof/version/hash, expected revision and key. URL supplies commitment ID; signed server session supplies tenant/actor/role; server supplies time. Body identity/deadline overrides, invalid origin, unsupported actions and oversized/malformed requests are rejected. Authoritative state exposes retained deadline/release evidence and remains identical across fresh runtime instances.

## Decisions carried to review

1. The existing nullable `expires_at` is authoritative: configured deadline and server time >= deadline, including equality, are required for expiry. PostgreSQL comparisons retain microsecond precision. Neither locked specification nor Task 17 defines a default TTL; none is invented and no client setter is added. Cost if wrong: unconfigured reservations require release/cancel or a separately approved deadline policy.
2. Cleanup derives only active-capacity dependency changes, without allocation/compiler eligibility or an ERP save. This allows STALE-proof cleanup without making old proof evidence authorize a new allocation. Cost if wrong: unrelated ERP dependency invalidation still needs Task 19 mutation hooks; those are not claimed here.
3. A focused application `commitment-lifecycle.ts` owns lifecycle orchestration/receipts, called through the planned CommitmentService API; PostgreSQL/time/HTTP stay outside the domain/application layer. This keeps the verified Task 16 allocation path unchanged apart from port extension. Cost if wrong: one small module can be folded back into the service without changing its public contract.

## Observed evidence

Environment reverified: Windows, Node 24.19.0, npm 11.17.0, Vitest 3.2.4, PostgreSQL 15.4. Database `127.0.0.1:55432/dealtwin_test`, verified data directory `C:/Users/Valen/AppData/Local/Temp/dealtwin-task16-pg-20261006`. Existing disposable cluster reused. Schema/setup uses the test owner; actual operations use `dealtwin_app_login` (no owner/superuser/RLS bypass), reset uses distinct reset login. PostgreSQL suites run serially. Application statement timeout remains 5s; assertions, RLS and durability settings were not relaxed. The separate Windows PostgreSQL service remains untouched.

- Clean baseline: `npm.cmd test -- --testTimeout=60000 --hookTimeout=60000 --reporter=dot`: 87 files / 846 tests PASS, zero skips, 147.81s.
- Behavioral RED: `npm.cmd test -- tests/dealtwin/postgres/commitment-lifecycle.test.ts --testTimeout=60000 --hookTimeout=60000 --reporter=dot`: all 32 assertions FAIL against minimal 501 scaffolding after real reserve/commit fixture operations; 67.31s. HTTP command `npm.cmd test -- tests/dealtwin/api/commitment-lifecycle-route.test.ts --reporter=dot`: 4 behavioral failures, 742ms. Neither run failed imports or database setup.
- Initial GREEN: lifecycle + HTTP command, 2 files / 36 tests PASS, zero skips, 41.41s.
- Expanded evidence: 37 PostgreSQL cases cover 15 source/operation pairs, optional/equality/microsecond deadlines, historical retries after reset, STALE cleanup, tuple/role/revision checks, actual foreign-tenant target isolation, nine operation/failure-point combinations, zero-row UPDATE, three external proof invalidations and invalidation rollback. Four HTTP cases exercise all three actions and boundary denials.
- One expanded test run passed 40/41; its sole failure was a helper starting a nested read transaction. Helper corrected to transaction-local `loadErpWorkspace`, preserving all assertions. Initial lint had five unused-variable warnings, removed without behavioral changes. No application failure was hidden or assertion weakened.
- Focused regression command: `npm.cmd test -- tests/dealtwin/postgres/commitment-lifecycle.test.ts tests/dealtwin/postgres/commitment-transaction.test.ts tests/dealtwin/postgres/judge-reset.test.ts tests/dealtwin/postgres/repositories.test.ts tests/dealtwin/api/commitment-lifecycle-route.test.ts tests/dealtwin/api/commitment-routes.test.ts tests/dealtwin/application/commitment-service.test.ts --testTimeout=60000 --hookTimeout=60000 --reporter=dot`: 7 files / 77 tests PASS, zero skips, 86.91s.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `git diff --check`: PASS after helper correction (lint zero warnings).

The full verification and independent review below supersede the initial focused-only evidence.

Pre-review final verification: `npm.cmd run test:coverage -- --testTimeout=60000 --hookTimeout=60000 --reporter=dot` PASS, 89 files / 887 tests, zero skips, 125.63s. This includes 94 actual PostgreSQL tests and 793 non-PostgreSQL tests, all Task 16 and finance/sales/payment/reset regressions. Existing configured coverage gate PASS: statements/lines 97.78%, branches 85.03%, functions 99.21%. The coverage include list targets existing demo/domain/repository modules, so these percentages are NOT full DealTwin module coverage.

Final source typecheck/lint/diff-check PASS (zero lint warnings). `npm.cmd run build` PASS, all five vinext stages; `/api/dealtwin/commitments/:commitmentId` registered. Existing unknown-route static-classification notice remains; no deployment is claimed. Fresh runtime state reads and all target-ID payload mismatch checks are included in this final full run.

Completion gate at code commit `26522e0b528a877c83c077d89a774b45d9f743e6`: `npm.cmd test -- tests/dealtwin/postgres/commitment-lifecycle.test.ts --testTimeout=60000 --hookTimeout=60000 --reporter=dot` PASS, 37/37, zero skips, 44.56s. The pre-review full-suite/build source content is exactly this code commit; subsequent closure changes this report only, not runtime/tests/schema.

## Independent review and scope rulings

Fresh read-only GPT-6 Astra reviewed `00cd3af..26522e0` against locked spec/Task 17, source, behavioral test coverage and recorded evidence. Verdict: ready for human review; no concrete Critical, Important or Minor defects found. It independently reran the HTTP suite: 4/4 PASS after an environmental `spawn EPERM` required an approved rerun. No implementation changes or PostgreSQL operations by reviewer. The PostgreSQL/full-suite/build evidence was executed and inspected by the implementer, not represented as independently reproduced by the reviewer. No fix pass or re-review was needed. No deferred minors.

The reviewer did not dismiss any suspected defect through scope exclusion. Executor decisions on every reviewed exclusion, in review order:

1. Two-client races/concurrent reset contention/repeated-race CI remain Task 18, not authorized here. Static one-client lock paths and current atomicity tests were reviewed. Cost if wrong: concurrency behavior requires the separate real race gate before a release claim.
2. Default TTL/deadline configuration/scheduling remains undefined; retain optional stored deadlines and explicit expiry, without a scheduler or client setter. Cost if wrong: unconfigured reservations need release/cancel until a deadline policy is approved.
3. Automatic invalidation for unrelated ERP mutations remains Task 19; current cleanup invalidates changed capacity only. Cost if wrong: later ERP entrypoints must install the separate invalidation hooks before end-to-end freshness claims.
4. Recompile/re-reservation orchestration and remediation of committed Deals remain later scope; lifecycle preserves the linked order and cannot create a second one. Cost if wrong: lifecycle cleanup alone is not a full renegotiation workflow.
5. Browser/UI/provider/MCP/deployment/production security gates and unchanged mapper item-pruning limitations remain unproven or separately scoped. Cost if wrong: these gates must be completed before public release; local service/route tests cannot substitute.
6. Reviewer did not reproduce historical RED or PG/full/coverage/build runs; implementer observed all those actual runs and reviewer independently executed only HTTP tests. Accepted as independent source/contract review, not a second integration run. Cost if wrong: independent integration reproduction may still be required by a later release gate.

Final boundary: stop for human review before Task 18; preserve managed detached worktree. No push, merge, deployment, production access, package/schema/privilege changes or synchronized source edits. Original checkout stays clean. The disposable cluster is stopped at the checkpoint, without deleting its test data directory or changing the separate Windows PostgreSQL service. Only regenerated skill scratch is removed after this evidence is committed.

Shutdown evidence: initial fast-shutdown wait exceeded 30s while the existing timed checkpoint was syncing 103545 files. Read-only log/process checks and a bounded wait confirmed that checkpoint completed, the shutdown checkpoint completed, and `database system is shut down` at 2026-10-06 06:52:35 +04. Final `pg_ctl status` returned `no server running`. No forced process kill, immediate crash shutdown, assertion/timeout relaxation or durability change was used; the separate Windows PostgreSQL service stayed Running. This environmental wait does not alter the preceding test results.

## Changed-file inventory

```text
app/api/dealtwin/commitments/[commitmentId]/route.ts
docs/dealtwin/TASK17-VERIFICATION.md
lib/dealtwin/application/commitment-lifecycle.ts
lib/dealtwin/application/commitment-service.ts
lib/server/dealtwin/request-contract.ts
lib/server/dealtwin/runtime.ts
lib/server/postgres/postgres-commitment-service.ts
tests/dealtwin/api/commitment-lifecycle-route.test.ts
tests/dealtwin/postgres/commitment-fixture.ts
tests/dealtwin/postgres/commitment-lifecycle.test.ts
```

## Remaining boundaries

- Task 18 two-client race/20-race CI and later UI/provider/mutation-hook tasks are not implemented or verified by this session. Local green tests are not CI, browser E2E, deployment or production proof.
- No automatic expiry scheduler or default deadline policy is introduced; this API performs explicit expiry using stored deadlines only.
- Existing ERP mapper does not prune reduced document item/source arrays (Task 14–15 evidence). Lifecycle never shrinks or saves those documents; this known boundary is unchanged.
- Existing ProcureBridge/browser demo, sources, package versions, infrastructure, schemas and locked product/traceability documents are unchanged.
