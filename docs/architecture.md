# Distributor Mini ERP architecture

## Runtime model

```text
Page / component
    -> user intent
Pure ERP command + role permission + invariant checks
    -> success: one next ErpState + one revision + audit evidence
Private DemoStore commit closure
    -> validated browser persistence v10 + cross-tab synchronization
Dashboard / linked modules / unified audit
```

Rejected commands return the original `ErpState`. Pages cannot dispatch an ERP snapshot replacement: the public demo-store dispatcher exposes legacy actions only, while the revision-checked ERP commit capability is held privately by the provider and passed to the command provider.

## Module boundaries

| Boundary | Main locations | Responsibility |
| --- | --- | --- |
| Pages and UI | `app/`, `components/erp/`, `components/supplier-call/` | Render current state, collect intent, show stable errors and allowed actions. |
| ERP command boundary | `lib/erp/commands/` | Authorize roles, validate state/input, and atomically mutate purchasing, inventory, sales, finance, or Supplier Agent state. |
| Policies/transitions | `lib/erp/permissions.ts`, `lib/erp/guardrails/`, `lib/erp/transitions/` | Permission matrix, call eligibility, and legal document transitions. |
| Selectors/read models | `lib/erp/selectors.ts`, `lib/erp/selectors-finance.ts`, `lib/erp/dashboard.ts` | Derive stock, balances, linked rows, metrics, actions, and approvals from source records. |
| Demo repository | `lib/demo/persistence.ts`, `components/demo-store-provider.tsx` | Validate, migrate, persist, synchronize, reset, and recover browser Demo Data. |
| Supplier provider | `lib/supplier-call/`, `lib/server/supplier-call-authorization.ts` | Isolate mock execution and enforce server-owned authorization/claims. |
| Optional production boundary | `lib/repository/erp-repository.ts`, `lib/repository/mappers/erp-*`, `supabase/` | Inactive repository contract, row mappers, and tenant-scoped SQL foundation. |
| Preserved legacy recovery | `/collections`, `lib/calle/`, legacy repository mappers | Existing ProcureBridge demo, separate from the ERP Supplier Agent. |

## Atomic command model

The command modules are split into `master-data`, `purchasing`, `inventory`, `sales`, `finance`, `supplier-calls`, and `supplier-results`. Each rechecks permissions and authoritative state. Success advances the exact next revision and appends safe scalar audit detail. Multi-entity effects commit together; validation failure commits none.

Examples:

| Approved action | Atomic effects |
| --- | --- |
| Goods Receipt | Approve receipt, advance PO, append inbound movements and audit. |
| Sales confirmation | Validate complete availability, activate derived reservation, append audit. |
| Delivery | Recheck reservation/stock, append outbound movements, advance documents and audit. |
| Supplier invoice | Derive exact lines from approved receipt evidence; create payable without changing stock. |
| Customer invoice | Derive exact lines from posted delivery evidence; create receivable without changing stock. |
| Payment | Validate remaining balance; post partial/full payment and update invoice status. |
| Supplier result | Update commitment/follow-up or open dispute; never mutate stock, invoices, payments, order quantity, or approved price. |

The browser repository is not a database transaction system. This domain contract must be preserved by a future `saveAtomic(tenantId, expectedRevision, state)` implementation.

## State and persistence v10

`DemoState` contains preserved legacy recovery collections and nested `ErpState`. Current schema/storage version is **10** at `arvanta-distributor-mini-erp-demo-v10`. Fallback reads cover v9 through v3 plus legacy ProcureBridge v2.

Migration validates legacy collections and ERP relationships and does not invent non-provable provenance. Invalid JSON/schema fails closed to deterministic seed data and a fresh session, with a recovery reason for the UI. Current-key changes synchronize across tabs. Reset creates a new valid session and deterministic v10 state. The guided session lives in `sessionStorage` and keeps a separate exact pre-demo snapshot for **Exit & Restore**.

Stock totals are derived: physical from signed movements, reserved from active undelivered Sales Order lines, available as physical minus reserved, and incoming from open PO quantities minus approved receipts.

## Supplier Agent sequence

```text
Follow-up queue -> Supplier Brief -> human-approved scope -> eight guardrails
-> same-origin POST /api/supplier-calls?forceMock=1
-> MockSupplierCallProvider (in-memory, no network I/O)
-> deterministic transcript/result draft -> human review -> limited ERP command -> audit
```

The API trusts IDs plus a validated demo session and optional mock-only clock. It reloads supplier, PO, draft call, approval, same-day history, and disputes from the server repository. An atomic claim covers call idempotency and supplier/PO/local-date uniqueness.

Current composition owns `DemoSupplierCallAuthorizationRepository` and defaults to mock. CALL-E credentials passed to this route are inert and do not select live. Future live selection requires explicit server composition, production authorization, and production repository capability; the current composition provides none.

## Optional Supabase/PostgreSQL foundation

The migration defines tenant-scoped tables, constraints, indexes, RLS, revoked `anon`/`authenticated` table access, and service-role privileges. Stock movements and audit events are append-only for service role (`select, insert`; no update/delete).

It is inactive: no Supabase client is selected by the demo UI; `SUPABASE_*` variables are not consumed by default; no migration was applied or live RLS-tested; and `ErpRepository` has no production adapter/composition. SQL row constraints do not replace whole-state validation.

Activation requires an authorized environment, applied/verified migration, verified identity-to-tenant mapping, a server-only adapter, secure service-role handling, atomic transactions, RLS/cross-tenant tests, and backup/restore controls. `SUPABASE_SERVICE_ROLE_KEY` must never reach browser code.

## Simulated and inactive surfaces

Supplier telephony/voice/recording/transcript timing/sentiment/extraction, guided scenario outcomes, all companies/documents/prices/stock/finance data, browser persistence as durable-storage stand-in, the Supabase foundation, identity/tenancy, durable jobs, monitoring, and accounting integration are simulated or inactive.

Legacy `/collections` and CALL-E code remain for compatibility and must not be described as ERP Supplier Agent activation.

## Production gaps

Production authentication/tenant authorization, consent/calling policy, active durable repository, official supplier-provider contract, durable webhooks/jobs/retries, observability, incident response, backup/restore verification, accounting-ledger/tax/reconciliation controls, and remediation of 22 Task 14 npm audit findings remain open. The build is a demo release candidate, not production-ready.

