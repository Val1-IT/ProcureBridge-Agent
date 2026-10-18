# DealTwin Locked Product Specification

Status: locked for implementation approval after planning review corrections
Date: 2026-09-12
Repository: `Val1-IT/ProcureBridge-Agent`
Baseline branch: `feature/balanced-distributor-mini-erp`
Baseline commit: `1b3f75905f39c75cc6c7e06b23a3f553e6b136fe`
Implementation branch: `feat/dealtwin-proof-carrying-commerce`

## 1. Product identity

DealTwin is **Proof-Carrying Commerce / Financial Compiler for Deals**.

Tagline: **Every deal should compile before you commit.**

DealTwin turns commercial terms into machine-verifiable constraints, proves whether the business can finance the promise against authoritative ERP reality, stress-tests feasible structures, produces a replayable Deal Proof, and reserves future liquidity so it cannot be promised twice.

The product question is: **Before we promise this deal, can the business actually finance the promise?**

The locked lifecycle is:

`DRAFT -> COMPILE -> PROOF -> RESERVE -> COMMIT -> STALE -> RECOMPILE`

Use compiler language consistently. The primary outcomes are `DOES_NOT_COMPILE`, `COMPILES`, `CONDITIONALLY_VALID`, `PROOF_GENERATED`, `PROOF_STALE`, and `LIQUIDITY_COLLISION`. Generic AI-confidence or advisory language must not replace deterministic outcomes.

## 2. Scope boundaries

DealTwin is not a generic AI ERP, CFO assistant, cash-flow dashboard, accounting chatbot, bank-reconciliation tool, general ledger, tax system, lending product, budgeting tool, fraud detector, invoice OCR system, production planner, or business-intelligence platform.

The MVP is deliberately narrow:

- one synthetic sandbox business and one currency (`IDR`);
- one active cash/bank account;
- a default 30-day planning horizon that expands when a decision-relevant obligation lies later;
- multiple open pre-commit deals;
- existing AP, AR, payments, inventory, reservations, supplier terms, and customer records;
- customer deposit, customer payment timing, supplier payment timing, no-borrowing, protected-obligation, and minimum-cash constraints;
- deterministic compile, explicit stress transforms, Deal Proof, replay, Commitment Ledger, staleness, deterministic recompilation, and ERP write-back;
- first-class Judge Mode with canonical seed and reset;
- substantive Nemotron/Nebius constraint extraction and orchestration;
- Alexa+ through application-level MCP tools.

The MVP excludes multi-currency, real bank transfers, lending, full tax, general-ledger journals, bank reconciliation, statutory accounting, full production planning, and unnecessary enterprise configuration.

## 3. Approved repository foundation

DealTwin is an extraction-ready subsystem inside the ProcureBridge codebase. It is based exactly on the distributor mini-ERP commit named above. It must not use ERP-Web/full Arvanta, the legacy `/collections` domain, or CALL-E recovery entities as the DealTwin domain model.

Existing ProcureBridge behavior remains supported. DealTwin uses explicit adapters and application services; it does not rewrite the ERP domain around PostgreSQL or import legacy recovery state into the financial compiler.

### 3.1 Existing-system map

| Area | Verified baseline | Reuse decision |
|---|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind 4, vinext/Vite | Reuse shell, component conventions, routing, and test setup. Add DealTwin routes; do not make a generic dashboard first. |
| Domain/backend | Pure TypeScript ERP commands and selectors; Next route handlers for existing server APIs | Reuse pure-command style and stable error results. Add server-only DealTwin application services. |
| Current browser state | Versioned `localStorage` demo repository with revision checks and Web Locks | Preserve for the existing ProcureBridge demo; never use it as authoritative DealTwin Judge state. |
| Database | Optional inactive Supabase/PostgreSQL migration with normalized tenant-scoped ERP tables and `erp_workspaces.revision` | Activate only through a new server `pg` adapter for DealTwin Judge Mode. Keep migrations provider-neutral PostgreSQL. |
| ORM | SQLite-oriented Drizzle scaffold plus `drizzle-orm`; no active Postgres adapter | Do not present SQLite Drizzle as the solution. Use `pg` for the smallest explicit transaction boundary. |
| Repository boundary | `ErpRepository.loadWorkspace`, `saveAtomic`, `appendAuditEvents` | Preserve this contract for ordinary loads/saves; add a transaction-scoped extension used by commitment-critical services. |
| Auth/tenancy | Demo roles in browser; tenant columns and RLS enabled in SQL, but no end-user policies | Judge Mode identifies one allowlisted sandbox tenant server-side. Public deployment requires real session-to-tenant binding, forced RLS, and least privilege. |
| Sales | Customer master, Sales Order commands, stock reservation through confirmed Sales Orders, delivery | Deal is pre-commit. Only COMMIT may create the operational Sales Order via `createSalesOrder`; no Deal/Sales Order aliasing. |
| Purchases/AP | Purchase request, RFQ, supplier quote, PO, goods receipt, supplier invoice, terms, due dates, partial payments | Normalize one payable economic obligation per source chain and subtract posted payments once. |
| AR/receipts | Customer invoice, due date, partial receivable payments | Normalize outstanding receivable once and distinguish expected receipt from posted cash. |
| Cash/bank | No authoritative cash account or balance | Add the minimal two ERP-native cash entities in section 7. |
| Inventory | Stock movements, one active warehouse, Sales Order reservation selectors | Reuse availability and reservation semantics. Preserve source provenance and prevent cash/COGS conflation. |
| Audit | Append-only `erp_audit_events` pattern | Reuse with `dealtwin.*` event names and versioned payloads; no parallel audit subsystem. |
| Tests | Vitest, 56 files and 530 passing tests at baseline | Extend with pure unit, repository integration, PostgreSQL race, route, UI, and Judge journey tests. |
| CI/build | GitHub Actions runs install, typecheck, lint, test/coverage, and build; Cloudflare/vinext deployment artifacts exist | Keep existing checks. The Node/Postgres Judge deployment is a separate, documented target. |

Fresh baseline verification on 2026-09-11: `npm.cmd test -- --reporter=dot` passed 56 files and 530 tests; `npm.cmd run typecheck` passed. `npm.cmd ci` reported 26 advisories (7 moderate, 16 high, 3 critical). These counts are evidence, not a waiver; section 16 is a release gate.

### 3.2 Gap analysis

| DealTwin capability | Baseline classification | Required change |
|---|---|---|
| ERP State Adapter | Partially reusable | Server adapter and normalized snapshot covering AP, AR, payments, inventory/reservations, terms, cash, and commitments. |
| Constraint Compiler | Missing | Schema-validated AI extraction with deterministic normalization and explicit unresolved fields. |
| Deterministic Deal Compiler | Missing | Pure bigint/fixed-point event engine; no LLM arithmetic. |
| Stress Lab | Missing | Named, versioned deterministic transforms with recorded parameters. |
| Deal Proof and replay | Missing | Canonical inputs, dependency manifest, hashes, engine version, genuine recomputation. |
| Commitment Ledger | Missing | PostgreSQL transaction, tenant serialization, idempotency, lifecycle, collision result and audit. |
| Proof invalidation | Missing | Material dependency keys and automatic staleness after server ERP changes. |
| Deal Recompiler | Missing | Bounded lexicographic search over allowed amendments; explicit no-solution result. |
| Authoritative cash | Missing | Cash account/opening balance and append-only dated cash movements. |
| Durable Judge Mode | Conflicts with browser-only baseline | Server-owned sandbox tenant, PostgreSQL seed/reset, session isolation, no real data. |
| Auth/tenant isolation | Partially reusable | Server session boundary and public-deployment RLS/least-privilege gate. |
| Exact financial values | Conflicts with existing `number` money | DealTwin exact-money DTO boundary; convert only validated safe-integer legacy values. |

## 4. Architectural boundary

DealTwin code lives under `lib/dealtwin`, server persistence under `lib/server`, APIs under `app/api/dealtwin`, UI under `app/dealtwin` and `components/dealtwin`, and tests under `tests/dealtwin`.

The dependency direction is:

`UI/API -> application services -> DealTwin ports -> pure compiler/domain`

`PostgreSQL adapters -> DealTwin ports and existing ErpRepository`

The pure compiler has no React, browser storage, network, database, provider SDK, or wall-clock dependency. Time, IDs, engine version, policies, and stress parameters are inputs. The AI adapter may produce candidate constraints but cannot approve them, query raw database state, calculate authoritative feasibility, reserve liquidity, or commit a deal.

Extraction readiness means the domain and application ports do not import Next.js or `pg`; moving `lib/dealtwin` to a package later must not change its public contracts.

## 5. Exact value contracts

### 5.1 Money

Authoritative money is branded `bigint` in whole rupiah:

```ts
type Rupiah = bigint & { readonly __brand: "Rupiah" };
type BasisPoints = number & { readonly __brand: "BasisPoints" };
```

`BasisPoints` is a validated safe integer; `10_000` means 100%. Multiplication uses bigint numerator/denominator helpers. Conservative projections round inflows down and outflows up. No authoritative financial path uses JavaScript `number`, `parseFloat`, binary floating point, or locale-formatted input.

PostgreSQL stores money as `bigint`. SQL and `pg` mappers read and write base-10 strings. JSON APIs encode rupiah and hashes as strings. Parsers accept canonical base-10 integers only; formatted IDR input is normalized at the UI boundary before reaching domain code.

### 5.2 Dates and same-day order

A cash event contains an ISO calendar date, `sameDayOrder`, stable `eventId`, source dependency key, direction, amount, certainty, and ordering source. Sort order is `(date, sameDayOrder, eventId)`.

The conservative policy is locked:

| Order | Event class |
|---:|---|
| 0 | opening balance anchor |
| 100 | confirmed cash outflow |
| 200 | active DealTwin reserved/committed outflow |
| 300 | expected or assumed outflow |
| 400 | confirmed cash inflow |
| 500 | expected or assumed inflow |

Known source ordering may use a unique explicit integer supplied with evidence. Unknown ordering either receives the documented conservative class with `orderingSource: "conservative"` or becomes `orderingSource: "unresolved"`; unresolved decision-relevant ordering yields `UNRESOLVED_SAME_DAY_ORDER`, never a favorable assumption.

### 5.3 Cash certainty

Event certainty is `confirmed`, `reserved`, `expected`, or `assumption`. A signed quote, accepted deal, issued invoice, or expected receipt is not confirmed cash. Append-only original and compensating reversal cash movements are confirmed. Projections report the minimum confirmed balance and minimum projected balance separately.

### 5.4 `DealTermsV1`

The first canonical commercial-terms contract is fixed:

```ts
interface DealTermsV1 {
  schemaVersion: "dealtwin.deal-terms.v1";
  currency: "IDR";
  customerId: string;
  warehouseId: string;
  acceptedDate: IsoDate;
  productLines: readonly {
    lineId: string;
    productId: string;
    quantity: number;
    unitPriceRupiah: Rupiah;
  }[];
  customerPaymentEvents: readonly [
    {
      eventId: string;
      role: "customer_deposit";
      basisPoints: BasisPoints;
      daysFromAcceptance: 0;
      effectiveDate: IsoDate;
      sameDayOrder: number;
    },
    {
      eventId: string;
      role: "customer_balance";
      basisPoints: BasisPoints;
      daysFromAcceptance: number;
      effectiveDate: IsoDate;
      sameDayOrder: number;
    }
  ];
  directCostEvents: readonly {
    eventId: string;
    role: "direct_cost";
    supplierId: string | null;
    productLineIds: readonly string[];
    amountRupiah: Rupiah;
    daysFromAcceptance: number;
    effectiveDate: IsoDate;
    sameDayOrder: number;
    orderingSource: OrderingSource;
    provenance: SourceProvenance;
  }[];
}
```

Quantities and all day/order fields are positive or non-negative safe integers as appropriate; product and event IDs are unique; the two customer basis-point values sum to `10_000`; effective dates equal `acceptedDate + daysFromAcceptance`; every direct-cost event references existing product lines; and customer revenue equals the exact sum of `quantity * unitPriceRupiah`. Deposit rupiah is rounded down once and customer balance is the exact revenue remainder, so no rupiah is lost. `canonicalizeDealTermsV1` sorts product lines, product references, and direct-cost events by stable IDs while preserving the fixed deposit-then-balance tuple, then emits decimal-string money.

Zero deposit or balance basis points are permitted; their zero-valued cash event is omitted from the timeline but retained in the canonical terms tuple. Both customer entries use the conservative expected-inflow order unless an explicit evidence-backed policy overrides it. `OrderingSource` is `"explicit" | "conservative" | "unresolved"`. `SourceProvenance` contains `sourceType`, `sourceId`, `sourceRevision` (canonical integer string), and `evidence` (non-empty source description); Task 2 owns these terms-level types, and later cash-event types reuse them.

The legacy Sales Order bridge is isolated in `toLegacySalesOrderInput`. It converts a quantity or unit price to `number` only after checking `Number.isSafeInteger`, positive range, and the round trip `BigInt(converted) === original`. Every line product and the order total must also fit a safe integer. It returns the actual legacy `SalesOrderInput` shape: `{ customerId, warehouseId, lines: [{ productId, quantity, unitPrice }] }`; canonical `lineId` remains in DealVersion, not in the legacy input. Duplicate product IDs are rejected to match the legacy command. A value outside that bridge returns `LEGACY_SALES_ORDER_VALUE_OUT_OF_RANGE`; it never truncates, rounds, or writes a partial Sales Order. DealTwin calculations remain bigint before and after the bridge.

## 6. Core contracts and lifecycle

### 6.1 Deal and constraints

A `Deal` is a commercial proposal before operational acceptance. Each edit creates an immutable `DealVersion`. A version owns normalized `CommercialConstraint` records and candidate terms. Its lifecycle cannot skip the proof and reservation gates.

Supported initial constraint kinds are:

- `customer_deposit_max_bps`;
- `customer_deposit_min_bps`;
- `customer_balance_due_days`;
- `supplier_payment_due_days`;
- `protect_existing_supplier_due_dates`;
- `new_borrowing_allowed` (must be false in MVP);
- `minimum_cash_rupiah`;
- `required_inventory_available`;
- `required_approval`.

Every constraint records provenance (`user_confirmed`, `erp_policy`, `ai_extracted`, or `judge_seed`), normalized value, resolution state, and source text where applicable. AI-extracted material constraints require explicit user confirmation unless they exactly restate a locked Judge seed field.

### 6.2 ERP State Adapter

The adapter returns one `CanonicalErpSnapshot` containing:

- tenant and ERP revision;
- as-of time and effective horizon;
- the active cash account and current balance evidence;
- normalized existing AP outflows and AR inflows;
- posted payments represented as cash movements, not again as open AP/AR;
- inventory availability net of existing Sales Order reservations;
- relevant customer/supplier terms and source-document provenance;
- active DealTwin commitments;
- stable dependency keys, content hashes, canonical state hash, and adapter version.

Economic-chain deduplication is mandatory. PO, goods receipt, supplier invoice, and supplier payment may describe one obligation. The snapshot chooses the most authoritative stage, carries upstream provenance, subtracts posted payments once, and never treats on-hand inventory cost as a new cash outflow.

### 6.3 Deterministic compiler

`compileDeal(input: CompileInput): CompileResult` builds the canonical event timeline, validates constraints, expands the horizon when a relevant obligation would otherwise be hidden, and walks balances using exact arithmetic.

The result is one of:

- `COMPILES`;
- `CONDITIONALLY_VALID` with unresolved approvals that do not alter arithmetic;
- `DOES_NOT_COMPILE` with stable reason code, first violating date, cash floor, shortfall, conflicting commitment IDs, and worst liquidity point;
- `UNRESOLVED` when a decision-critical assumption has no approved conservative treatment.

The compiler is pure and works without AI.

### 6.4 Stress Lab

Initial named transforms are:

- customer receipt delayed by 3, 7, or 14 calendar days;
- direct deal outflow increased by 500 basis points;
- a specified receipt delayed by an exact number of days;
- a specified new obligation inserted with exact amount/date/order.

Each transform records its type, parameters, input hash, output hash, and compile result. Stress claims name only the executed scenarios; they never imply universal safety.

### 6.5 Deal Proof and replay

A proof records the deal/version, snapshot/revision, normalized constraints, candidate terms, canonical cash events, cash-floor policy, base compile result, stress runs, assumptions, unresolved approvals, engine/adapter/canonicalization versions, dependency manifest, timestamps, and proof hash.

Proof states are `VALID`, `CONDITIONALLY_VALID`, `STALE`, and `INVALID`. `Replay Proof` deserializes the stored canonical inputs and invokes the current compatible engine. It compares the recomputed canonical result hash to the stored result hash. Merely redisplaying stored output is forbidden. Unsupported engine versions or hash mismatch return explicit replay failure and never silently refresh the proof.

`CONDITIONALLY_VALID` is reservable only when every unresolved item is a non-arithmetic authorization over already fixed events and amounts. Any unresolved item that can change amount, date, certainty, order, inventory availability, or cash-floor arithmetic blocks both proof reservation and commitment. `COMMIT` is always blocked until every blocking approval is approved. The approval decision does not silently rewrite terms; a terms change creates a new DealVersion and proof.

The immutable proof retains the approval snapshot used at generation. COMMIT separately reads current tenant/proof/version-bound approval rows under the workspace lock. A decision over those same fixed terms changes authorization, not cash-event hashes, and does not itself stale the proof; rejection still blocks COMMIT. This preserves genuine historical replay while allowing the approved conditional proof to commit.

### 6.6 Proof dependencies and staleness

Dependencies use stable keys such as `erp.invoice:<id>`, `erp.payment:<id>`, `erp.cash_movement:<id>`, `erp.stock:<productId>:<warehouseId>`, and `dealtwin.commitment:<id>`, each with a content hash.

The manifest also hashes tenant-scoped query sets/ranges for open AP, open AR, cash, stock and active commitments. Newly inserted relevant records must invalidate those set dependencies even when their individual IDs were absent from the original proof. Self filtering affects only the exact owner's commitment within that query hash; it never hides another new commitment or an ERP mutation.

Every server ERP mutation publishes its changed dependency keys inside the same transaction. Valid/conditional proofs whose manifests intersect a changed key are marked `STALE`, with the changed keys and current revision recorded in a namespaced audit event. A revision change with no material dependency hash change triggers dependency revalidation but does not automatically stale unrelated proofs.

Self-reservation is identified only by the exact tuple `(proofId, dealVersionId, canonicalEventHash)`. When a reservation is created for that tuple, its commitment dependency does not stale its owning proof. When that proof is replayed or committed, the matching active commitment is excluded from external commitments and its canonical events are supplied exactly once as the candidate/self events. A same-proof row with a different version or event hash is not self and causes fail-closed stale/conflict handling. Other proofs that depend on the changed capacity are revalidated or marked stale normally. Releasing, expiring, or cancelling the exact self-reservation does not itself stale the owner proof, but it still revalidates other affected proofs.

### 6.7 Deal Recompiler

The MVP search space is finite and deterministic:

1. deposit basis points from the current value through the allowed maximum in 100-basis-point steps;
2. customer balance timing from the current value toward the earliest allowed day in one-day steps;
3. supplier timing from the current value toward the latest approved day in one-day steps, only when supplier approval is permitted.

Candidate eligibility requires a passing base compile plus every explicitly required stress scenario in the amendment policy; optional stress results do not silently change eligibility. Non-arithmetic pending approvals may produce a conditionally valid candidate under section 6.5. Candidate ranking is lexicographic: fewest changed fields, then smallest total normalized step count, then smallest deposit increase, then smallest customer-timing change, then smallest supplier-timing change, then canonical term hash. The same inputs always produce the same candidate. Empty feasible sets return `NO_FEASIBLE_AMENDMENT`.

### 6.8 Commitment Ledger and ERP write-back

`RESERVE` creates a planning reservation; it is not a transfer or journal entry. `COMMIT` promotes an eligible reservation and creates the ERP Sales Order using the existing domain command. The Deal remains a distinct pre-commit record and stores the resulting Sales Order ID only after successful write-back.

Commitment lifecycle states are `reserved`, `committed`, `released`, `expired`, and `cancelled`. Every row stores `proof_id`, `deal_version_id`, and the hash of its canonical reserved events. Only reserve, commit, and release have dedicated idempotency-key columns on the commitment row. Expire and cancel still accept operation-specific idempotency keys, but those keys exist only in their immutable namespaced audit receipts; they add no commitment columns and never reuse the release key. A repeated successful request returns the original operation result without duplicate commitment, audit, approval, or Sales Order.

The immutable source for original-response replay is the existing append-only `erp_audit_events` row for the successful namespaced operation. Its scalar detail stores `operationSucceeded: true`, `idempotencyKey`, `requestHash`, canonical `responseJson` as a string, and `responseHash`. A unique partial expression index on `(tenant_id, action, detail->>'idempotencyKey')`, restricted to `action LIKE 'dealtwin.%' AND detail->>'operationSucceeded' = 'true'`, prevents duplicate success evidence; successful rows require all receipt fields to be non-null. Retries compare request hash and return the stored response even if the commitment lifecycle row has since changed; the same key with a different request returns `IDEMPOTENCY_KEY_REUSED`.

## 7. Minimal authoritative cash foundation

Only two ERP-native entities are added:

### `erp_cash_accounts`

One active IDR account per tenant, enforced by a partial unique index. Fields include tenant/id, code/name, currency, `opening_balance_rupiah bigint`, `opening_balance_date date`, opening provenance, active flag, and timestamps.

### `erp_cash_movements`

Append-only confirmed cash evidence. Fields include tenant/id, account, effective date, same-day order, direction, positive `amount_rupiah bigint`, entry kind (`original` or `reversal`), nullable `reverses_movement_id`, source type, source ID, source revision, actor, reason, and timestamps. Original rows are never updated or deleted.

Cancellation inserts one compensating reversal with the same amount, opposite direction, the original account, an effective date/order at or after the original, `source_type = 'cash_movement_reversal'`, and `source_id` equal to the original movement ID. The reversal references an original—not another reversal—through a tenant-scoped FK. A partial unique index on `(tenant_id, reverses_movement_id)` permits at most one reversal. The command locks the original, verifies that amount/account/opposite direction and non-reversal rules hold, and inserts both reversal provenance and audit evidence atomically. Unique `(tenant_id, source_type, source_id)` provenance prevents a posted ERP payment or reversal from being recorded twice.

Current cash equals the opening anchor plus every original and reversal movement after it, with signed direction applied. A movement on the opening date is included after the anchor according to `(effective_date, same_day_order, id)` and therefore must have `same_day_order > 0`; a movement before the opening date or at opening order 0 is rejected. Projected events come from remaining AP/AR, candidate deal terms, and active DealTwin commitments; they are not inserted as confirmed cash movements.

## 8. Persistent data model

The DealTwin persistence model has exactly these eight initial tables:

1. `dealtwin_deals` — tenant, identity, title, customer, status, current version, committed Sales Order reference, timestamps.
2. `dealtwin_deal_versions` — immutable version, canonical terms JSON, terms hash, creator, timestamp.
3. `dealtwin_constraints` — version, stable position, kind/operator, canonical value JSON, provenance, resolution, approval requirement.
4. `dealtwin_erp_snapshots` — ERP revision, as-of/horizon, adapter version, dependency keys/manifest, canonical event JSON, state hash.
5. `dealtwin_compile_runs` — version/snapshot, base/stress/recompile kind, engine version, input/result hashes, outcome, exact minima, violation data, parent run.
6. `dealtwin_proofs` — compile run, proof/result hashes, status/stale reason, dependency keys, canonical proof JSON, generated/replayed metadata.
7. `dealtwin_approvals` — version/proof, requirement code, status, decision actor/time/comment, decision idempotency key.
8. `dealtwin_liquidity_commitments` — proof/version/account, canonical event hash and dated ordered events, exact amount/direction, lifecycle, separate reserve/commit/release idempotency keys, expiry/release evidence, timestamps.

There is no conflict table and no DealTwin audit table. Conflicts are compile/reservation results plus `dealtwin.commitment.conflict` in `erp_audit_events`.

All rows are tenant-scoped. Foreign keys include tenant ID, FK columns are indexed, status/value constraints are database-enforced, timestamps use `timestamptz`, and active/status query paths use composite or partial indexes. RLS is enabled and forced. The `dealtwin_app` NOLOGIN role receives only required SELECT/INSERT/UPDATE privileges and no table DELETE or audit UPDATE/DELETE privilege. The separate `dealtwin_judge_reset` NOLOGIN role receives reset-only privileges constrained by forced RLS to tenant `dealtwin-judge-v1`; deployment login roles may inherit one of these roles but not both.

## 9. PostgreSQL and transaction strategy

The server adapter uses `pg`/node-postgres with one process-level `Pool`. Money and revision columns are selected as text and mapped explicitly. A transaction checks out one client and uses that client for every statement through `BEGIN`, `COMMIT`/`ROLLBACK`, and `release`. No LLM/provider/network call runs while locks are held.

The natural tenant serialization primitive is the existing `erp_workspaces` row:

```sql
select revision
from public.erp_workspaces
where tenant_id = $1
for update;
```

Every DealTwin commitment operation and every server-authoritative ERP write for the Judge tenant acquires this row first. Immediately after `BEGIN`, the checked-out client executes parameterized `select set_config('app.tenant_id', $1, true)`; every query also includes an explicit parameterized `tenant_id = $n` predicate. Forced RLS uses `tenant_id = current_setting('app.tenant_id', true)`. Additional rows are locked in stable table/key order. A local statement timeout bounds lock duration. This avoids a separate lock table and makes the revision row the single ordering point for cash, proofs, commitments, and ERP write-back.

The commitment transaction is:

1. identify the authenticated, allowlisted sandbox tenant before checkout;
2. compute AI/provider outputs outside the transaction;
3. begin a PostgreSQL transaction on one checked-out client;
4. lock the tenant workspace row;
5. read immutable namespaced audit evidence for the operation-specific idempotency key, verify request hash, and return the stored success when present;
6. read the authoritative revision and verify expected revision plus proof dependency hashes;
7. if material dependencies changed, mark the proof stale and append `dealtwin.proof.stale`, commit only that evidence, and return a stale result;
8. recompute current liquidity from locked authoritative cash, open AP/AR, and active external commitments, excluding only an exact self-reservation tuple;
9. compile the requested reservation/commit with the exact self events included once and verify its canonical event hash;
10. on collision, append `dealtwin.commitment.conflict`, commit only audit evidence, and return the stable conflict result;
11. insert or transition the commitment using a constrained update;
12. for COMMIT, pass the fixed terms through the fail-closed legacy bridge, run the existing `createSalesOrder` domain command, and persist its normalized ERP delta in the same transaction;
13. adopt exactly the proposed next ERP revision from `createSalesOrder` (or propose `current + 1` for a non-ERP reservation mutation), invalidate proofs through the transaction-local primitive with the exact self exemption, and append operational plus immutable idempotency audit evidence;
14. commit; on any unexpected error, roll back all commitment and ERP changes and release the client.

The persistence adapter never adds another revision increment: it requires `nextState.revision === expectedRevision + 1` and stores that exact value. A successful COMMIT therefore creates one Sales Order, advances the workspace revision once, appends one Sales Order operational audit from the legacy command plus DealTwin operation evidence, and rolls everything back on failure. The unique idempotency audit index is the final defense against retries. Expected-revision mismatch never overwrites state. The race test must use two independent pooled clients and prove exactly one of two colliding reservations succeeds.

## 10. Judge Mode

Judge Mode is server-authoritative and uses a dedicated synthetic tenant. It requires no real company data, payment, external AI call, or production ERP connection. One click resets and loads a canonical scenario; reset is rejected outside the allowlisted Judge tenant and executes under the same tenant lock.

Canonical initial state:

- `asOfDate`: `2026-09-12`, 30-day default horizon through `2026-10-12`;
- opening cash anchor: Rp30,000,000 on `2026-09-12`, order 0;
- existing supplier obligation: Rp18,000,000 on `2026-09-15`, order 300;
- existing outstanding AR: Rp20,000,000 expected on `2026-09-20`, order 500; this is projected cash, not a confirmed receipt;
- minimum cash: Rp5,000,000;
- candidate revenue: Rp60,000,000;
- direct cost: Rp42,000,000;
- customer maximum deposit: 40%;
- initial deposit: 20% = Rp12,000,000 on `2026-09-16`, order 500;
- initial customer balance: 80% = Rp48,000,000, 14 days after acceptance on `2026-09-30`, order 500;
- initial supplier/direct-cost timing: 6 days after acceptance on `2026-09-22`, order 300;
- contribution before overhead/tax: Rp18,000,000.

The initial projected timeline is Rp30,000,000 -> Rp12,000,000 -> Rp24,000,000 -> Rp44,000,000 -> Rp2,000,000 on `2026-09-22`. Against the Rp5,000,000 floor, the exact shortfall is Rp3,000,000. Customer inflow scheduled for the same day as an outflow is evaluated after the outflow and cannot mask the failure.

The Judge amendment policy searches deposit 20%–40% in 100-bps steps, customer balance 14 down to 2 days in one-day steps, and supplier/direct-cost timing 6 up to 14 days in one-day steps. All dates are anchored to acceptance `2026-09-16`. A candidate must pass both base compile and the required +3-day stress on this deal's customer receipts (existing AR is unchanged). The exact lexicographic winner changes only deposit from 2,000 to 2,500 bps: Rp15,000,000 deposit and Rp45,000,000 balance. Customer balance timing remains 14 days and direct-cost timing remains 6 days. Its projected minimum is exactly Rp5,000,000 on `2026-09-22`; +3-day stress moves deposit to September 19 and balance to October 3 and preserves that minimum. Deposit 24% fails by Rp600,000. The alternative single-field customer timing change requires 12 steps, and supplier timing alone cannot pass; the winning deposit change requires five steps. One non-arithmetic `owner_commercial_exception` approval over fixed terms remains pending.

Use one synthetic product `judge-product-a`, quantity 1, `unitPriceRupiah = 60000000n`, customer `judge-customer-a`, warehouse `judge-warehouse`, supplier `judge-supplier-a`, and account `judge-cash`. Inventory is empty; the Rp42m direct cost explicitly funds new procurement, and COMMIT creates a draft Sales Order without falsely confirming stock availability. Existing AR uses a separate fulfilled/invoiced historical ERP source chain. Seed all source documents, posted-delivery/receipt movements, and exact invoice balances required by the existing ERP validator.

Collision fixture B is a distinct proposal accepted September 16 for quantity 1 of `judge-product-b` at Rp8m, using the same customer/warehouse/supplier/account. Its deposit is zero (September 16/order 500; no timeline event); its 10,000-bps balance is paid 19 days later on October 5/order 500, and its direct cost Rp5m falls 7 days later on September 23/order 300. It compiles alone against the initial ERP state, but after A is reserved/committed it breaches the floor by Rp5m on September 23. Preserve event order when wrapping A's canonical events as commitments; do not reclassify them or add them again from its draft Sales Order.

The allowlisted Judge mutation changes only `judge-existing-ap` from Rp18m to Rp19m, keeping September 15/order 300. It creates real revision/dependency change and stales A. Recompilation evaluates replacement terms by excluding A's old commitment only after verifying its owner tuple; this is a projection, never an automatic release of occupied capacity. The new smallest deposit is 27% (Rp16.2m), with minimum Rp5.2m; 26% fails by Rp400,000. The Judge journey ends this branch at the proposed new version/proof: an already committed A retains its original commitment and single Sales Order, with remediation visibly pending. This MVP does not silently revise a committed Sales Order or allow a second COMMIT for the same Deal. A still-reserved (not committed) aggregate may be replaced atomically only with a newly proved version and capacity recheck. Replay of the old immutable proof still reproduces its historical result and reports current status STALE separately.

The real engine must demonstrate:

1. unsuitable initial timing does not compile;
2. the exact date, constraint, and shortfall are visible;
3. constraints can be supplied/confirmed;
4. the deterministic recompiler finds a feasible candidate when one exists;
5. named stress cases run;
6. a replayable proof is generated;
7. unresolved approvals remain visible;
8. liquidity is reserved only at the correct lifecycle state;
9. a second deal cannot double-use capacity;
10. a relevant ERP change makes the proof stale;
11. recompilation uses the new state;
12. replay recomputes the conclusion.

Reset deletes and reseeds only the allowlisted synthetic tenant inside one transaction under the separate Judge-reset role, restores canonical business IDs/dates, and advances the existing revision once without rewinding it. It retains immutable operation audit receipts, including prior reset receipts, so an old successful key replays its original response instead of re-executing. The canonical business seed hash excludes revision, audit history, and generated operation timestamps. Removed proofs cannot authorize commands after reset. Reset never runs against production data. Existing ProcureBridge browser Judge/demo state remains separate and functional.

## 11. Required product surfaces

The DealTwin app provides:

1. Deal Inbox;
2. Deal Compiler;
3. Deal Proof;
4. Commitment Timeline;
5. ERP Sandbox/source-of-truth view;
6. Judge Mode guide/reset.

The UI makes failure reason, violation date, shortfall, assumption, collision, changed dependency, and unresolved approval visually obvious. All visible results come from real application services; there are no hard-coded success screens.

## 12. AI and agent integrations

### Nebius/Nemotron

Nemotron through Nebius materially powers commercial-language interpretation, missing-information detection, constraint candidates, tool selection, and faithful explanations. Its output is schema-validated, non-authoritative, and recorded with model/prompt/schema versions. Malformed or unsupported output fails closed. The deterministic compiler alone decides financial feasibility.

### Alexa+ MCP

MCP exposes typed DealTwin application services such as draft/update Deal, extract/confirm constraints, compile, stress, generate/replay proof, reserve/commit/release, inspect timeline, mutate allowlisted Judge ERP state, and recompile. It exposes no SQL or raw database operation. Multi-turn conversation state refers to durable Deal/Version/Proof IDs and preserves confirmed constraints.

## 13. Evaluation

The evaluation suite grows from exhaustive small cases toward roughly 100–250 synthetic cases if schedule permits. Ground truth comes from deterministic exhaustive evaluation for bounded cases. Required measured metrics include false feasible, false infeasible, duplicate commitment, missed staleness, replay mismatch, extraction correctness, idempotency, race behavior, and same-day ordering.

Baselines are a fixed-rule decision, LLM-only with equivalent supplied context where appropriate, and the full DealTwin compiler. Only measured results may be published.

## 14. Security and data rules

- No credentials, service-role keys, or database URLs reach browser bundles or logs.
- No real customer or financial data is used in Judge Mode.
- No public dev server or unauthenticated reset endpoint is permitted.
- Route inputs, AI outputs, canonical JSON, money strings, IDs, and idempotency keys are schema-validated with size limits.
- Tenant identity comes from the authenticated server session, never from a trusted request body. Each transaction sets the tenant context locally on its one checked-out client and still uses parameterized tenant predicates.
- SQL is parameterized; dynamic table/column identifiers are prohibited in application requests.
- Public deployment requires forced RLS, least-privilege application credentials, TLS, backup/restore evidence, and migration verification on a disposable database.
- Dependency remediation is reviewed package by package; breaking automatic audit fixes are forbidden.

## 15. Release evidence and definition of success

Before a phase is called complete, run its focused tests plus proportionate typecheck, lint, full tests, coverage, build, migration, database, concurrency, and browser evidence. A build does not prove a migration, a skipped E2E test does not pass, and a static inspection does not prove a race invariant.

The competition vertical slice succeeds only when a judge can load the synthetic scenario, see a profitable-looking deal fail, understand the exact violation, confirm constraints, obtain and stress a deterministic amendment, generate and replay a proof, reserve and commit liquidity, see a second collision rejected, mutate relevant ERP state, observe automatic staleness, and recompile—all from real code and durable server state.

## 16. Public-deployment gate

Public Judge deployment is blocked until all of the following are evidenced:

- the current 26 dependency advisories are triaged against the installed graph and critical/high findings are removed or documented with a current, time-bounded risk decision;
- install, typecheck, lint, full tests, coverage, and production build pass from a clean checkout;
- PostgreSQL migrations apply and roll back/restore safely on a disposable database;
- exact-money, double-count, replay, invalidation, idempotency, and two-client race tests pass;
- forced RLS and least-privilege tests prove cross-tenant denial;
- Judge reset is sandbox-only and canonical;
- authenticated production-equivalent browser smoke proves the full Judge path;
- no real data, secret, local path, or public development server is present.

No production infrastructure or production database is touched without a separate explicit deployment authorization.
