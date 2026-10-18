# Task 14 gate and Task 15 durable Judge state

Session: 2026-10-05. Baseline: `e69b60caa8d4aa108cebc199b4ce49a42f64b3b7`.
Work is local in the isolated managed `dealtwin-judge-state` worktree. The original
`feat/dealtwin-proof-carrying-commerce` checkout stays clean at the baseline.
No push, merge, deployment, production connection, real financial data, or Task 16 work.

## Implemented scope

- Task 14: complete Judge receipt/delivery/invoice source-chain persistence, payment mapping,
  whole-state server validation, append-only evidence conflict rejection, and calendar-date
  mapping that preserves SQL DATE values in the local UTC+04 timezone.
- Proof invalidation emits ordered dependency keys as canonical JSON text (`changedKeysJson`),
  preserving the existing scalar-only ERP audit contract and immutable history through later saves.
- The browser validator still requires its original trusted opening-stock seed. Server validation
  does not require that unrelated browser seed; all other source/finance/cash/stock checks remain.
- The server mapper explicitly rejects nonempty unmapped legacy RFQ/call/adjustment/dispute/follow-up
  aggregates instead of silently discarding them. This checkpoint does not make those browser flows
  server-authoritative. The original browser repository selection is unchanged.
- Task 15: port-based Judge seed service, process-level app/reset runtime pools, signed expiring
  HttpOnly/SameSite=Strict/Secure sessions, bounded strict Zod reset input, and reset/state routes.
- Reset is admin-only and literal-tenant-only (`dealtwin-judge-v1`), under forced RLS and a verified
  distinct reset role without owner/superuser/BYPASSRLS or app membership. It preserves tenant,
  workspace, monotone revision and every audit receipt. Deletion/reseed/revision/receipt share
  one transaction and the workspace lock; the ERP mapper advances revision exactly once.
- Retries authenticate actor/role and read immutable receipts before revision checks. Old proof/version
  rows disappear; old successful receipts still replay their exact original response.
- State is read under the same tenant lock from PostgreSQL, not browser storage or a cached fixture.
  The business hash is recomputed from loaded business rows, excluding revision/audit history.
  `erpSnapshotHash` and ERP timeline evidence are explicitly separate from commitment evidence;
  no Reserve/Commit or aggregate commitment feasibility implementation is claimed.

## Actual environment

Windows; Node v24.19.0; npm 11.17.0; Vitest 3.2.4; PostgreSQL 15.4.
Disposable native cluster in a fresh temporary directory, binding only `127.0.0.1:55432`,
database `dealtwin_test`. No existing PostgreSQL service/database was changed.
Docker daemon was unavailable; installed PostgreSQL 18 lacked `postgres.bki`, so PostgreSQL 15
was used. The planned Docker PostgreSQL 16 / Node 22 CI environment was not verified.
Test-only owner and separate least-privilege login roles are provisioned by the existing harness.

## Verification actually executed

1. Baseline Task 14 PostgreSQL gate: 26/27 passed; the concurrent receipt test exceeded the runner's
   default 5-second timeout. Its isolated rerun with `--testTimeout=20000` passed all 3 tests.
   PostgreSQL statement/connection timeouts remain 5 seconds; no assertions were relaxed.
2. Behavioral RED: canonical Judge save failed on missing receipt FK; after mapping, the exact
   round-trip assertion caught SQL dates moving one day earlier. Both were repaired to the locked fixture.
3. Behavioral RED: attempted append-only audit rewrite was incorrectly reported as successful.
   The mapper now verifies immutable row equality and rejects the entire save atomically.
4. Behavioral RED: eight Task 15 assertions failed against minimal scaffolding; two registered route
   assertions subsequently failed before handler implementation. The implemented reset/session/request
   suites passed. The historical proof test initially had an invalid test fixture (missing approval snapshot);
   that fixture was repaired without changing the proof contract.
5. `npm.cmd test -- --testTimeout=20000 --reporter=dot`: 82 files / 814 tests passed, zero skips
   (124.35 seconds in the first full run). This includes all non-PostgreSQL tests and disposable DB tests.
6. After strengthening failure injection with a distinct rollback marker,
   `npm.cmd test -- tests/dealtwin/postgres/judge-reset.test.ts --testTimeout=20000`: 6/6 passed.
7. `npm.cmd run typecheck`: passed. `npm.cmd run lint`: passed without warnings in the final run.
8. `npm.cmd run build`: passed; both Judge API routes were registered. The existing vinext route-classification
   and plugin-timing notices are build-tool notices, not deployment/runtime verification.
9. `git diff --check`: passed. The dependency diff adds only pinned `zod@4.1.12`.
10. Independent `[GPT-6 Astra]` read-only review found one Important regression: a stale-proof audit
    stored an array in scalar-only ERP detail, blocking the next ERP save. A real PostgreSQL test
    reproduced the failure, with a guard proving that the command state minus that audit was valid.
    The first draft of the regression test also used an invalid AP source-chain mutation; it was
    corrected to execute the existing `upsertProduct` command, without changing any validator.
    `proof-invalidation-primitive.test.ts` then passed 4/4, proving invalidation → reload → command
    → save → reload while preserving the audit and immutable proof payload.
11. Final full run after the review fix: `npm.cmd test -- --testTimeout=20000 --reporter=dot`,
    **82 files / 815 tests passed, zero skips, 58.78 seconds**. This includes 36 PostgreSQL tests
    across schema, RLS, repositories, receipts, invalidation and Judge reset, plus 779 non-PostgreSQL
    tests. Final typecheck, lint (zero warnings), build and diff checks passed again.

API unit tests replace only persistence composition; session verification, request validation and
registered handlers are real. PostgreSQL tests exercise real least-privilege clients, FK-safe resets,
repeat reset, failure rollback, original-response replay, concurrent keys, foreign tenant/role denial,
new runtime/repository durability and removal of old authorization rows. No browser/E2E journey is claimed.

## Changed files

- `lib/demo/persistence.ts`
- `lib/server/postgres/erp-workspace-mapper.ts`
- `lib/server/postgres/pg-codec.ts`
- `lib/server/postgres/proof-invalidation.ts`
- `tests/dealtwin/postgres/repositories.test.ts`
- `tests/dealtwin/postgres/proof-invalidation-primitive.test.ts`
- `lib/dealtwin/application/judge-seed-service.ts`
- `lib/server/dealtwin/runtime.ts`
- `lib/server/auth/judge-session.ts`
- `lib/server/dealtwin/request-contract.ts`
- `app/api/dealtwin/judge/reset/route.ts`
- `app/api/dealtwin/judge/state/route.ts`
- `tests/dealtwin/postgres/judge-reset.test.ts`
- `tests/dealtwin/postgres/judge-financial-reset.test.ts`
- `tests/dealtwin/postgres/payment-lifecycle.test.ts`
- `tests/dealtwin/api/judge-routes.test.ts`
- `package.json`
- `package-lock.json`
- This verification report.

## Review / next boundary

Review range: `e69b60c..1f5c552`. Its single Important finding was fixed by RED/GREEN integration
evidence and the final full suite above, in one fix pass; no second review is claimed.
At `450b6b5`, review coverage did not prove reset after active commitments, linked committed Sales Orders,
cash original/reversal aggregates, parent/child stress runs, or nonempty payment mapping. The financial
follow-up below closes the payment/reversal/active committed aggregate/linked order cases; parent/child
stress-run reset coverage and the complete Reserve/Commit service remain unproven and out of scope.
The existing generic repository reader lacks the Judge runtime's serialization lock; this checkpoint
proves coherent public Judge state reads, not generic multi-query snapshot isolation outside that path.
No public session issuance route is introduced: a trusted server operator must provision a session using
the signing helper and a private signing key (minimum 32 bytes). No key or credential is checked in.
Runtime composition fails closed unless app/reset URLs target the same local disposable database/port
with distinct users; remote/public hosting requires separate authorization and the later release gate.
Do not begin Task 16 until this checkpoint is reviewed and explicitly approved.

## Financial review follow-up from 450b6b5232f22e3da1ca35b9dc26ed140c8467d1

Scope: tests and this report only. No application/schema/dependency changes were needed: all new
financial behavior tests passed on the existing implementation. No failing behavior was hidden or
made to pass by relaxing assertions. The original checkout remains separate and unchanged.

`payment-lifecycle.test.ts` uses the real `recordPayment` and `cancelPayment` commands, saves each
command's proposed revision unchanged through the app-role `PostgresErpRepository`, and reloads
through a new repository instance after each operation. The hand-checked outcomes are:

| Case | Partial payment | Outstanding after payment | Confirmed cash after payment | Outstanding after cancellation |
|---|---:|---:|---:|---:|
| AP Rp18m | Rp6m | Rp12m | Rp24m | Rp18m |
| AR Rp20m | Rp7m | Rp13m | Rp37m | Rp20m |

Both cases verify partially-paid/posted → unpaid/cancelled, revisions 1 → 2 → 3 (no second increment),
exact payment date, one immutable original and exactly one matching opposite-direction reversal,
account/amount/source identity and revision, conservative orders, and restored Rp30m confirmed cash.
The original cash row is compared in full both through the mapper and directly through SQL before
and after cancellation. Repeated cancellation is rejected; stale save is rejected without revision
or row changes. Each payment has exactly one recorded and one cancelled operational audit.

`judge-financial-reset.test.ts` constructs two real payments (AP Rp3m and AR Rp5m), cancels the AP
payment, then uses `createSalesOrder` and existing transaction-scoped repository methods to construct
a synthetic historical graph: actual snapshot/compiler/proof, approved authorization, an **active
committed** liquidity row, and its linked draft Sales Order. The ERP command's proposed revision is
adopted once, with the graph and immutable historical receipt in one app-role transaction.
This is a test fixture for existing repository/reset contracts, NOT an implementation or verification
of Task 16 Reserve/Commit application services, lifecycle gates, collision decisions or endpoints.

The success case resets revision 5 → 6, restores the canonical seed/hash, removes payment/cash
business evidence plus the historical commitment/proof/version/linked order graph, and retains every
historical audit row byte-for-byte as JSON evidence. Old reset receipts and the committed fixture
receipt remain readable as their exact original response; reset retry does not advance revision.
Two failure-injection cases raise during payment deletion (after earlier graph/cash deletion) and
at the final reset receipt insert (after reseeding/revision). Each compares the complete public state
and raw rows from 18 participating tables, including revision and audit history, before/after failure.
There is no partial deletion or failed-operation success receipt; retry with the same key succeeds.

Actual focused commands/results:

- `npm.cmd test -- tests/dealtwin/postgres/payment-lifecycle.test.ts --testTimeout=20000 --reporter=dot`: 2/2 passed.
- `npm.cmd test -- tests/dealtwin/postgres/judge-financial-reset.test.ts --testTimeout=20000 --reporter=dot`: 3/3 passed.
- `npm.cmd test -- tests/dealtwin/postgres tests/dealtwin/api/judge-routes.test.ts tests/erp-repository-mappers.test.ts --testTimeout=20000 --reporter=dot`: 11 files / 72 tests passed (133.58 seconds).
- `npm.cmd test -- --testTimeout=20000 --reporter=dot`: **84 files / 820 tests passed, zero skips (123.18 seconds)**,
  including 41 disposable PostgreSQL tests and 779 non-PostgreSQL tests.
- `npm.cmd run typecheck`: passed. `npm.cmd run lint`: passed, zero warnings.
- `npm.cmd run build`: passed, both Judge routes registered; existing plugin-timing/route-classification notices remain.
- `git diff --check`: passed. No migrations, privilege changes, package changes, application fixes, production connections,
  push, merge, deploy or Task 16 implementation were performed. Environment: Node 24.19.0 / PostgreSQL 15.4,
  exclusively local `127.0.0.1:55432/dealtwin_test`; Node 22/PostgreSQL 16 CI and browser E2E were not run.
- New test-code commit: `d4fbaad6a12bda09bd4e90ab4403507ac5f58c3b`. Its two new suites were rerun together
  after commit: 2 files / 5 tests passed (12.83 seconds), with the original checkout still clean at `e69b60c`.
- Independent `[GPT-6 Astra]` read-only review of `450b6b5..d4fbaad` found no Critical, Important or Minor
  issues and judged the requested local financial review-gap closure supported. It inspected commands,
  mapper/revision/reset/rollback paths and assertions; it did not rerun PostgreSQL tests. The reviewer
  expressly excluded Task 16 service authorization/collision/races, parent/child stress-run reset,
  general item reduction/removal, generic repository snapshot isolation, public deployment and browser
  lifecycle. These remain unproven, not silently approved. The worktree is retained for human review.

### Mapper boundary: reducing document items is unsupported

The mapper upserts positional child rows by `(tenant_id, document_id, line_number/source_number)`.
It does **not** delete/reconcile omitted stored positions when a proposed document has fewer lines or
invoice sources, nor does it implement general aggregate removal. This affects Sales Order/PO lines,
goods-receipt/delivery lines and invoice lines/sources. Consequently, a shorter proposed array can
leave previous child rows in PostgreSQL: `saveAtomic` must NOT be described as lossless full-document
replacement for that operation. This boundary is established by mapper SQL inspection, not by a
passing test that treats leftover rows as desirable behavior.

Payment recording/cancellation updates existing invoice status and appends cash evidence; it does
not shrink document items. Judge reset is a separate fixed-tenant, privileged, transactional delete
and reseed path. This follow-up does not add pruning, a reduction endpoint, a fail-closed reduction
guard, table DELETE privileges for the app role, or weaken complete-state validation. An authoritative
item-reduction flow requires explicit reject/reconciliation behavior and its own PostgreSQL evidence
before being claimed supported. Browser repository behavior remains unchanged.
