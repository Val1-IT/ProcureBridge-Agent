# Task 16 — Atomic Reserve / Commit

Date: 2026-10-06. Base: `f17da4cb95025efd058adea54ca0b1883783c17a`.
Workspace: existing attached managed `dealtwin-judge-state/DealTwin`, detached HEAD. Main checkout remains clean at `e69b60caa8d4aa108cebc199b4ce49a42f64b3b7`.
Scope: Task 16 only. No Task 17–18 lifecycle/race/CI implementation, push, merge, deploy or production access.

## Contract and behavior

- Application orchestration is transport/driver-neutral. The PostgreSQL adapter binds every read/write to one checked-out client with BEGIN, tenant-local context, bounded SQL timeout, workspace lock, COMMIT/ROLLBACK and release.
- Only server-bound synthetic Judge context with admin/sales role is authorized. Owner/bypass/mixed/reset credentials are rejected. Routes accept bounded strict JSON, require signed session and same origin, bind the target Deal from the path and reject body tenant/role/actor/time/Deal/cash overrides.
- The receipt is read before expected-revision checks or proof/lifecycle lookups. Same actor, action, target tuple and canonical request hash return the exact original HTTP status/body after COMMIT, runtime recreation and reset. Reusing a successful key for changed input/revision is rejected. Blocked operations do not occupy success keys.
- Historical proof hashes and replay are validated; immutable version terms must match. Current ERP snapshot and dependency sets are recomputed under lock. Material ERP changes persist STALE evidence only. Self exclusion verifies proof/version/candidate-event-hash and persisted payload before hiding anything. Events are supplied as candidates exactly once; fixed ordering is never reclassified from 300 to 200.
- Conditional RESERVE accepts only fixed terms with non-arithmetic pending authorization. COMMIT reads current exact proof/version-bound approvals; approved historical payload cannot override a current rejection, missing approval or arithmetic uncertainty.
- Successful RESERVE changes planning capacity, not bank cash. COMMIT requires a reserved tuple and uses `toLegacySalesOrderInput` then actual `createSalesOrder`, creates one draft Sales Order, one `sales_order.created` audit, and adopts its proposed revision once. A Deal linked to an order cannot COMMIT again. Persistence never calls a second incrementing save.
- Unexpected failure after Sales Order line insertion, operational audit insertion or immutable receipt insertion rolls back commitment, Deal, ERP rows, revision and all audits. Same operation can subsequently succeed after removing the disposable test trigger.
- Actual reserve/commit receipts survive Judge reset; a removed proof cannot authorize a new operation key. Task 14–15 payment/reversal/reset suites remain unchanged.
- A valid deal with no new direct-cost event retains only its actual inflows. Summary is total outflow when present, otherwise total inflow with matching direction. It never manufactures a procurement cost; canonical dated events remain authoritative.

## Decisions carried to review

1. Capacity-only dependency changes still mark/retain STALE and deny mutation; deterministic recomputation may additionally return `LIQUIDITY_COLLISION` with exact diagnostics. This is diagnostic, not stale-proof authorization. If reason-code precedence is judged wrong, adjust precedence without relaxing any mutation gate.
2. `prepareCommitmentProof` reuses historical replay decoding and recomputation rather than duplicating canonical decoders. Cost: additional deterministic CPU under the lock, no provider/network I/O.
3. Commitment timeline wrappers use explicit inherited proof order; immutable stored candidate DTOs retain original conservative provenance. Cost: a future provenance display may need a richer wrapper DTO; dates/orders/hashes are not silently rewritten.

## Observed testing

Environment: Windows, Node 24.19.0, npm 11.17.0, Vitest 3.2.4, native PostgreSQL 15.4 on `127.0.0.1:55432/dealtwin_test`. Disposable cluster: `C:/Users/Valen/AppData/Local/Temp/dealtwin-task16-pg-20261006`. Harness performs DDL with its test owner and all business commands with actual separate least-privilege application/reset roles. PostgreSQL suites execute serially. Existing Windows PostgreSQL service is outside this test cluster and untouched.

The previous disposable cluster could not start (missing `pg_notify`). Initial baseline: 779 non-PG passed, 8 PG suites failed setup/41 skipped; not called verified. A fresh cluster was created. Next baseline: 819/820 passed, one existing receipt test timed out at 20s. Exact same receipt suite retried with test/hook timeouts 60s passed 3/3 (19.05s). SQL statement timeout remains 5s and no assertion was weakened.

RED evidence: five application gate assertions, PostgreSQL operation assertions against 501 scaffolding, candidate commitment wrapping, four HTTP boundary assertions and no-outflow summary. One invalid AP-edit fixture was replaced with actual `recordPayment` and then produced behavioral stale RED, not a mapper/configuration error.
Additional audit RED: actual reserve invalidation lacked schemaVersion, tenantId, priorRevision and canonicalEventHash. New invalidation evidence now carries those scalar fields plus actor and canonical dependency-change JSON text. Immutable historical audits are not updated. Transaction/reset/invalidation regression after this fix: 3 files / 24 tests PASS, 38.08s.

First full coverage attempt: 86 files passed, one existing Judge reset replay case failed SQL statement timeout; 843/844 passed, 376.17s. Observed PostgreSQL IO wait was DataFileImmediateSync during heavy schema-reset/checkpoint activity. This run is NOT reported green. The verified disposable cluster alone was subsequently configured with checkpoint_timeout=30min and max_wal_size=2GB; fsync=on and synchronous_commit=on remain unchanged, as does the application's 5s statement timeout. No Windows PostgreSQL service configuration was changed.

Commands actually run so far:

- `npm.cmd test -- tests/dealtwin/application/commitment-service.test.ts tests/dealtwin/postgres/commitment-transaction.test.ts tests/dealtwin/api/commitment-routes.test.ts tests/dealtwin/erp/snapshot.test.ts --testTimeout=60000 --hookTimeout=60000 --reporter=dot`: 4 files / 38 tests PASS, 17.59s (before the additional audit metadata assertion).
- `npm.cmd test -- --testTimeout=60000 --hookTimeout=60000 --reporter=dot`: 87 files / 843 tests PASS, zero skips, 82.39s (before the no-outflow case and additional audit assertion).
- `npm.cmd run typecheck`, `npm.cmd run lint`, `git diff --check`: PASS.
- `npm.cmd run build`: PASS, five vinext build stages and both new API routes registered. Existing unknown-route static classification notice remains, not a deployment claim.

Final verification and independent review are recorded below when completed.
Final pre-review full run: `npm.cmd run test:coverage -- --testTimeout=60000 --hookTimeout=60000 --reporter=dot` PASS, 87 files / 844 tests, zero skips, 89.21s. This includes 55 actual PostgreSQL tests and 789 non-PostgreSQL tests, including all finance/sales/payment/reset regressions. Existing configured coverage gate PASS: statements/lines 97.78%, branches 85.05%, functions 99.21%; its include list targets existing demo/domain/repository modules, so these percentages are NOT claimed as full DealTwin-module coverage.
Final typecheck, lint and diff check PASS after the audit metadata change. No assertion, privilege or SQL timeout was relaxed.

Changed files serve only the Task16 contract: application commitment-service/audit-events and receipt detail contract; PostgreSQL commitment adapter and shared database-role validator; primitive/store metadata; verified proof decoder export; commitment normalization; runtime/strict parser/shared handler/two routes; application/route/PostgreSQL tests and fixture; snapshot regression; this evidence report.

## Independent review and single fix pass

Read-only GPT-6 Astra review of `f17da4c..38afcd6` found one Important approval-coverage issue, no Critical/Minor. Existing Approval DTOs bind rows to proof/version and kind but not individual requirement codes; treating one approved row as authorization for every required code was not sound.
Real PostgreSQL regression built a genuine two-code conditional proof with one approval. RESERVE and COMMIT after approving the sole row both returned 200 before the fix (two behavioral RED assertions). Task16 now fails closed with HTTP422 / `UNSUPPORTED_APPROVAL_BINDING` before mutation when more than one required approval code is present. It does not add schema or rewrite proofs/terms; canonical single-code Judge remains supported. Multi-code authorization needs an explicit future row-to-code binding contract, not another unchecked inference.
The reviewer accepted all three recorded architectural rulings. No re-review is claimed; the correction is verified through RED→GREEN and full regression in the single fix pass.

Reviewer exclusions: lifecycle/reservation replacement, repeated two-client race/CI, full ERP mutation-hook coverage/item pruning, stress/browser/provider/production evidence. They remain unavailable/unproven until their separately authorized phases; none is silently presented as complete.

Post-fix verification: focused Task16/API/snapshot command PASS 4 files / 40 tests (92.69s). Full `npm.cmd run test:coverage -- --testTimeout=60000 --hookTimeout=60000 --reporter=dot` PASS 87 files / 846 tests, zero skips, 174.61s: 57 actual PostgreSQL and 789 non-PostgreSQL tests. Coverage thresholds/percentages unchanged and PASS. Final typecheck, lint, diff check and build PASS. Build emitted existing plugin-timing and static route-classification notices; both API routes registered. This supersedes the pre-fix 844-test evidence for acceptance of the fix.

The review Important finding is closed by two observed RED→GREEN PostgreSQL regressions and the green full suite. No deferred minors. Only local disposable evidence is claimed; stop for human review before Task17–18 or integration/release.

## Changed-file inventory

```text
app/api/dealtwin/deals/[dealId]/commit/route.ts
app/api/dealtwin/deals/[dealId]/reserve/route.ts
docs/dealtwin/TASK16-VERIFICATION.md
lib/dealtwin/application/audit-events.ts
lib/dealtwin/application/commitment-service.ts
lib/dealtwin/application/operation-contracts.ts
lib/dealtwin/erp/build-snapshot.ts
lib/dealtwin/proof/replay-proof.ts
lib/server/dealtwin/commitment-route.ts
lib/server/dealtwin/request-contract.ts
lib/server/dealtwin/runtime.ts
lib/server/postgres/database-role.ts
lib/server/postgres/idempotency-audit-store.ts
lib/server/postgres/postgres-commitment-service.ts
lib/server/postgres/proof-invalidation.ts
tests/dealtwin/api/commitment-routes.test.ts
tests/dealtwin/application/commitment-service.test.ts
tests/dealtwin/erp/snapshot.test.ts
tests/dealtwin/postgres/commitment-fixture.ts
tests/dealtwin/postgres/commitment-transaction.test.ts
```

## Remaining boundaries

- No real Task 16 two-client capacity race or 20-race CI evidence is claimed; this belongs to Task 18. Release/expiration/cancellation are Task 17 and absent.
- CI Node22/PostgreSQL16, browser refresh/E2E and production readiness are not verified by this local service/route evidence.
- The ERP mapper still does not prune reduced document item/source arrays; see Task14–15 verification. Task 16 creates a new draft aggregate and does not shrink existing documents.
- No schema, migration, package, credential privilege, synchronized source or deployment configuration changes.
