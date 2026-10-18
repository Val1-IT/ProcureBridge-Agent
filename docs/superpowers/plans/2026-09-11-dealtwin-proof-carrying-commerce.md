# DealTwin Proof-Carrying Commerce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a competition-grade DealTwin vertical slice that proves, reserves, commits, invalidates, recompiles, and replays commercial promises against one server-authoritative ERP/cash state.

**Architecture:** DealTwin is an extraction-ready subsystem inside ProcureBridge. Pure bigint/fixed-point domain modules sit behind application ports; a pooled node-postgres adapter owns durable Judge state and short tenant-serialized transactions; Next route handlers and workflow-first UI call application services. Existing browser-backed ProcureBridge behavior remains intact.

**Tech Stack:** Node.js 22, TypeScript 5.9, Next.js 15/React 19, Vitest, PostgreSQL, `pg`, Supabase-compatible SQL migrations, Zod for boundary schemas, Playwright for the final Judge journey, Nebius/Nemotron behind a provider port, and application-level MCP tools for Alexa+.

**Spec:** `docs/dealtwin/LOCKED_PRODUCT_SPEC.md`

## Global constraints

- Preserve baseline ancestry `1b3f75905f39c75cc6c7e06b23a3f553e6b136fe` and start implementation from the approved correction commit after `f7105b293599eacc9f2768a6c699bf5cd361c857` on `feat/dealtwin-proof-carrying-commerce`; do not push or deploy without separate approval.
- Do not connect tests to production or unrelated Supabase projects. PostgreSQL integration commands below use the disposable `dealtwin_test` container only.
- No DealTwin authoritative monetary arithmetic uses JavaScript `number`; quantities, rates, dates/order and search counters remain validated integers as specified. Rupiah is bigint internally, decimal string in JSON/SQL adapters, and PostgreSQL `bigint` at rest. Rates are validated integer basis points.
- Same-day ordering is deterministic; unknown decision-relevant ordering uses the locked conservative policy or returns an unresolved-assumption result.
- No UI, AI provider, or browser state may commit liquidity. All commitment-critical operations use one server transaction and the locked tenant workspace row.
- No LLM/provider/network call occurs inside a database transaction.
- Keep each module focused. Domain code imports neither Next.js, React, `pg`, Supabase SDK, nor provider SDKs.
- Existing `/collections`, CALL-E recovery, and browser-only ProcureBridge flows are not DealTwin domain dependencies.
- At every checkpoint: stop disposable services, inspect `git status --short`, run `git diff --check`, and report exact pass/fail/skip evidence.
- A database or browser suite that did not run is reported as skipped, never passed.

## Phase 0 — Permanent foundation (completed in this planning change)

Evidence recorded on 2026-09-11:

- permanent repository: `C:\Users\Valen\Documents\ChatGPT\DealTwin`;
- remote: `https://github.com/Val1-IT/ProcureBridge-Agent.git`;
- branch: `feat/dealtwin-proof-carrying-commerce`;
- baseline: `1b3f75905f39c75cc6c7e06b23a3f553e6b136fe`;
- clean branch before documentation;
- `npm.cmd test -- --reporter=dot`: 56 files, 530 tests passed;
- `npm.cmd run typecheck`: passed;
- `npm.cmd ci`: completed and reported 26 advisories (7 moderate, 16 high, 3 critical).

No product functionality was changed in Phase 0. The September 12 correction retains 29 tasks and 42 requirements; implementation remains subject to approval.

Canonical authority: specification sections 5.4 (DealTermsV1), 6.5–6.8 (approval, self-reservation, replay), 7 (cash reversals), 9 (RLS and revision), and 10 (fixed Judge fixture) govern every task below.

---


## Shared interface ownership and dependency rules

Signatures below describe exported call contracts (not implementation bodies). Each task creates its named input/result types in its listed module before using them; no task imports an uncreated later module. DTOs use canonical decimal-string rupiah and validated safe-integer revisions to preserve the existing `ErpRepository` contract. SQL revision strings outside that safe range fail closed, including overflow on increment.

- Task 1 `lib/dealtwin/domain/result.ts` owns `Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }`. Task 3 narrows codes through `DealTwinReasonCode`; early tasks do not import that future module. `CanonicalJsonValue` in `canonical-json.ts` is the recursive union of null, boolean, string, finite safe-integer number, readonly arrays and string-keyed objects of those values. Raw bigint is encoded by money/terms DTO mappers before calling canonical JSON/hash helpers.
- Task 2 `deal-terms.ts` owns the exact spec 5.4 contract and its recursively money-to-string `DealTermsV1Dto`; provenance/order types are defined here, reused by Task 3. `commitment.ts` owns `SelfReservationIdentity = { proofId: string; dealVersionId: string; canonicalEventHash: string }`. Task 2 proof/commitment shells use immutable canonical JSON payloads plus identity/status, not imports from the future compiler/adapter. Tasks 6/10 decode those payloads through typed adapters and validation.
- Task 4 cash input types live in `lib/erp/types.ts`, use decimal-string money in `ErpState`, and preserve existing `ErpCommandResult<T>` from `lib/erp/errors.ts`. `CashMovementInput` supplies accountId, effectiveDate, sameDayOrder, direction, amountRupiah, sourceType/sourceId/sourceRevision, actorId and reason. `CashReversalInput` supplies originalMovementId, effectiveDate, sameDayOrder, actorId and reason; amount/account/opposite direction are derived from the original, never trusted from caller overrides. Raw SQL constraint tests independently reject corrupt reversal inserts.
- Task 5 `adapter-types.ts` owns normalized obligations/receipts and cash evidence. Task 6 `build-snapshot.ts` owns `SnapshotInput` (ERP state, tenantId, asOfDate, requested horizon, adapter version, commitments and nullable self identity); `dependency-manifest.ts` owns `DependencyChange` (tenantId, prior/current safe revisions, changed record/query keys with before/after nullable hashes, optional exact self identity and its capacity-only keys).
- Task 7 owns `FinancialTimeline` and `LiquidityPoint`; Task 8 owns `CompileInput`, `CompileResult` and `ConstraintEvaluation`. Task 9 owns `JudgeScenario` (canonical ERP state, initial A/B terms, constraints/policy, expected facts). Task 10 `build-proof.ts` owns `ProofBuildInput` (version, snapshot, base result, recorded stress input/result payloads, assumptions/approvals, explicit IDs/time/versions). It records canonical stress evidence without importing the Task 20 transform runner. Replay defaults to the compatible deterministic compiler; injection is for behavior testing, not a caller-selected authoritative engine.
- Task 11 `operation-contracts.ts` owns the following transport-neutral contracts; later input contracts extend these IDs, not tenant/role supplied by clients:

```ts
interface ActorContext {
  tenantId: string;
  actorId: string;
  role: "admin" | "procurement" | "warehouse" | "sales" | "finance" | "approver";
}
interface MutationContext extends ActorContext {
  expectedRevision: number;
  idempotencyKey: string;
  now: string; // injected trusted ISO timestamp, never read in the compiler
}
interface ProofCommandInput extends SelfReservationIdentity {}
interface CommitmentCommandInput extends SelfReservationIdentity { commitmentId: string; }
interface ApprovalDecisionInput {
  approvalId: string; proofId: string; dealVersionId: string;
  decision: "approved" | "rejected"; comment: string;
}
interface OperationResponse {
  httpStatus: number;
  body: CanonicalJsonValue; // discriminated success/error DTO, exact money strings
}
interface OperationReceipt {
  tenantId: string; actorId: string; action: string;
  idempotencyKey: string; requestHash: string;
  responseJson: string; responseHash: string;
  priorRevision: number; currentRevision: number; createdAt: string;
}
```

- Task 11 `ports.ts` owns `ApplicationPorts` and transaction-scoped proof/approval/receipt interfaces. The application requests a unit of work with `transact(context, action, input, work)`; it cannot access a `PoolClient`. Task 14 completes `TransactionScopedRepositories` with tenant-bound ERP save and `invalidate(change, self): Promise<readonly string[]>`, backed by that same checked-out client. Task 19 consumes this port, not PostgreSQL types. Application services may use constructor-injected ports while their public method signatures omit that bound dependency.
- Receipt request hashes cover the operation action, target IDs, expectedRevision and canonical input; exclude the idempotency key, generated time and generated IDs. Lookup also authenticates the current actor/role before replay. Only successful mutations get unique success receipts. Failed/blocked attempts cannot occupy that success key; recorded conflict/stale evidence uses a non-success event. Replaying a successful request returns exactly the stored HTTP status/body despite a newer revision or lifecycle. `responseJson` encodes the entire `OperationResponse`; it is a scalar string in the legacy audit detail. Reset retains these audit rows and no receipt has a foreign key to deletable proof/order rows.
- Task 13 harness owns `PostgresHarness` and `TenantAccessEvidence` with explicit role/tenant/action/allowed outcomes. Task 15 runtime owns the serializable `JudgeStateDto` including revision, deals, proof/current status, approvals, commitments and cash/timeline evidence. Task 18 owns `ReservationRequest = { context: MutationContext; input: ProofCommandInput }`.
- Task 20 owns stress scenarios/results; Task 21 owns amendment policy/result including required stress scenarios and the spec 6.7 ranking tuple. Task 22 `constraint-service.ts` owns `ConstraintConfirmationInput = { dealId: string; dealVersionId: string; constraintIds: readonly string[] }`; `judge-obligation-service.ts` owns `JudgeObligationInput = { invoiceId: "judge-existing-ap"; amountRupiah: "19000000" }`. Confirmation covers all material candidate constraints; unsupported IDs or partial material confirmation fail closed. Route DTOs add expectedRevision/idempotencyKey and never accept actor/tenant/role.
- Task 23 UI DTOs decode server responses; Task 24 owns `JudgeStep` as integers 1 through 12. Task 25 owns extraction input/result in its port module; Task 26 owns discriminated allowlisted tool requests/results and conversation state in the listed MCP modules. Task 27 owns evaluation scenario/oracle/report types in its listed evaluation modules. Task 28 `release-gate.ts` owns `ReleaseEvidence` (candidate SHA plus named checks with pass/fail/skipped, tested SHA and artifact reference), `ReleaseGateResult` (ready plus blocking reasons) and `TraceabilityRequirement` (DT ID plus required check IDs); Task 29 only extends the existing gate to require evidence for all 42 IDs.

## Phase 1 — Exact domain contracts

### Task 1: Exact money, rates, canonical dates, and serialization

**Files:**
- Modify: `tsconfig.json` (raise target ES2017 to ES2020 for bigint literals)
- Create: `lib/dealtwin/domain/result.ts`
- Create: `lib/dealtwin/domain/money.ts`
- Create: `lib/dealtwin/domain/rate.ts`
- Create: `lib/dealtwin/domain/date.ts`
- Create: `lib/dealtwin/domain/canonical-json.ts`
- Test: `tests/dealtwin/domain/money.test.ts`
- Test: `tests/dealtwin/domain/canonical-json.test.ts`

**Consumes:** base-10 strings at API/SQL boundaries and ISO date strings.
**Produces:** `Result<T>`, `CanonicalJsonValue`, `Rupiah`, `BasisPoints`, `IsoDate`, `rupiah`, `parseRupiah`, `formatRupiahDto`, `applyRateFloor`, `applyRateCeil`, `compareIsoDate`, `addCalendarDays`, `canonicalStringify`, and `sha256Canonical`.

**Interface signature contract:**

```ts
parseRupiah(value: string): Rupiah; applyRateFloor(amount: Rupiah, rate: BasisPoints): Rupiah; applyRateCeil(amount: Rupiah, rate: BasisPoints): Rupiah; addCalendarDays(date: IsoDate, days: number): IsoDate; canonicalStringify(value: CanonicalJsonValue): string; sha256Canonical(value: CanonicalJsonValue): string;
```

**Behavioral RED/GREEN:** reject noncanonical numeric input and preserve 9007199254740993n exactly. Run `npm.cmd test -- tests/dealtwin/domain/money.test.ts tests/dealtwin/domain/canonical-json.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Database suites use the Task 13 disposable harness once introduced; Task 12 uses its injected client fake, and no earlier task depends on that harness. Required integration suites must fail when required database configuration is missing. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing tests for negative balances, non-negative amounts, canonical integer parsing, values above `Number.MAX_SAFE_INTEGER`, 40%=4,000 bps, inflow floor/outflow ceiling, leap dates, key-order-independent JSON, money DTO bigint-to-string encoding, raw-bigint canonical JSON rejection, and rejection of floats/exponents/formatted input.
- [ ] Run `npm.cmd test -- tests/dealtwin/domain/money.test.ts tests/dealtwin/domain/canonical-json.test.ts` and establish the behavioral RED specified above after resolving import scaffolding.
- [ ] Implement branded constructors with runtime validation. Implement multiplication as bigint numerator divided by `10_000n`; do not convert through `number`. Canonical JSON recursively sorts object keys, preserves array order and rejects `undefined`, raw bigint and non-finite/unsafe numbers; callers first encode branded money as the contract's decimal-string DTO fields.
- [ ] Re-run the focused tests, then `npm.cmd run typecheck`.
- [ ] Commit with `git add "tsconfig.json" "lib/dealtwin/domain/result.ts" "lib/dealtwin/domain/money.ts" "lib/dealtwin/domain/rate.ts" "lib/dealtwin/domain/date.ts" "lib/dealtwin/domain/canonical-json.ts" "tests/dealtwin/domain/money.test.ts" "tests/dealtwin/domain/canonical-json.test.ts" && git commit -m "feat: add exact DealTwin value contracts"`.

### Task 2: Deal, version, proof, approval, and commitment state machines

**Files:**
- Create: `lib/dealtwin/domain/deal.ts`
- Create: `lib/dealtwin/domain/deal-terms.ts`
- Create: `lib/dealtwin/erp/legacy-sales-order-bridge.ts`
- Test: `tests/dealtwin/domain/deal-terms.test.ts`
- Create: `lib/dealtwin/domain/proof.ts`
- Create: `lib/dealtwin/domain/commitment.ts`
- Create: `lib/dealtwin/domain/state-machine.ts`
- Test: `tests/dealtwin/domain/deal-lifecycle.test.ts`

**Consumes:** exact primitives from Task 1.
**Produces:** `DealTermsV1`, `DealTermsV1Dto`, `OrderingSource`, `SourceProvenance`, `SelfReservationIdentity`, `Deal`, `DealVersion`, `DealStatus`, `DealProof`, `ProofStatus`, `Approval`, `LiquidityCommitment`, transition functions, and stable transition reason codes.

**Interface signature contract:**

```ts
canonicalizeDealTermsV1(terms: DealTermsV1): DealTermsV1Dto; toLegacySalesOrderInput(terms: DealTermsV1): Result<SalesOrderInput>; transitionDeal(deal: Deal, next: DealStatus): Result<Deal>;
```

**Behavioral RED/GREEN:** reject unsafe legacy prices/line totals, retain immutable terms, and block illegal transitions. Run `npm.cmd test -- tests/dealtwin/domain/deal-terms.test.ts tests/dealtwin/domain/deal-lifecycle.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write a table-driven failing test covering every legal/illegal transition, immutable version increments, distinct Deal/Sales Order identity, denial of a second COMMIT once a Deal has an order link, proof status (`VALID`, `CONDITIONALLY_VALID`, `STALE`, `INVALID`), and commitment status (`reserved`, `committed`, `released`, `expired`, `cancelled`).
- [ ] Run `npm.cmd test -- tests/dealtwin/domain/deal-lifecycle.test.ts` and establish the behavioral RED specified above.
- [ ] Implement closed discriminated unions and pure transition functions. Implement the exact DealTermsV1 in spec section 5.4, its decimal-string DTO and stable-ID canonicalization. Validate quantity/price/dates/roles and exact deposit-plus-balance conservation. Test Number.MAX_SAFE_INTEGER and its successor in the isolated legacy bridge; reject unsafe line products/totals too before calling createSalesOrder. Permit ERP Sales Order ID only on successful COMMIT; prevent reserve without a current proof and commit with unresolved blocking approval.
- [ ] Re-run the test and typecheck.
- [ ] Commit with `git add "lib/dealtwin/domain/deal.ts" "lib/dealtwin/domain/deal-terms.ts" "lib/dealtwin/erp/legacy-sales-order-bridge.ts" "tests/dealtwin/domain/deal-terms.test.ts" "lib/dealtwin/domain/proof.ts" "lib/dealtwin/domain/commitment.ts" "lib/dealtwin/domain/state-machine.ts" "tests/dealtwin/domain/deal-lifecycle.test.ts" && git commit -m "feat: define DealTwin lifecycle contracts"`.

### Task 3: Constraints, cash events, policies, and reason codes

**Files:**
- Create: `lib/dealtwin/domain/constraint.ts`
- Create: `lib/dealtwin/domain/cash-event.ts`
- Create: `lib/dealtwin/domain/policy.ts`
- Create: `lib/dealtwin/domain/reason-code.ts`
- Test: `tests/dealtwin/domain/constraints.test.ts`
- Test: `tests/dealtwin/domain/cash-event-order.test.ts`

**Consumes:** Tasks 1–2.
**Produces:** `CommercialConstraint`, `ConstraintSet`, `DatedCashEvent`, `CashEventCertainty`, reused Task 2 `OrderingSource`, `CompilerPolicy`, `DealTwinReasonCode`, `sortCashEvents`, and `validateCashEventOrdering`.

**Interface signature contract:**

```ts
validateConstraints(constraints: readonly CommercialConstraint[]): Result<ConstraintSet>; sortCashEvents(events: readonly DatedCashEvent[]): readonly DatedCashEvent[]; validateCashEventOrdering(events: readonly DatedCashEvent[]): Result<readonly DatedCashEvent[]>;
```

**Behavioral RED/GREEN:** place unknown-order outflows before inflows or return unresolved. Run `npm.cmd test -- tests/dealtwin/domain/constraints.test.ts tests/dealtwin/domain/cash-event-order.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing tests for every locked MVP constraint kind, duplicate/conflicting constraints, provenance and confirmation, deterministic `(date,sameDayOrder,eventId)` sorting, conservative order 0/100/200/300/400/500, stable permutation results, and `UNRESOLVED_SAME_DAY_ORDER`.
- [ ] Run `npm.cmd test -- tests/dealtwin/domain/constraints.test.ts tests/dealtwin/domain/cash-event-order.test.ts` and verify failure.
- [ ] Implement exhaustive schemas and reason codes. Unknown material ordering must be conservative with recorded provenance or unresolved; never default to favorable inflow-first ordering.
- [ ] Run focused tests and typecheck.
- [ ] Commit with `git add "lib/dealtwin/domain/constraint.ts" "lib/dealtwin/domain/cash-event.ts" "lib/dealtwin/domain/policy.ts" "lib/dealtwin/domain/reason-code.ts" "tests/dealtwin/domain/constraints.test.ts" "tests/dealtwin/domain/cash-event-order.test.ts" && git commit -m "feat: add constraints and cash event contracts"`.

## Phase 2 — Authoritative ERP normalization

### Task 4: Minimal ERP-native cash domain

**Files:**
- Modify: `lib/erp/types.ts`
- Modify: `lib/erp/seed.ts`
- Modify: `lib/demo/persistence.ts`
- Modify: `lib/demo/seed.ts`
- Modify: `lib/domain/types.ts`
- Modify: `lib/demo/persistence-coordinator.ts`
- Modify: `components/demo-store-provider.tsx`
- Modify: `tests/demo-provider-lifecycle.test.ts`
- Modify: `tests/demo-store-coordinator.test.ts`
- Modify: `tests/supplier-call-persistence.test.ts`
- Modify: `tests/judge-session-envelope.test.ts`
- Modify: `tests/persistence.test.ts`
- Create: `lib/erp/commands/cash.ts`
- Create: `lib/erp/selectors-cash.ts`
- Modify: `lib/erp/commands/finance.ts`
- Test: `tests/dealtwin/erp/cash-foundation.test.ts`
- Modify: `tests/erp-persistence.test.ts`

**Consumes:** existing ERP command/audit pattern and posted `Payment`.
**Produces:** `ErpCashAccount`, `ErpCashMovement`, `setOpeningCashBalance`, `postCashMovement`, `reverseCashMovement`, `selectCurrentCashBalance`, and finance-command cash provenance.

**Interface signature contract:**

```ts
postCashMovement(state: ErpState, role: ErpRole, input: CashMovementInput, now: string): ErpCommandResult<ErpCashMovement>; reverseCashMovement(state: ErpState, role: ErpRole, input: CashReversalInput, now: string): ErpCommandResult<ErpCashMovement>; selectCurrentCashBalance(state: ErpState, accountId: string, through: IsoDate): Result<Rupiah>;
```

**Behavioral RED/GREEN:** preserve original after reversal and include opening-day entries; retain valid v10 state in v11. Run `npm.cmd test -- tests/demo-provider-lifecycle.test.ts tests/demo-store-coordinator.test.ts tests/supplier-call-persistence.test.ts tests/judge-session-envelope.test.ts tests/persistence.test.ts tests/dealtwin/erp/cash-foundation.test.ts tests/erp-persistence.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing tests proving one active IDR account, exact opening/current balance, append-only movement evidence, positive amount plus direction, source uniqueness, compensating reversal with unchanged original, duplicate reversal rejection, reversal-of-reversal rejection, wrong account/amount/direction rejection, opening-date movement after order-zero anchor, invalid-date rejection, and one cash movement for one posted payment.
- [ ] Add regression tests proving failed/duplicate payment commands create no movement and legacy states without cash migrate deterministically only through an explicit schema-version migration.
- [ ] Run `npm.cmd test -- tests/dealtwin/erp/cash-foundation.test.ts tests/erp-finance.test.ts tests/erp-persistence.test.ts` and verify failure.
- [ ] Add cash DTO arrays to `ErpState` and browser persistence. Domain cash arithmetic parses their decimal strings into Rupiah; storage never serializes raw bigint. Set DEMO_SCHEMA_VERSION=11, current key `arvanta-distributor-mini-erp-demo-v11`, previous key v10, retain v9 fallback. Validate the v10 payload under v10 rules then add `cashAccounts: []` and `cashMovements: []`, preserving revision, session identity, all legacy records and envelope generation/commit identity. Preserve the original v10 key until successful v11 persistence. Invalid v11 never falls back silently. A migrated workspace has CASH_NOT_CONFIGURED, never invented zero/seed cash; legacy payment commands may continue without a configured account, while Judge commands require one. Once configured, cash opening is an as-of anchor and historical payments must not be replayed into it. Payment cancellation after opening adds one immutable reversal and reopens the invoice balance atomically. Cash reversal alone cannot cancel a linked ERP payment. Update provider/coordinator/envelope migration paths and version assertions. Existing numeric payment amounts must be validated safe integers and converted directly to bigint-string cash DTOs before exact calculation.
- [ ] Run the focused tests and `npm.cmd run typecheck`.
- [ ] Commit with `git add "lib/erp/types.ts" "lib/erp/seed.ts" "lib/demo/persistence.ts" "lib/demo/seed.ts" "lib/domain/types.ts" "lib/demo/persistence-coordinator.ts" "components/demo-store-provider.tsx" "tests/demo-provider-lifecycle.test.ts" "tests/demo-store-coordinator.test.ts" "tests/supplier-call-persistence.test.ts" "tests/judge-session-envelope.test.ts" "tests/persistence.test.ts" "lib/erp/commands/cash.ts" "lib/erp/selectors-cash.ts" "lib/erp/commands/finance.ts" "tests/dealtwin/erp/cash-foundation.test.ts" "tests/erp-persistence.test.ts" && git commit -m "feat: add authoritative ERP cash foundation"`.

### Task 5: AP, AR, payment, and cash normalization without double count

**Files:**
- Create: `lib/dealtwin/erp/adapter-types.ts`
- Create: `lib/dealtwin/erp/normalize-payables.ts`
- Create: `lib/dealtwin/erp/normalize-receivables.ts`
- Create: `lib/dealtwin/erp/normalize-cash.ts`
- Test: `tests/dealtwin/erp/financial-normalization.test.ts`

**Consumes:** ERP invoices, PO/receipt lineage, Sales Order/delivery lineage, posted/cancelled payments, supplier terms, cash account/movements.
**Produces:** `NormalizedObligation`, `NormalizedReceipt`, `CashPositionEvidence`, and source dependency keys/hashes.

**Interface signature contract:**

```ts
normalizePayables(state: ErpState): Result<readonly NormalizedObligation[]>; normalizeReceivables(state: ErpState): Result<readonly NormalizedReceipt[]>; normalizeCash(state: ErpState, asOfDate: IsoDate): Result<CashPositionEvidence>;
```

**Behavioral RED/GREEN:** count one economic obligation and one realized cash movement per source chain. Run `npm.cmd test -- tests/dealtwin/erp/financial-normalization.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write a failing matrix for PO only, receipt, supplier invoice, partial/full/cancelled payable payment, customer invoice, partial/full/cancelled receivable payment, and duplicated source IDs. Assert one economic event per remaining amount and exact provenance chain.
- [ ] Run `npm.cmd test -- tests/dealtwin/erp/financial-normalization.test.ts` and verify failure.
- [ ] Implement authority precedence: invoice outstanding amount when present; otherwise a decision-relevant confirmed PO obligation; posted payments become confirmed cash movements and reduce invoice outstanding once. Exclude cancelled/paid zero balances. Never infer confirmed receipt from quote/order/invoice.
- [ ] Re-run tests and typecheck.
- [ ] Commit with `git add "lib/dealtwin/erp/adapter-types.ts" "lib/dealtwin/erp/normalize-payables.ts" "lib/dealtwin/erp/normalize-receivables.ts" "lib/dealtwin/erp/normalize-cash.ts" "tests/dealtwin/erp/financial-normalization.test.ts" && git commit -m "feat: normalize ERP financial evidence"`.

### Task 6: Inventory/reservation normalization and canonical ERP snapshot

**Files:**
- Create: `lib/dealtwin/erp/normalize-inventory.ts`
- Create: `lib/dealtwin/erp/build-snapshot.ts`
- Create: `lib/dealtwin/erp/dependency-manifest.ts`
- Test: `tests/dealtwin/erp/inventory-normalization.test.ts`
- Test: `tests/dealtwin/erp/snapshot.test.ts`

**Consumes:** Task 5 outputs, existing stock selectors, active Sales Order reservations, supplier/customer terms, active DealTwin commitments supplied through a port.
**Produces:** `CanonicalErpSnapshot`, `SnapshotInput`, `DependencyChange`, `DependencyManifest`, `DependencyKey`, `SnapshotHash`, and `ErpStateAdapter`.

**Interface signature contract:**

```ts
buildSnapshot(input: SnapshotInput): Result<CanonicalErpSnapshot>; normalizeExternalCommitments(rows: readonly LiquidityCommitment[], self: SelfReservationIdentity | null): Result<readonly DatedCashEvent[]>;
```

**Behavioral RED/GREEN:** exclude only exact self identity and detect new query-set dependencies. Run `npm.cmd test -- tests/dealtwin/erp/inventory-normalization.test.ts tests/dealtwin/erp/snapshot.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing tests for physical versus reserved stock, warehouse-scoped keys, on-hand cost not becoming cash, active/cancelled commitments, deterministic hashes under source reordering, hash change on material value change, and no hash change from irrelevant presentation fields.
- [ ] Run `npm.cmd test -- tests/dealtwin/erp/inventory-normalization.test.ts tests/dealtwin/erp/snapshot.test.ts` and verify failure.
- [ ] Implement canonical sorting and per-dependency content hashes. Include query/range dependency keys for open AP, open AR, cash, stock, and active commitments so newly inserted obligations are detected even though their IDs were absent from the old snapshot. Preserve canonical event order and economic identity when a commitment replaces a candidate. Add normalizeExternalCommitments with exact SelfReservationIdentity matching; a mismatched hash must fail closed. Represent all relevant future AP/AR/commitments and full ERP row dependencies. Include ERP revision for optimistic checks but use dependency intersections—not any revision change alone—for staleness.
- [ ] Run focused tests and typecheck.
- [ ] Commit with `git add "lib/dealtwin/erp/normalize-inventory.ts" "lib/dealtwin/erp/build-snapshot.ts" "lib/dealtwin/erp/dependency-manifest.ts" "tests/dealtwin/erp/inventory-normalization.test.ts" "tests/dealtwin/erp/snapshot.test.ts" && git commit -m "feat: build canonical DealTwin ERP snapshots"`.

## Phase 3 — Pure deterministic compiler

### Task 7: Exact financial timeline engine

**Files:**
- Create: `lib/dealtwin/compiler/timeline.ts`
- Create: `lib/dealtwin/compiler/balance-walk.ts`
- Test: `tests/dealtwin/compiler/timeline.test.ts`

**Consumes:** `CanonicalErpSnapshot`, candidate Deal terms, ordered cash events, compiler policy.
**Produces:** `FinancialTimeline`, `LiquidityPoint`, `minimumConfirmedBalance`, `minimumProjectedBalance`, and first violation evidence.

**Interface signature contract:**

```ts
buildTimeline(snapshot: CanonicalErpSnapshot, terms: DealTermsV1, policy: CompilerPolicy): Result<FinancialTimeline>; walkBalances(timeline: FinancialTimeline): readonly LiquidityPoint[];
```

**Behavioral RED/GREEN:** return exact intermediate balances rather than only final/month totals. Run `npm.cmd test -- tests/dealtwin/compiler/timeline.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing tests for the opening anchor, exact signed accumulation, confirmed/projected tracks, outflow-before-inflow conservative behavior, stable tie-breaks, negative balances, and values above safe-number range.
- [ ] Run `npm.cmd test -- tests/dealtwin/compiler/timeline.test.ts` and verify failure.
- [ ] Implement a pure single-pass balance walk over canonically sorted events. Store every before/after balance as `Rupiah`; never aggregate in SQL floating types or JavaScript number.
- [ ] Run focused tests and typecheck.
- [ ] Commit with `git add "lib/dealtwin/compiler/timeline.ts" "lib/dealtwin/compiler/balance-walk.ts" "tests/dealtwin/compiler/timeline.test.ts" && git commit -m "feat: add exact DealTwin timeline engine"`.

### Task 8: Constraints, horizon, and compile result

**Files:**
- Create: `lib/dealtwin/compiler/horizon.ts`
- Create: `lib/dealtwin/compiler/evaluate-constraints.ts`
- Create: `lib/dealtwin/compiler/compile-deal.ts`
- Test: `tests/dealtwin/compiler/compile-deal.test.ts`
- Test: `tests/dealtwin/compiler/horizon.test.ts`

**Consumes:** Task 7 and confirmed constraint set.
**Produces:** `CompileInput`, `CompileResult`, `compileDeal`, explicit outcomes and violation reason codes.

**Interface signature contract:**

```ts
buildPlanningHorizon(asOfDate: IsoDate, events: readonly DatedCashEvent[]): IsoDate; evaluateConstraints(input: CompileInput, points: readonly LiquidityPoint[]): readonly ConstraintEvaluation[]; compileDeal(input: CompileInput): CompileResult;
```

**Behavioral RED/GREEN:** return first violation with exact shortfall and expanded horizon. Run `npm.cmd test -- tests/dealtwin/compiler/compile-deal.test.ts tests/dealtwin/compiler/horizon.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing tests for `COMPILES`, `CONDITIONALLY_VALID`, `DOES_NOT_COMPILE`, unresolved ordering, minimum-cash failure, max deposit, no borrowing, protected supplier due dates, inventory failure, first violating date, worst point, collision IDs, and 31st-day horizon expansion.
- [ ] Run `npm.cmd test -- tests/dealtwin/compiler/compile-deal.test.ts tests/dealtwin/compiler/horizon.test.ts` and verify failure.
- [ ] Implement exhaustive constraint evaluation and stable reason priority. Expand the 30-day horizon to the last decision-relevant dependency; record why it expanded.
- [ ] Run focused tests and typecheck.
- [ ] Commit with `git add "lib/dealtwin/compiler/horizon.ts" "lib/dealtwin/compiler/evaluate-constraints.ts" "lib/dealtwin/compiler/compile-deal.ts" "tests/dealtwin/compiler/compile-deal.test.ts" "tests/dealtwin/compiler/horizon.test.ts" && git commit -m "feat: implement deterministic deal compilation"`.

### Task 9: Locked Judge scenario as executable compiler fixture

**Files:**
- Create: `lib/dealtwin/judge/scenario.ts`
- Create: `tests/dealtwin/fixtures/judge-scenario.ts`
- Test: `tests/dealtwin/compiler/judge-scenario.test.ts`

**Consumes:** pure adapter fixtures and compiler.
**Produces:** `JUDGE_TENANT_ID`, canonical IDs/dates, `createJudgeScenario`, and expected invariant facts without hard-coded UI output.

**Interface signature contract:**

```ts
createJudgeScenario(): JudgeScenario;
```

**Behavioral RED/GREEN:** compute initial 3000000n shortfall and explicit 25% candidate minimum 5000000n. Run `npm.cmd test -- tests/dealtwin/compiler/judge-scenario.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write the failing test asserting Rp30m opening cash, Rp18m existing obligation, Rp5m floor, Rp60m revenue, Rp42m cost, 4,000-bps deposit cap, profitable contribution, initial non-compile, exact violation date/shortfall, existing AR Rp20m on September 20/order 500, acceptance September 16, deposit 20% September 16/order 500, customer balance September 30/order 500, direct cost September 22/order 300, initial minimum Rp2m on September 22 and shortfall Rp3m. Assert the fixed candidate deposit 25%, balance 14 days and supplier timing 6 days yields Rp5m minimum. Task 9 compiles this explicit candidate only; search selection is tested in Task 21 after the search engine exists.
- [ ] Run `npm.cmd test -- tests/dealtwin/compiler/judge-scenario.test.ts` and verify failure.
- [ ] Lock IDs and all dates to spec section 10, including AP September 15, opening September 12/order 0, collision Deal B, and the Rp19m AP mutation variant. No runtime clock is read. Implement the fixture through ordinary domain constructors and `compileDeal`; expected outcomes must be consequences of events, not a scenario-name branch.
- [ ] Run the focused test and all compiler tests.
- [ ] Commit with `git add "lib/dealtwin/judge/scenario.ts" "tests/dealtwin/fixtures/judge-scenario.ts" "tests/dealtwin/compiler/judge-scenario.test.ts" && git commit -m "test: lock the DealTwin judge financial scenario"`.

## Phase 4 — Deal Proof and Replay

### Task 10: Canonical proof builder and hash

**Files:**
- Create: `lib/dealtwin/proof/build-proof.ts`
- Create: `lib/dealtwin/proof/proof-dto.ts`
- Create: `lib/dealtwin/proof/version.ts`
- Test: `tests/dealtwin/proof/build-proof.test.ts`

**Consumes:** immutable DealVersion, snapshot, base/stress compile runs, assumptions, approvals.
**Produces:** `buildDealProof`, `DealProofDto`, `DEALTWIN_ENGINE_VERSION`, `CANONICALIZATION_VERSION`, proof/input/result hashes.

**Interface signature contract:**

```ts
buildDealProof(input: ProofBuildInput): DealProof; encodeProof(proof: DealProof): DealProofDto;
```

**Behavioral RED/GREEN:** change hash when canonical input changes, preserve it under object-key permutations. Run `npm.cmd test -- tests/dealtwin/proof/build-proof.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing completeness, key-order, event-order, bigint serialization, version, approval, assumption, and tamper tests.
- [ ] Run `npm.cmd test -- tests/dealtwin/proof/build-proof.test.ts` and verify failure.
- [ ] Build proof content from canonical inputs only. Hash the versioned proof body without mutable replay metadata; include snapshot and dependency hashes.
- [ ] Run focused tests and typecheck.
- [ ] Commit with `git add "lib/dealtwin/proof/build-proof.ts" "lib/dealtwin/proof/proof-dto.ts" "lib/dealtwin/proof/version.ts" "tests/dealtwin/proof/build-proof.test.ts" && git commit -m "feat: generate canonical Deal Proofs"`.

### Task 11: Genuine replay and approval service

**Files:**
- Create: `lib/dealtwin/proof/replay-proof.ts`
- Create: `lib/dealtwin/application/approval-service.ts`
- Create: `lib/dealtwin/application/ports.ts`
- Create: `lib/dealtwin/application/operation-contracts.ts`
- Test: `tests/dealtwin/proof/replay-proof.test.ts`
- Test: `tests/dealtwin/application/approval-service.test.ts`

**Consumes:** proof DTO, compiler, repository ports, actor/idempotency context.
**Produces:** `replayProof`, `ReplayResult`, `ApplicationPorts`, `MutationContext`, `OperationResponse`, operation input/receipt contracts, `ApprovalRepository`, `ProofRepository`, and idempotent approval decisions.

**Interface signature contract:**

```ts
replayProof(proof: DealProofDto, compiler?: typeof compileDeal): ReplayResult; decideApproval(ports: ApplicationPorts, context: MutationContext, input: ApprovalDecisionInput): Promise<OperationResponse>;
```

**Behavioral RED/GREEN:** recompute tampered proof to mismatch and deny commit eligibility while approval is pending (actual COMMIT persistence is Task 16). Run `npm.cmd test -- tests/dealtwin/proof/replay-proof.test.ts tests/dealtwin/application/approval-service.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write a failing replay test using an injected compiler spy and asserting actual invocation, identical result hash, mismatch detection, unsupported engine version, and invalid canonical payload. Write approval tests for arithmetic uncertainty blocking RESERVE, fixed non-arithmetic pending approval allowing RESERVE, pending/rejected approval blocking COMMIT, approve/reject, repeated decision key, and current approval lookup without rewriting/staling the historical proof payload. Define immutable audit response ports now; in-memory test ports obey the same success replay contract as Task 14.
- [ ] Run `npm.cmd test -- tests/dealtwin/proof/replay-proof.test.ts tests/dealtwin/application/approval-service.test.ts` and verify failure.
- [ ] Implement replay by decoding stored inputs and calling the compatible compiler. Return `REPLAY_MISMATCH` or `UNSUPPORTED_ENGINE_VERSION` without mutating proof validity. Implement approval through ports; persistence arrives in Phase 5.
- [ ] Run focused tests and typecheck.
- [ ] Commit with `git add "lib/dealtwin/proof/replay-proof.ts" "lib/dealtwin/application/approval-service.ts" "lib/dealtwin/application/ports.ts" "lib/dealtwin/application/operation-contracts.ts" "tests/dealtwin/proof/replay-proof.test.ts" "tests/dealtwin/application/approval-service.test.ts" && git commit -m "feat: replay proofs and gate approvals"`.

## Phase 5 — Server repository

### Task 12: PostgreSQL driver, transaction helper, and disposable test service

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/server/postgres/config.ts`
- Create: `lib/server/postgres/pool.ts`
- Create: `lib/server/postgres/transaction.ts`
- Create: `docker-compose.dealtwin-test.yml`
- Test: `tests/dealtwin/postgres/transaction.test.ts`

**Consumes:** `DATABASE_URL` in server runtime and `DEALTWIN_TEST_DATABASE_URL` in tests.
**Produces:** one process-level `pg.Pool`, `withPostgresClient`, `withTransaction`, explicit SSL config, 5-second connection/statement limits, and guaranteed client release.

**Interface signature contract:**

```ts
withTransaction<T>(pool: Pool, tenantId: string, action: (client: PoolClient) => Promise<T>): Promise<T>;
```

**Behavioral RED/GREEN:** rollback/release one client and prevent leaked tenant context. Run `npm.cmd test -- tests/dealtwin/postgres/transaction.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Add `pg` using `npm.cmd install --save-exact pg` and `@types/pg` using `npm.cmd install --save-dev --save-exact @types/pg`; Zod starts at Task 15 and Playwright at Task 24; inspect the lockfile diff and reject unrelated major upgrades.
- [ ] Write failing tests with an injected fake `PoolClient` proving one client receives BEGIN/all statements/COMMIT, errors cause ROLLBACK, release always occurs, and no transaction uses `pool.query`. Verify tenant context is set locally after BEGIN with `select set_config('app.tenant_id', $1, true)` on that client and disappears on release/rollback; every tenant-data query still includes a tenant predicate. Actual connection reuse/context cleanup is proved by Task 13 integration tests, not inferred from the fake client.
- [ ] Run `npm.cmd test -- tests/dealtwin/postgres/transaction.test.ts` and verify failure.
- [ ] Implement the helper. The pool has `max: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`; SSL is explicitly configured by `DATABASE_SSL_MODE=disable|verify-full`, never silently set to insecure certificate mode.
- [ ] Run the focused test and typecheck.
- [ ] Commit with `git add "package.json" "package-lock.json" "lib/server/postgres/config.ts" "lib/server/postgres/pool.ts" "lib/server/postgres/transaction.ts" "docker-compose.dealtwin-test.yml" "tests/dealtwin/postgres/transaction.test.ts" && git commit -m "feat: add DealTwin PostgreSQL boundary"`.

### Task 13: Cash and eight-table DealTwin migration

**Files:**
- Create via Supabase CLI, then retain as: `supabase/migrations/20260913150558_dealtwin_server_foundation.sql`
- Modify: `supabase/schema.sql`
- Create: `tests/dealtwin/postgres/schema.test.ts`
- Create: `tests/dealtwin/postgres/rls.test.ts`
- Create: `tests/dealtwin/postgres/harness.ts`

**Consumes:** existing tenant/workspace/ERP schema.
**Produces:** `erp_cash_accounts`, `erp_cash_movements`, the eight locked `dealtwin_*` tables, constraints, indexes, RLS, and privileges.

**Interface signature contract:**

```ts
applyTestMigrations(databaseUrl: string): Promise<void>; probeTenantAccess(databaseUrl: string, role: string, tenantId: string): Promise<TenantAccessEvidence>;
```

**Behavioral RED/GREEN:** deny wrong-tenant DML and invalid reversal through actual database constraints. Run `npm.cmd test -- tests/dealtwin/postgres/schema.test.ts tests/dealtwin/postgres/rls.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Run `npx supabase migration new dealtwin_server_foundation`, then retain its CLI-generated timestamp filename; record that exact filename here before editing SQL. The dated path above is the reviewed logical migration identity; the only permitted filename substitution is the timestamp emitted by this command, which must be copied into this file list and commit command. Do not rename/backdate its generated file or create a second migration.
- [ ] Write a failing schema test that applies all migrations to the disposable PostgreSQL service and introspects tables, columns, types, checks, tenant-composite FKs, indexed FKs, forced RLS, append-only privileges, the one-active-account partial unique index, separate partial unique lifecycle idempotency indexes, a unique `(tenant_id, action, detail->>'idempotencyKey')` index restricted to successful DealTwin operation events (`action LIKE 'dealtwin.%' AND detail->>'operationSucceeded' = 'true'`, with non-null receipt fields enforced), and proof/version/event-hash commitment identity.
- [ ] Start the isolated DB with `docker compose -f docker-compose.dealtwin-test.yml up -d --wait`; set `DEALTWIN_TEST_DATABASE_URL` to its documented localhost URL; run `npm.cmd test -- tests/dealtwin/postgres/schema.test.ts` and verify failure.
- [ ] Implement exactly the two cash tables and eight DealTwin tables in the locked spec. Do not add conflict or DealTwin audit tables. Store money/revisions as bigint, timestamps as timestamptz, canonical payloads as jsonb, dependency keys as text arrays, and statuses as text checks. Use one commitment row per reservation aggregate with immutable canonical events JSON and canonical_event_hash; all events carry exact money strings. Add original/reversal cash checks, tenant/account original FK, unique reversal-of-original index, and a database trigger checking same amount/opposite direction/not-a-reversal/chronology. Deny app UPDATE/DELETE on cash movements and audit; permit cash-account setup only through validated commands. Append-only guards may admit synthetic-only reset-role deletion of cash/business rows, never audit receipt deletion. Force RLS on all participating ERP and DealTwin tables: app USING and WITH CHECK compare the row tenant to transaction-local context, including erp_tenants.id. Reset-role policies also require literal tenant `dealtwin-judge-v1`. Roles are NOLOGIN NOSUPERUSER NOBYPASSRLS, are not table owners, and cannot inherit each other; login credentials are provisioned outside migrations. No public grants. Add equality columns before range columns in composite indexes. The disposable harness creates baseline-only Supabase compatibility roles required by old migrations; it never rewrites historical migrations or loads production settings.
- [ ] Update `supabase/schema.sql`, rerun the schema test from a fresh database, run `npm.cmd test -- tests/erp-schema.test.ts`, then stop the container.
- [ ] Commit with `git add "supabase/migrations/20260913150558_dealtwin_server_foundation.sql" "supabase/schema.sql" "tests/dealtwin/postgres/schema.test.ts" "tests/dealtwin/postgres/rls.test.ts" "tests/dealtwin/postgres/harness.ts" && git commit -m "feat: add DealTwin PostgreSQL schema"`.

### Task 14: PostgreSQL ERP and DealTwin repositories

**Files:**
- Modify: `lib/repository/erp-repository.ts`
- Modify: `lib/dealtwin/application/ports.ts`
- Create: `lib/server/postgres/postgres-erp-repository.ts`
- Create: `lib/server/postgres/postgres-dealtwin-repository.ts`
- Create: `lib/server/postgres/erp-workspace-mapper.ts`
- Create: `lib/server/postgres/dealtwin-mappers.ts`
- Create: `lib/server/postgres/proof-invalidation.ts`
- Create: `lib/server/postgres/idempotency-audit-store.ts`
- Test: `tests/dealtwin/postgres/proof-invalidation-primitive.test.ts`
- Test: `tests/dealtwin/postgres/idempotency-audit-store.test.ts`
- Test: `tests/dealtwin/postgres/repositories.test.ts`

**Consumes:** existing `ErpRepository`, existing normalized ERP schema, DealTwin ports, exact DTOs.
**Produces:** server implementations plus `TransactionScopedRepositories` and `lockTenantWorkspace(tx, tenantId)`, `invalidateAffectedProofs(tx, change, self)`, `readOperationReceipt(tx, tenantId, action, key, requestHash)`, and `appendOperationReceipt(tx, receipt)`.

**Interface signature contract:**

```ts
lockTenantWorkspace(tx: PoolClient, tenantId: string): Promise<number>; invalidateAffectedProofs(tx: PoolClient, change: DependencyChange, self: SelfReservationIdentity | null): Promise<readonly string[]>; readOperationReceipt(tx: PoolClient, tenantId: string, action: string, key: string, requestHash: string): Promise<OperationResponse | null>; appendOperationReceipt(tx: PoolClient, receipt: OperationReceipt): Promise<void>;
```

**Behavioral RED/GREEN:** replay immutable receipt after mutable status changes and exempt only exact self delta. Run `npm.cmd test -- tests/dealtwin/postgres/proof-invalidation-primitive.test.ts tests/dealtwin/postgres/idempotency-audit-store.test.ts tests/dealtwin/postgres/repositories.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing integration tests for full relevant ERP round-trip, exact string/bigint mapping, Deal/version immutability, snapshot/proof/approval/commitment round-trip, expected-revision conflict, audit append, cross-tenant denial, exact self tuple exemption, hash mismatch denial, new-obligation dependency invalidation, and original-response replay after lifecycle changes.
- [ ] Run against a fresh disposable DB and confirm failure.
- [ ] Implement parameterized SQL only. `saveAtomic` validates the complete state, locks `erp_workspaces` first, writes normalized rows in deterministic table/key order, requires proposed revision = expected + 1 and persists that exact value once, and never trusts tenant IDs from row payloads. The transaction-local invalidation primitive and immutable audit receipt store are complete in this task, before Task 16. Self exemption applies only to the owner's reservation-capacity delta; unrelated ERP changes in the same transaction still invalidate it. Existing browser repository selection remains unchanged.
- [ ] Run repository integration tests, `tests/erp-repository-mappers.test.ts`, and typecheck; stop the DB.
- [ ] Commit with `git add "lib/repository/erp-repository.ts" "lib/dealtwin/application/ports.ts" "lib/server/postgres/postgres-erp-repository.ts" "lib/server/postgres/postgres-dealtwin-repository.ts" "lib/server/postgres/erp-workspace-mapper.ts" "lib/server/postgres/dealtwin-mappers.ts" "lib/server/postgres/proof-invalidation.ts" "lib/server/postgres/idempotency-audit-store.ts" "tests/dealtwin/postgres/proof-invalidation-primitive.test.ts" "tests/dealtwin/postgres/idempotency-audit-store.test.ts" "tests/dealtwin/postgres/repositories.test.ts" && git commit -m "feat: implement server DealTwin repositories"`.

### Task 15: Server-authoritative Judge seed, reset, and repository selection

**Files:**
- Create: `lib/dealtwin/application/judge-seed-service.ts`
- Create: `lib/server/dealtwin/runtime.ts`
- Create: `app/api/dealtwin/judge/reset/route.ts`
- Create: `app/api/dealtwin/judge/state/route.ts`
- Create: `lib/server/auth/judge-session.ts`
- Create: `lib/server/dealtwin/request-contract.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/dealtwin/postgres/judge-reset.test.ts`
- Test: `tests/dealtwin/api/judge-routes.test.ts`

**Consumes:** Judge fixture, repositories, server session tenant, transaction helper.
**Produces:** `resetJudgeTenant`, `loadJudgeState`, server runtime composition, allowlisted reset route.

**Interface signature contract:**

```ts
resetJudgeTenant(context: MutationContext): Promise<OperationResponse>; loadJudgeState(context: ActorContext): Promise<JudgeStateDto>; requireJudgeSession(request: Request): Promise<ActorContext>;
```

**Behavioral RED/GREEN:** deny foreign reset and retain monotone revision and old success receipts across reset. Run `npm.cmd test -- tests/dealtwin/postgres/judge-reset.test.ts tests/dealtwin/api/judge-routes.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Install pinned Zod at this first external request boundary. Write failing tests for repeat-reset identical business seed hash with monotonically increasing revision, reset rollback on injected error, separate reset credential and forced RLS denial for non-synthetic tenant, non-Judge tenant denial, request-body tenant spoof rejection, durable state after new repository instance, and no `localStorage` import in server runtime.
- [ ] Run the focused tests and confirm failure.
- [ ] Implement reset inside one locked transaction. Delete only the fixed synthetic tenant’s DealTwin/cash/relevant ERP rows in FK-safe order, reseed canonical IDs and dates, advance revision once without rewinding it, and append a reset audit. Derive tenant from a signed HttpOnly SameSite Judge session (server signing key, fixed synthetic tenant, expiry, actor roles); reject body tenant and role spoofing. Use a distinct reset pool with `DEALTWIN_JUDGE_RESET_DATABASE_URL`; runtime app credentials have no reset membership. Retain the tenant/workspace lock row and all audit rows; reset deletes only the explicitly allowlisted business aggregates. Keep immutable operation audit receipts across reset so old idempotency keys cannot execute again; seed hash excludes revision and audit receipts. Old versions/proofs disappear on reset and cannot authorize new commands. Reset uses expected revision and idempotency, deletes only allowlisted synthetic business rows, and appends new reset evidence.
- [ ] Run unit/API tests, disposable-DB tests, the existing 530-test suite, and typecheck.
- [ ] Commit with `git add "lib/dealtwin/application/judge-seed-service.ts" "lib/server/dealtwin/runtime.ts" "app/api/dealtwin/judge/reset/route.ts" "app/api/dealtwin/judge/state/route.ts" "lib/server/auth/judge-session.ts" "lib/server/dealtwin/request-contract.ts" "package.json" "package-lock.json" "tests/dealtwin/postgres/judge-reset.test.ts" "tests/dealtwin/api/judge-routes.test.ts" && git commit -m "feat: add durable DealTwin judge state"`.

## Phase 6 — Commitment Ledger

### Task 16: Atomic reserve and commit transaction

**Files:**
- Create: `lib/dealtwin/application/commitment-service.ts`
- Create: `lib/server/postgres/postgres-commitment-service.ts`
- Create: `lib/dealtwin/application/audit-events.ts`
- Create: `app/api/dealtwin/deals/[dealId]/reserve/route.ts`
- Create: `app/api/dealtwin/deals/[dealId]/commit/route.ts`
- Test: `tests/dealtwin/application/commitment-service.test.ts`
- Test: `tests/dealtwin/postgres/commitment-transaction.test.ts`

**Consumes:** current proof/dependencies, exact compiler, current ERP/cash/commitments, existing `createSalesOrder`, Task 14 `invalidateAffectedProofs` and operation receipts, actor and operation key.
**Produces:** `reserveLiquidity`, `commitDeal`, stable stale/collision/revision/idempotent results, and namespaced audits.

**Interface signature contract:**

```ts
reserveLiquidity(context: MutationContext, input: ProofCommandInput): Promise<OperationResponse>; commitDeal(context: MutationContext, input: ProofCommandInput): Promise<OperationResponse>;
```

**Behavioral RED/GREEN:** count self once, preserve proof validity after reserve, write one Sales Order/audit/revision. Run `npm.cmd test -- tests/dealtwin/application/commitment-service.test.ts tests/dealtwin/postgres/commitment-transaction.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing unit tests for blocking proof/approval states and failing integration tests for the exact 14-step transaction, including stale dependency, insufficient liquidity, successful reservation, self RESERVE leaves owner proof current and invalidates affected other proofs, COMMIT counts self once, non-arithmetic conditional RESERVE allowed, blocked COMMIT before approval, one Sales Order on commit, one operational sales_order.created audit, one revision increment, and rollback after injected write-back/audit errors.
- [ ] Run focused unit and disposable-DB tests and verify failure.
- [ ] Implement pre-transaction validation, then on one client: BEGIN; lock workspace row; read immutable operation receipt before optimistic checks; compare revision/dependency hashes; persist staleness-only evidence when changed; exclude only the exact self proof/version/event-hash reservation; recompute liquidity with candidate events once; persist conflict-only audit on collision; insert/transition commitment; execute and persist the existing Sales Order command on COMMIT; read current approval decisions for the exact proof/version without editing its immutable payload; reject a Deal already linked to a Sales Order; adopt the legacy command's proposed revision exactly once (never call a second incrementing save); invalidate intersecting proofs using Task 14 primitive and scoped self exemption; append immutable original-response audit receipt; COMMIT. Roll back unexpected failures.
- [ ] Re-run focused tests, finance/sales regressions, and typecheck.
- [ ] Commit with `git add "lib/dealtwin/application/commitment-service.ts" "lib/server/postgres/postgres-commitment-service.ts" "lib/dealtwin/application/audit-events.ts" "app/api/dealtwin/deals/[dealId]/reserve/route.ts" "app/api/dealtwin/deals/[dealId]/commit/route.ts" "tests/dealtwin/application/commitment-service.test.ts" "tests/dealtwin/postgres/commitment-transaction.test.ts" && git commit -m "feat: reserve and commit liquidity atomically"`.

### Task 17: Release, expiration, cancellation, and operation idempotency

**Files:**
- Modify: `lib/dealtwin/application/commitment-service.ts`
- Modify: `lib/server/postgres/postgres-commitment-service.ts`
- Create: `app/api/dealtwin/commitments/[commitmentId]/route.ts`
- Test: `tests/dealtwin/postgres/commitment-lifecycle.test.ts`

**Consumes:** locked transaction and lifecycle contracts.
**Produces:** `releaseCommitment`, `expireCommitment`, `cancelCommitment`, conditional status updates, and immutable audit-receipt replay for every successful operation.

**Interface signature contract:**

```ts
releaseCommitment(context: MutationContext, input: CommitmentCommandInput): Promise<OperationResponse>; expireCommitment(context: MutationContext, input: CommitmentCommandInput): Promise<OperationResponse>; cancelCommitment(context: MutationContext, input: CommitmentCommandInput): Promise<OperationResponse>;
```

**Behavioral RED/GREEN:** return each original reserve/commit/release/expire/cancel response after later lifecycle changes without new writes. Run `npm.cmd test -- tests/dealtwin/postgres/commitment-lifecycle.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing tests for legal/illegal transitions, expiry clock injection, dedicated reserve/commit/release row keys, audit-only expire/cancel operation keys, same-key retry, different-payload same-key conflict, no cash movement creation, and one audit per successful transition. Assert expire/cancel add no key columns and never reuse the release key.
- [ ] Run the focused disposable-DB test and verify failure.
- [ ] Implement a parameterized conditional update whose predicate admits only the source lifecycle statuses for the requested transition and whose `RETURNING` clause supplies the updated commitment. Run it under the tenant lock. Store only reserve, commit, and release idempotency keys on the commitment row. Store every successful operation—including expire and cancel—in an immutable namespaced audit receipt and read that receipt on retry even after later transitions; expire/cancel add no idempotency columns and do not reuse the release key. Never reconstruct old output from the lifecycle row. Test RESERVE retry after COMMIT and RELEASE, COMMIT retry after RELEASE, and expire/cancel retry after later transitions, plus mismatched payload hash.
- [ ] Re-run tests and typecheck.
- [ ] Commit with `git add "lib/dealtwin/application/commitment-service.ts" "lib/server/postgres/postgres-commitment-service.ts" "app/api/dealtwin/commitments/[commitmentId]/route.ts" "tests/dealtwin/postgres/commitment-lifecycle.test.ts" && git commit -m "feat: complete commitment lifecycle"`.

### Task 18: Real concurrency and rollback proof

**Files:**
- Create: `tests/dealtwin/postgres/commitment-race.test.ts`
- Create: `tests/dealtwin/postgres/commitment-failure-injection.test.ts`
- Modify: `.github/workflows/ci.yml`

**Consumes:** two independent pooled clients and canonical Judge seed.
**Produces:** CI-enforced evidence for serialization, idempotency, and atomic rollback.

**Interface signature contract:**

```ts
runCapacityRace(harness: PostgresHarness, requests: readonly [ReservationRequest, ReservationRequest]): Promise<readonly [OperationResponse, OperationResponse]>;
```

**Behavioral RED/GREEN:** serialize concurrent requests, reject stale revision, then report real collision after refresh. Run `npm.cmd test -- tests/dealtwin/postgres/commitment-race.test.ts tests/dealtwin/postgres/commitment-failure-injection.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write a barrier-controlled test that starts two colliding reservations before either completes. Use independent two-client 4m/5m requests against 7m capacity. First assert serialization; when both start with the same expected revision, the loser returns REVISION_CONFLICT. Retry that rejected operation after loading the new revision, then assert one `reserved` and one `LIQUIDITY_COLLISION`, one active capacity consumer, correct revision, and conflict audit. An unrecorded failed request may be retried with fresh revision; only successful operation keys are immutable.
- [ ] Add concurrent same-idempotency-key and failures after commitment insert, Sales Order insert, revision update, and audit insert. Assert no partial rows after each injected error.
- [ ] Make the barrier test execute 20 independently seeded races in one run, run both focused test files against PostgreSQL, and verify current code fails before any relaxation of assertions.
- [ ] Add a PostgreSQL service to CI and a required integration-test command. Do not permit missing DB configuration to turn the job green through skips.
- [ ] Run CI-equivalent typecheck, focused race tests, and full unit tests locally.
- [ ] Commit with `git add "tests/dealtwin/postgres/commitment-race.test.ts" "tests/dealtwin/postgres/commitment-failure-injection.test.ts" ".github/workflows/ci.yml" && git commit -m "test: prove DealTwin commitment concurrency"`.

## Phase 7 — Staleness, Stress Lab, and Recompiler

### Task 19: Extend invalidation to every ERP mutation entrypoint

**Files:**
- Create: `lib/dealtwin/application/proof-invalidation-service.ts`
- Modify: `lib/server/postgres/postgres-erp-repository.ts`
- Modify: `lib/server/postgres/postgres-commitment-service.ts`
- Test: `tests/dealtwin/application/proof-invalidation.test.ts`
- Test: `tests/dealtwin/postgres/proof-invalidation.test.ts`

**Consumes:** Task 14 transaction-local `invalidateAffectedProofs`, used already by Task 16, plus before/after dependency hashes and changed keys from every server ERP/commitment mutation.
**Produces:** `ProofInvalidationService.afterErpMutation`, `dealtwin.proof.stale`, and dependency revalidation.

**Interface signature contract:**

```ts
ProofInvalidationService.afterErpMutation(repositories: TransactionScopedRepositories, change: DependencyChange): Promise<readonly string[]>;
```

**Behavioral RED/GREEN:** mark dependent proofs stale after every material server ERP mutation, including new obligations. Run `npm.cmd test -- tests/dealtwin/application/proof-invalidation.test.ts tests/dealtwin/postgres/proof-invalidation.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing tests for new/changed/cancelled invoice, payment, cash movement, commitment, inventory reservation, and timing change; also prove an unrelated label change does not stale a proof.
- [ ] Run focused unit/integration tests and verify failure.
- [ ] Route every existing master-data, purchasing, sales, finance, inventory and supplier-result server mutation through this hook; preserve the browser command path. Compute changed record and query-range keys in the same mutation transaction; update valid/conditional proofs whose indexed dependency keys intersect and whose content hash changed. Record changed keys and revision in audit.
- [ ] Re-run tests and typecheck.
- [ ] Commit with `git add "lib/dealtwin/application/proof-invalidation-service.ts" "lib/server/postgres/postgres-erp-repository.ts" "lib/server/postgres/postgres-commitment-service.ts" "tests/dealtwin/application/proof-invalidation.test.ts" "tests/dealtwin/postgres/proof-invalidation.test.ts" && git commit -m "feat: invalidate material Deal Proofs"`.

### Task 20: Explicit deterministic Stress Lab

**Files:**
- Create: `lib/dealtwin/stress/stress-transform.ts`
- Create: `lib/dealtwin/application/stress-lab-service.ts`
- Test: `tests/dealtwin/stress/stress-lab.test.ts`

**Consumes:** canonical compile input and injected scenario definitions.
**Produces:** `StressScenario`, `applyStressTransform`, `runStressLab`, versioned stress compile runs.

**Interface signature contract:**

```ts
applyStressTransform(input: CompileInput, scenario: StressScenario): CompileInput; runStressLab(input: CompileInput, scenarios: readonly StressScenario[]): readonly StressRun[];
```

**Behavioral RED/GREEN:** delay exactly specified customer events and preserve immutable base inputs. Run `npm.cmd test -- tests/dealtwin/stress/stress-lab.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing tests for receipt +3/+7/+14 days, direct outflow +500 bps with ceiling rounding, selected receipt delay, specified new obligation, transform immutability, deterministic hashes, and invalid target rejection.
- [ ] Run `npm.cmd test -- tests/dealtwin/stress/stress-lab.test.ts` and verify failure.
- [ ] Implement transforms as pure functions; compile every transformed input and record exact parameters/input/output hashes. Never assign probability or universal-safety language.
- [ ] Re-run tests and typecheck.
- [ ] Commit with `git add "lib/dealtwin/stress/stress-transform.ts" "lib/dealtwin/application/stress-lab-service.ts" "tests/dealtwin/stress/stress-lab.test.ts" && git commit -m "feat: add deterministic Deal Stress Lab"`.

### Task 21: Bounded deterministic smallest-amendment search

**Files:**
- Modify: `lib/dealtwin/application/commitment-service.ts`
- Modify: `lib/server/postgres/postgres-commitment-service.ts`
- Modify: `tests/dealtwin/postgres/commitment-transaction.test.ts`
- Create: `lib/dealtwin/recompiler/search-space.ts`
- Create: `lib/dealtwin/recompiler/recompile-deal.ts`
- Create: `lib/dealtwin/application/recompiler-service.ts`
- Test: `tests/dealtwin/recompiler/recompiler.test.ts`

**Consumes:** current terms, allowed ranges/approvals, compiler, locked lexicographic objective.
**Produces:** `AmendmentPolicy`, `AmendmentCandidate`, `findSmallestAmendment`, and `NO_FEASIBLE_AMENDMENT`.

**Interface signature contract:**

```ts
findSmallestAmendment(input: CompileInput, policy: AmendmentPolicy): AmendmentSearchResult;
replaceReservation(context: MutationContext, input: { commitmentId: string; previous: SelfReservationIdentity; replacement: SelfReservationIdentity }): Promise<OperationResponse>;
```

**Behavioral RED/GREEN:** select 25% deposit with locked ranking and 27% after the AP mutation. Run `npm.cmd test -- tests/dealtwin/recompiler/recompiler.test.ts tests/dealtwin/postgres/commitment-transaction.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing tests that compare the search with exhaustive enumeration, cover tie-break order, 100-bps deposit steps, one-day timing steps, supplier approval gate, no-solution, permutation determinism, and exact Judge winner deposit 2,500 bps, customer balance 14 days, direct cost 6 days. Candidate feasibility includes required stress +3 days. After AP changes to Rp19m, assert winner 2,700 bps/minimum Rp5.2m. Define immutable new version/proof and replacement of old reservation under capacity recheck; never edit historical proof inputs.
- [ ] Run the focused test and verify failure.
- [ ] Enumerate the finite space, compile every candidate, retain feasible candidates, and sort by changed-field count, total normalized steps, deposit delta, customer timing delta, supplier timing delta, then canonical hash. No AI ranking is allowed.
- [ ] Test recompile of an already committed Deal as a proposed replacement only: exclude the verified old self aggregate in the projection, keep its occupied ledger capacity and existing Sales Order unchanged, and return remediation-pending state. A second COMMIT must fail. Still-reserved replacement is one transaction in the commitment service with new proof/version checks, no release-then-reserve gap, and rollback evidence. Retire the old aggregate and insert the new one atomically, preserving the old immutable events/hash; do not overwrite its proof identity.
- [ ] Run focused tests, all compiler tests, and typecheck.
- [ ] Commit with `git add "lib/dealtwin/application/commitment-service.ts" "lib/server/postgres/postgres-commitment-service.ts" "tests/dealtwin/postgres/commitment-transaction.test.ts" "lib/dealtwin/recompiler/search-space.ts" "lib/dealtwin/recompiler/recompile-deal.ts" "lib/dealtwin/application/recompiler-service.ts" "tests/dealtwin/recompiler/recompiler.test.ts" && git commit -m "feat: find deterministic deal amendments"`.

## Phase 8 — DealTwin app

### Task 22: Deal APIs and workflow application services

**Files:**
- Create: `lib/dealtwin/application/deal-service.ts`
- Create: `lib/dealtwin/application/proof-service.ts`
- Create: `lib/dealtwin/application/constraint-service.ts`
- Create: `lib/dealtwin/application/judge-obligation-service.ts`
- Create: `app/api/dealtwin/deals/[dealId]/constraints/confirm/route.ts`
- Create: `app/api/dealtwin/approvals/[approvalId]/decision/route.ts`
- Create: `app/api/dealtwin/judge/obligations/[invoiceId]/route.ts`
- Test: `tests/dealtwin/api/constraint-confirmation.test.ts`
- Test: `tests/dealtwin/api/approval-decision.test.ts`
- Test: `tests/dealtwin/api/judge-obligation.test.ts`
- Create: `app/api/dealtwin/deals/route.ts`
- Create: `app/api/dealtwin/deals/[dealId]/route.ts`
- Create: `app/api/dealtwin/deals/[dealId]/compile/route.ts`
- Create: `app/api/dealtwin/deals/[dealId]/proof/route.ts`
- Create: `app/api/dealtwin/proofs/[proofId]/replay/route.ts`
- Create: `app/api/dealtwin/proofs/[proofId]/stress/route.ts`
- Create: `app/api/dealtwin/deals/[dealId]/recompile/route.ts`
- Test: `tests/dealtwin/api/deal-routes.test.ts`

**Consumes:** all application services and server-authenticated actor/tenant.
**Produces:** size-bounded Zod DTOs, stable HTTP/status/reason contracts, immutable version edits, compile/proof/replay/stress/recompile endpoints.

**Interface signature contract:**

```ts
confirmConstraints(context: MutationContext, input: ConstraintConfirmationInput): Promise<OperationResponse>; mutateJudgeObligation(context: MutationContext, input: JudgeObligationInput): Promise<OperationResponse>; DealApplicationService.compile(context: MutationContext, dealVersionId: string): Promise<OperationResponse>; ProofApplicationService.generate(context: MutationContext, dealVersionId: string): Promise<OperationResponse>;
```

**Behavioral RED/GREEN:** confirm constraints, reject unauthenticated approval/mutation, stale proof on valid AP mutation. Run `npm.cmd test -- tests/dealtwin/api/constraint-confirmation.test.ts tests/dealtwin/api/approval-decision.test.ts tests/dealtwin/api/judge-obligation.test.ts tests/dealtwin/api/deal-routes.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing route tests for auth, tenant spoofing, malformed/oversized money and AI-shaped payloads, stale expected version, every success/failure status, and idempotent mutations. Confirm constraints creates an immutable confirmed version. Approval decision admits only approver role and fixed proof/version; replay does not double increment revision. Judge obligation mutation admits only `judge-existing-ap`, synthetic session, exact Rp19m variant, and no other supplier/customer/tenant. All three require expectedRevision and idempotencyKey and call transaction services. Mutating AP must maintain line totals/source provenance under ERP validation and invoke Task 19 invalidation.
- [ ] Run the focused test and verify failure.
- [ ] Implement thin handlers: parse, authenticate, call one service, serialize canonical exact DTOs. No route performs arithmetic or direct SQL.
- [ ] Run route tests, typecheck, and lint.
- [ ] Commit with `git add "lib/dealtwin/application/deal-service.ts" "lib/dealtwin/application/proof-service.ts" "lib/dealtwin/application/constraint-service.ts" "lib/dealtwin/application/judge-obligation-service.ts" "app/api/dealtwin/deals/[dealId]/constraints/confirm/route.ts" "app/api/dealtwin/approvals/[approvalId]/decision/route.ts" "app/api/dealtwin/judge/obligations/[invoiceId]/route.ts" "tests/dealtwin/api/constraint-confirmation.test.ts" "tests/dealtwin/api/approval-decision.test.ts" "tests/dealtwin/api/judge-obligation.test.ts" "app/api/dealtwin/deals/route.ts" "app/api/dealtwin/deals/[dealId]/route.ts" "app/api/dealtwin/deals/[dealId]/compile/route.ts" "app/api/dealtwin/deals/[dealId]/proof/route.ts" "app/api/dealtwin/proofs/[proofId]/replay/route.ts" "app/api/dealtwin/proofs/[proofId]/stress/route.ts" "app/api/dealtwin/deals/[dealId]/recompile/route.ts" "tests/dealtwin/api/deal-routes.test.ts" && git commit -m "feat: expose DealTwin application APIs"`.

### Task 23: Workflow-first DealTwin surfaces

**Files:**
- Create: `app/dealtwin/layout.tsx`
- Create: `app/dealtwin/page.tsx`
- Create: `app/dealtwin/deals/[dealId]/page.tsx`
- Create: `app/dealtwin/proofs/[proofId]/page.tsx`
- Create: `app/dealtwin/commitments/page.tsx`
- Create: `app/dealtwin/erp/page.tsx`
- Create: `components/dealtwin/deal-inbox.tsx`
- Create: `components/dealtwin/deal-compiler.tsx`
- Create: `components/dealtwin/proof-view.tsx`
- Create: `components/dealtwin/commitment-timeline.tsx`
- Create: `components/dealtwin/erp-evidence.tsx`
- Test: `tests/dealtwin/ui/dealtwin-surfaces.test.ts`

**Consumes:** server APIs only.
**Produces:** Deal Inbox, Compiler, Proof, Timeline, and ERP Sandbox views with retained selected-deal state.

**Interface signature contract:**

```ts
DealInbox(props: { deals: readonly DealSummaryDto[] }): ReactElement; DealCompiler(props: { result: CompileResultDto }): ReactElement; ProofView(props: { proof: DealProofDto }): ReactElement;
```

**Behavioral RED/GREEN:** display exact compiler results and required approval/error states from server DTOs. Run `npm.cmd test -- tests/dealtwin/ui/dealtwin-surfaces.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing component tests for exact outcome language, date/shortfall/floor, confirmed versus projected values, unresolved assumptions/approvals, collision IDs, changed stale dependencies, replay result, loading/error/empty states, keyboard labels, and no hard-coded Judge result.
- [ ] Run the focused test and verify failure.
- [ ] Build reusable, dense financial components. All displayed outcome data comes from server DTOs; browser state may hold navigation/selection only.
- [ ] Run UI tests, typecheck, lint, and existing navigation tests.
- [ ] Commit with `git add "app/dealtwin/layout.tsx" "app/dealtwin/page.tsx" "app/dealtwin/deals/[dealId]/page.tsx" "app/dealtwin/proofs/[proofId]/page.tsx" "app/dealtwin/commitments/page.tsx" "app/dealtwin/erp/page.tsx" "components/dealtwin/deal-inbox.tsx" "components/dealtwin/deal-compiler.tsx" "components/dealtwin/proof-view.tsx" "components/dealtwin/commitment-timeline.tsx" "components/dealtwin/erp-evidence.tsx" "tests/dealtwin/ui/dealtwin-surfaces.test.ts" && git commit -m "feat: add DealTwin financial compiler surfaces"`.

### Task 24: Judge Mode guide and full browser journey

**Files:**
- Create: `app/dealtwin/judge/page.tsx`
- Create: `components/dealtwin/judge-guide.tsx`
- Create: `tests/dealtwin/e2e/judge-mode.spec.ts`
- Create: `playwright.dealtwin.config.ts`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Consumes:** reset/state and ordinary DealTwin APIs; no special hard-coded outcome API.
**Produces:** one-click load/reset and the 12-step judge guide driven by durable state.

**Interface signature contract:**

```ts
JudgeGuide(props: { state: JudgeStateDto }): ReactElement; selectJudgeStep(state: JudgeStateDto): JudgeStep;
```

**Behavioral RED/GREEN:** prove blocked commit, approval, successful commit and original-response retry in browser. Run `npx playwright test --config=playwright.dealtwin.config.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Install `@playwright/test` with `npm.cmd install --save-dev --save-exact @playwright/test` and Chromium with `npx playwright install chromium`. Write the failing Playwright journey: reset, initial compile failure, confirm constraints, recompile amendment, stress, proof, pending approval visibility, conditional RESERVE, blocked COMMIT, approval decision, successful COMMIT and identical idempotent retry, second-deal collision, ERP obligation mutation, automatic stale proof, recompile, replay, refresh persistence.
- [ ] Run against the disposable DB and production-equivalent local server; confirm failure at the absent Judge UI.
- [ ] Implement guide steps as selectors over returned server state. Label every event synthetic/sandbox. Reset requires the Judge session and confirmation.
- [ ] Run desktop and 820/1024px browser checks, the full existing test suite, typecheck, lint, and production build.
- [ ] Commit with `git add "app/dealtwin/judge/page.tsx" "components/dealtwin/judge-guide.tsx" "tests/dealtwin/e2e/judge-mode.spec.ts" "playwright.dealtwin.config.ts" "README.md" "package.json" "package-lock.json" && git commit -m "feat: deliver server-backed DealTwin Judge Mode"`.

## Phase 9 — Nebius/Nemotron

### Task 25: Schema-validated commercial constraint extraction

**Files:**
- Create: `lib/dealtwin/ai/constraint-extractor.ts`
- Create: `lib/dealtwin/ai/nemotron-client.ts`
- Create: `lib/dealtwin/ai/prompt.ts`
- Modify: `lib/dealtwin/application/constraint-service.ts` (created by Task 22)
- Create: `app/api/dealtwin/deals/[dealId]/constraints/extract/route.ts`
- Test: `tests/dealtwin/ai/constraint-extractor.test.ts`
- Test: `tests/dealtwin/api/constraint-route.test.ts`

**Consumes:** commercial text, current confirmed constraints, redacted bounded ERP context, Nebius server credentials.
**Produces:** `ConstraintExtractionPort`, schema-versioned candidate constraints/missing fields, provider metadata, and explicit confirmation workflow.

**Interface signature contract:**

```ts
interface ConstraintExtractionPort { extract(input: ConstraintExtractionInput): Promise<ConstraintExtractionResult>; }
// NemotronConstraintExtractor implements this port; no provider type enters the application service.
```

**Behavioral RED/GREEN:** reject malformed AI output and preserve previously confirmed constraints. Run `npm.cmd test -- tests/dealtwin/ai/constraint-extractor.test.ts tests/dealtwin/api/constraint-route.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing contract tests with a deterministic fake provider for nuanced policy, retained prior constraints, missing information, contradictory terms, malformed JSON, extra fields, prompt injection, timeout, and attempted authoritative balance/result fields.
- [ ] Run focused tests and verify failure.
- [ ] Implement a server-only OpenAI-compatible Nebius client with timeout and response-size limit. Validate strict Zod output, discard prohibited arithmetic/state claims, persist candidates as `ai_extracted`, and require confirmation before compile. Do not call the provider in offline Judge reset or compiler tests.
- [ ] Run focused tests, secret scan, typecheck, and lint. Run one separately authorized live provider smoke only when credentials and network authorization are supplied; otherwise record it as not run.
- [ ] Commit with `git add "lib/dealtwin/ai/constraint-extractor.ts" "lib/dealtwin/ai/nemotron-client.ts" "lib/dealtwin/ai/prompt.ts" "lib/dealtwin/application/constraint-service.ts" "app/api/dealtwin/deals/[dealId]/constraints/extract/route.ts" "tests/dealtwin/ai/constraint-extractor.test.ts" "tests/dealtwin/api/constraint-route.test.ts" && git commit -m "feat: extract constraints with Nemotron"`.

## Phase 10 — Alexa+ MCP

### Task 26: Application-service MCP surface and multi-turn state

**Files:**
- Create: `lib/dealtwin/mcp/tool-schemas.ts`
- Create: `lib/dealtwin/mcp/tool-handlers.ts`
- Create: `lib/dealtwin/mcp/conversation-state.ts`
- Create: `app/api/dealtwin/mcp/route.ts`
- Test: `tests/dealtwin/mcp/tool-handlers.test.ts`
- Test: `tests/dealtwin/mcp/multi-turn.test.ts`

**Consumes:** authenticated application services and durable Deal/Version/Proof IDs.
**Produces:** typed tools for draft/update, extract/confirm constraints, compile, stress, proof/replay, reserve/commit/release, timeline, Judge ERP mutation, and recompile.

**Interface signature contract:**

```ts
executeDealTwinTool(context: ActorContext, request: DealTwinToolRequest): Promise<DealTwinToolResult>; advanceConversation(state: ConversationState, result: DealTwinToolResult): ConversationState;
```

**Behavioral RED/GREEN:** preserve real IDs across turns and refuse unauthorized raw database operations. Run `npm.cmd test -- tests/dealtwin/mcp/tool-handlers.test.ts tests/dealtwin/mcp/multi-turn.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing tests for tool schemas, auth/tenant binding, no raw SQL/table argument, operation idempotency, persisted multi-turn IDs, retained constraints, “prepare but do not send/commit”, stale-state handling, and payload limits.
- [ ] Run focused tests and verify failure.
- [ ] Implement handlers as one-to-one application-service calls. Conversation state stores identifiers and pending intent, never balances as authority. Read tools are distinct from mutating tools and mutating tools require explicit confirmation/idempotency keys.
- [ ] Run MCP tests, route tests, typecheck, lint, and secret scan.
- [ ] Commit with `git add "lib/dealtwin/mcp/tool-schemas.ts" "lib/dealtwin/mcp/tool-handlers.ts" "lib/dealtwin/mcp/conversation-state.ts" "app/api/dealtwin/mcp/route.ts" "tests/dealtwin/mcp/tool-handlers.test.ts" "tests/dealtwin/mcp/multi-turn.test.ts" && git commit -m "feat: expose DealTwin services through MCP"`.

## Phase 11 — Evaluation and release hardening

### Task 27: Synthetic benchmark and deterministic ground truth

**Files:**
- Create: `evaluation/dealtwin/scenario-schema.ts`
- Create: `evaluation/dealtwin/generate-scenarios.ts`
- Create: `evaluation/dealtwin/exhaustive-oracle.ts`
- Create: `evaluation/dealtwin/run-benchmark.ts`
- Create: `evaluation/dealtwin/report.ts`
- Create: `evaluation/dealtwin/fixtures/core-scenarios.json`
- Test: `tests/dealtwin/evaluation/benchmark.test.ts`
- Modify: `package.json`
- Modify: `vitest.config.ts`

**Consumes:** compiler/recompiler, fixed-rule baseline, optional provider output captured under explicit run metadata.
**Produces:** reproducible scenario corpus, exhaustive bounded oracle, false-feasible/false-infeasible/duplicate/stale/replay/extraction/idempotency/race metrics, and machine-readable report.

**Interface signature contract:**

```ts
generateScenarios(seed: number, count: number): readonly EvaluationScenario[]; evaluateExhaustively(scenario: EvaluationScenario): OracleResult; runBenchmark(scenarios: readonly EvaluationScenario[]): BenchmarkReport;
```

**Behavioral RED/GREEN:** compute measured metric denominators and deterministic exhaustive oracle results. Run `npm.cmd test -- tests/dealtwin/evaluation/benchmark.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Write failing tests for seeded generation reproducibility, oracle agreement on hand-enumerated cases, metric denominators, missing-result failure, and refusal to print unmeasured/provider-missing claims.
- [ ] Run the focused test and verify failure.
- [ ] Implement an initial checked-in core corpus plus deterministic generator. Benchmark fixed rules and full compiler locally; include LLM-only only when the same input/tool context and captured provider evidence exist. Store run SHA, engine/provider versions, seed, counts, and failures. Extend coverage inputs and thresholds to the authoritative DealTwin domain, compiler, proof, recompiler, and application-service files.
- [ ] Run `npm.cmd run benchmark:dealtwin`, then independently replay every reported mismatch fixture.
- [ ] Commit with `git add "evaluation/dealtwin/scenario-schema.ts" "evaluation/dealtwin/generate-scenarios.ts" "evaluation/dealtwin/exhaustive-oracle.ts" "evaluation/dealtwin/run-benchmark.ts" "evaluation/dealtwin/report.ts" "evaluation/dealtwin/fixtures/core-scenarios.json" "tests/dealtwin/evaluation/benchmark.test.ts" "package.json" "vitest.config.ts" && git commit -m "test: add DealTwin financial benchmark"`.

### Task 28: Dependency, database, tenancy, and deployment security gate

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/security.md`
- Create: `docs/dealtwin/DEPLOYMENT.md`
- Modify: `tests/dealtwin/postgres/rls.test.ts` (complete policies and grants shipped in Task 13)
- Create: `tests/dealtwin/security/server-boundary.test.ts`
- Create: `evaluation/dealtwin/release-gate.ts`

**Consumes:** current dependency graph, Postgres roles/RLS, server config, Judge routes.
**Produces:** evidence-backed security disposition and fail-closed public deployment checklist.

**Interface signature contract:**

```ts
probeTenantAccess(databaseUrl: string, role: string, tenantId: string): Promise<TenantAccessEvidence>; evaluateReleaseGate(evidence: ReleaseEvidence): ReleaseGateResult;
```

**Behavioral RED/GREEN:** deny role escalation/reset/secret leakage and fail release gate on missing evidence. Run `npm.cmd test -- tests/dealtwin/postgres/rls.test.ts tests/dealtwin/security/server-boundary.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Capture `npm.cmd audit --json` and map current advisories to direct/transitive packages and reachable runtime paths; 26 was the September 11 baseline, not a current scan. Select compatible pinned upgrades; do not use `npm audit fix --force`.
- [ ] Add failing adversarial regression cases to the Task 13 RLS suite using two tenants and the least-privilege app role; assert cross-tenant select/insert/update/delete denial, owner/role behavior under forced RLS, reset denial, and no browser-exposed secrets.
- [ ] Implement `evaluateReleaseGate` as a pure evidence validator; add missing/failing/skipped evidence assertions in `tests/dealtwin/security/server-boundary.test.ts` before its implementation.
- [ ] Apply selected dependency upgrades one bounded group at a time, running focused regressions and build after each group. Any remaining high/critical issue blocks public deployment unless a current time-bounded risk decision identifies non-reachability and owner.
- [ ] Document TLS, pool sizing, environment variables, migration apply/rollback/backup/restore, Node VPS process model, health checks, log redaction, and exact-SHA artifact gate. Never publish a dev server.
- [ ] Run fresh audit, RLS tests, cross-tenant API tests, secret/local-path scan, typecheck, lint, full tests, coverage, and build.
- [ ] Commit with `git add "package.json" "package-lock.json" ".github/workflows/ci.yml" "docs/security.md" "docs/dealtwin/DEPLOYMENT.md" "tests/dealtwin/postgres/rls.test.ts" "tests/dealtwin/security/server-boundary.test.ts" "evaluation/dealtwin/release-gate.ts" && git commit -m "chore: harden DealTwin release boundary"`.

### Task 29: Final migration, race, Judge, and release evidence

**Files:**
- Create: `docs/dealtwin/VERIFICATION.md`
- Modify: `evaluation/dealtwin/release-gate.ts`
- Test: `tests/dealtwin/evaluation/release-evidence.test.ts`
- Modify: `docs/dealtwin/TRACEABILITY.md`
- Modify: `README.md`

**Consumes:** the complete application and immutable candidate commit SHA.
**Produces:** repository-specific evidence packet and closed traceability matrix.

**Interface signature contract:**

```ts
verifyEvidencePacket(evidence: ReleaseEvidence, requirements: readonly TraceabilityRequirement[]): ReleaseGateResult;
```

**Behavioral RED/GREEN:** reject missing, skipped, mismatched-SHA or failing release evidence. Run `npm.cmd test -- tests/dealtwin/evaluation/release-evidence.test.ts` before implementation; expected RED is a failed assertion for that missing behavior after minimal import/type scaffolding (syntax/configuration/import failures do not count as behavioral RED). Re-run the same command after the minimal implementation and require all assertions PASS, then run `npm.cmd run typecheck`. Integration suites from Task 13 use its disposable harness and fail when required database configuration is missing; earlier tasks use pure/in-memory tests, with a client fake in Task 12. This contract supplements the task's broader cases and commit boundary.

- [ ] Extend the release gate with `verifyEvidencePacket`; first prove the Task 29 behavioral RED with missing requirement evidence, skipped checks and mismatched candidate SHA, then implement only the evidence aggregation and require the focused test to pass.
- [ ] From a clean checkout, install dependencies and start a fresh disposable PostgreSQL instance. Apply migrations from zero, seed Judge state, and record schema migration rows and seed hash.
- [ ] Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run test:coverage`, `npm.cmd run benchmark:dealtwin`, and `npm.cmd run build`; record exact counts, duration, and any skips.
- [ ] Run the two-client race suite repeatedly, idempotency/failure-injection suite, proof replay/staleness suite, RLS cross-tenant suite, and migration backup/restore drill.
- [ ] Run the production-equivalent Playwright Judge journey at desktop, 1024px, and 820px; refresh between lifecycle steps and verify persistent server state.
- [ ] Run `npm.cmd audit`, credential/local-path scan, `git diff --check`, and `git status --short`. Confirm no real data, public dev server, unrelated file, or production database reference.
- [ ] Update traceability rows with exact test/report links and label every incomplete external live integration honestly. Review the strongest claims against direct evidence.
- [ ] Commit with `git add "docs/dealtwin/VERIFICATION.md" "evaluation/dealtwin/release-gate.ts" "tests/dealtwin/evaluation/release-evidence.test.ts" "docs/dealtwin/TRACEABILITY.md" "README.md" && git commit -m "docs: record DealTwin release evidence"`.

## Checkpoints

Self-review coverage: exact-money invariants; AP/AR double-count prevention; cash foundation; snapshot versioning; same-day ordering; proof generation; replay; stale invalidation; deterministic amendments; stress transforms; server transactions; commitment concurrency; idempotency; Judge reset; Nemotron; Alexa MCP; security; benchmark; and deployment evidence.

1. **Exact core:** Tasks 1–3. Value types and lifecycle contracts are stable.
2. **Financial engine:** Tasks 4–9. Cash, normalization, and pure Judge compilation are correct without AI.
3. **Proof:** Tasks 10–11. Canonical proof and genuine replay are verified.
4. **Durable authority:** Tasks 12–15. PostgreSQL Judge state, migrations, revision, and reset are real.
5. **No double promise:** Tasks 16–18. Reserve/commit/release and two-client race evidence pass.
6. **Adaptation:** Tasks 19–21. Staleness, stress, and deterministic amendments pass.
7. **Judge product:** Tasks 22–24. Workflow UI and end-to-end Judge path pass against server state.
8. **Competition integrations:** Tasks 25–26. Nemotron and Alexa+ are substantive but non-authoritative.
9. **Release candidate:** Tasks 27–29. Benchmark, security, migrations, build, and Judge evidence close.

Do not begin the next checkpoint when the current checkpoint’s invariant tests are failing. Do not merge, push, deploy, or connect a non-disposable database without explicit authorization.

## Planning-correction verification — 2026-09-12

This is documentation evidence only, not completion of any implementation task. Self-review retained 29 ordered tasks and 42 unique DT requirements; every task is mapped, every traceability module/test path is declared in the plan, and every task includes files, consumed/produced contracts, a behavioral RED/GREEN gate and an exact staging/commit boundary. Shared type ownership, transaction-port isolation, v11 migration coverage and dependency introduction order were checked. The Task 13 CLI timestamp binding is explicitly bounded; it does not authorize any additional migration or schema scope.

Independent exact-integer planning arithmetic enumerated all 2,457 allowed candidates for each of the original and mutated AP fixtures. Under base plus required +3-day stress, the original winner is deposit 25%, customer timing 14 days, supplier timing 6 days, minimum Rp5m; the Rp19m AP variant winner is 27%, minimum Rp5.2m. This calculation is not an implemented compiler, PostgreSQL probe, or Judge E2E result.

Fresh baseline: `npm.cmd run typecheck` passed; `npm.cmd test -- --reporter=dot` passed 56 files and 530 tests. The initial sandbox test attempt stopped at esbuild `spawn EPERM` before tests loaded; the authorized local rerun completed successfully. No dependencies were installed or upgraded. No product code, browser storage, database, infrastructure, push, merge, or deployment was changed by this correction. Implementation remains gated on user approval.
