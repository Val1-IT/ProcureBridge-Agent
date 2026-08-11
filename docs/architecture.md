# Distributor Mini ERP architecture

## Runtime model

```text
Page / component
    -> closed named intent (`lib/erp/command-intents.ts`)
Executor derives authoritative actor -> pure ERP command + permission + invariant checks
    -> success: one deeply valid v10 ErpState + revision exactly +1 + one audit event
Private DemoStore persistence coordinator
    -> Web Locks serialized CAS + versioned lineage envelope + classified cross-tab events
Dashboard / linked modules / unified audit
```

Rejected commands return the original `ErpState`. `useErpCommands()` exposes only named intent methods: it has no arbitrary `run(callback)`, caller-supplied role, whole-state setter, or hydration action. The executor derives the actor from current authoritative state, requires a nonnegative safe-integer revision, and accepts a success only when revision advances exactly once, exactly one authoritative audit event is appended, and the resulting v10 graph passes deep validation. Persistence hydration/restore remains a private store capability.

## Module boundaries

| Boundary | Main locations | Responsibility |
| --- | --- | --- |
| Pages and UI | `app/`, `components/erp/`, `components/supplier-call/` | Render current state, collect intent, show stable errors and allowed actions. |
| ERP command boundary | `lib/erp/command-intents.ts`, `lib/erp/commands/` | Expose closed named intents; derive the authoritative actor; validate state/input; atomically mutate purchasing, inventory, sales, finance, or Supplier Agent state. |
| Policies/transitions | `lib/erp/permissions.ts`, `lib/erp/guardrails/`, `lib/erp/transitions/` | Permission matrix, call eligibility, and legal document transitions. |
| Selectors/read models | `lib/erp/selectors.ts`, `lib/erp/selectors-finance.ts`, `lib/erp/dashboard.ts` | Derive stock, balances, linked rows, metrics, actions, and approvals from source records. |
| Demo repository | `lib/demo/persistence.ts`, `lib/demo/persistence-coordinator.ts`, `components/demo-store-provider.tsx` | Deep-validate/migrate v10 data; serialize lineage-aware CAS writes with Web Locks; classify cross-tab events; reset and recover browser Demo Data. |
| Supplier provider | `lib/supplier-call/`, `lib/server/supplier-call-authorization.ts`, `lib/server/supplier-call-runtime.ts` | Isolate mock execution; register exact server-owned approval capabilities; atomically consume capability and call claim; invalidate retired demo sessions. |
| Optional production boundary | `lib/repository/erp-repository.ts`, `lib/repository/mappers/erp-*`, `supabase/` | Inactive repository contract, row mappers, and tenant-scoped SQL foundation. |
| Preserved legacy recovery | `/collections`, `lib/calle/`, legacy repository mappers | Existing ProcureBridge demo, separate from the ERP Supplier Agent. |

## Atomic command model

The command modules are split into `master-data`, `purchasing`, `inventory`, `sales`, `finance`, `supplier-calls`, and `supplier-results`, behind one closed named-intent executor. Each rechecks permissions and authoritative state. Success advances the exact next safe revision and appends safe scalar audit detail. Multi-entity effects commit together; validation failure commits none.

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

`DemoState` contains preserved legacy recovery collections and nested `ErpState`. Current schema/storage version is **10** at `arvanta-distributor-mini-erp-demo-v10`. It reads v9-v3 ERP state plus legacy ProcureBridge v2. A valid v2 record retains its legacy Recovery collections and receives a fresh deterministic ERP slice; legacy records are not converted into ERP transactions.

Migration validates legacy collections and ERP relationships and does not invent non-provable provenance. Invalid JSON/schema/revision fails closed to deterministic seed data and a fresh session, with a recovery reason for the UI. Each stored envelope carries `demoSessionId`, reset generation, write sequence, and commit id. A local mutation acquires the storage-key Web Lock, rereads and compares lineage, then writes; missing/failed lock or lineage mismatch fails closed and surfaces a conflict. Storage events ignore stale ancestors, surface same-lineage forks, apply newer writes, and treat a newer reset generation as remote reset. The versioned judge envelope contains a deeply validated exact v10 pre-demo snapshot bound to the current session/reset generation, so a remote reset invalidates it. Reset creates a new session/generation and deterministic v10 state, clearing prior Demo Data and audit history; its action is deliberately not retained as an audit row because the clean seed is the reset boundary.
Deep master validation rejects nonpositive product purchase/sale prices, negative reorder points or customer credit limits, and supplier payment-term days that are negative, fractional, or outside the safe-integer range. The same constraints guard current-key hydration and judge snapshot restoration.

Stock totals are derived: physical from signed movements, reserved from active undelivered Sales Order lines, available as physical minus reserved, and incoming from open PO quantities minus approved receipts.

## Supplier Agent sequence

```text
Follow-up queue -> Supplier Brief -> human-approved scope -> server registration
-> opaque session-bound capability -> eight guardrails -> atomic capability/call claim
-> same-origin POST with capability -> MockSupplierCallProvider (in-memory, no network I/O)
-> deterministic transcript/result draft -> resolvable human review -> limited ERP command -> audit
```

Saving approval registers the exact supplier/call/PO/products/boundaries with the same-process server runtime and returns an unguessable, cache-disabled capability bound to that demo session. The create-call route requires it in `x-supplier-call-approval`; a direct call POST without server approval returns `409 SERVER_APPROVAL_REQUIRED`. The API then reloads supplier, PO, draft call, approval, same-day history, and disputes, rechecks all guardrails, and atomically consumes the capability with call idempotency and supplier/PO/local-date claim. Guide begin/restart/exit first awaits a strict demo-only session `PUT` that clears the active session's replay state; a rejected reset prevents the browser transition. Full Demo Data reset invalidates unconsumed capabilities for the retired session.

Current composition owns one process-local `DemoSupplierCallAuthorizationRepository` singleton and defaults to mock; it requires no second service but is neither durable nor safe for multi-instance production. CALL-E credentials passed to this route are inert and do not select live. Future live selection requires explicit server composition, authenticated identity/tenant authorization, durable capability/claim storage, production authorization, and production repository capability; the current composition provides none.

## Optional Supabase/PostgreSQL foundation

The migration defines tenant-scoped tables, constraints, indexes, RLS, revoked `anon`/`authenticated` table access, and service-role privileges. Stock movements and audit events are append-only for service role (`select, insert`; no update/delete).

It is inactive: no Supabase client is selected by the demo UI; `SUPABASE_*` variables are not consumed by default; no migration was applied or live RLS-tested; and `ErpRepository` has no production adapter/composition. SQL row constraints do not replace whole-state validation.

Activation requires an authorized environment, applied/verified migration, verified identity-to-tenant mapping, a server-only adapter, secure service-role handling, atomic transactions, RLS/cross-tenant tests, and backup/restore controls. `SUPABASE_SERVICE_ROLE_KEY` must never reach browser code.

## Simulated and inactive surfaces

Supplier telephony/voice/recording/transcript timing/sentiment/extraction, guided scenario outcomes, all companies/documents/prices/stock/finance data, browser persistence as durable-storage stand-in, the Supabase foundation, identity/tenancy, durable jobs, monitoring, and accounting integration are simulated or inactive.

Legacy `/collections` and CALL-E code remain for compatibility and must not be described as ERP Supplier Agent activation.

## Production gaps

Production authentication/tenant authorization, consent/calling policy, durable multi-instance repositories for ERP state and approval capabilities, official supplier-provider contract, durable webhooks/jobs/retries, observability, incident response, backup/restore verification, accounting-ledger/tax/reconciliation controls, and remediation of 22 fresh final-fix npm audit findings remain open. The local-demo dependency waiver in `docs/security.md` is not a production waiver. This build is a Demo Data prototype, not production-ready.

