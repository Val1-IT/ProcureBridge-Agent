# Arvanta Distributor Mini ERP

> Every company, document, quantity, price, metric, transcript, call, and result is **Demo Data**. The ERP Supplier Agent uses `MockSupplierCallProvider` and does not contact a real supplier.

Arvanta Distributor Mini ERP is a browser-based, single-company distributor prototype. It connects purchasing, receiving, inventory, sales, delivery, trade invoices, payments, approvals, and audit evidence. It is not a production accounting or telephony system.

## Implemented workflow

`Sales shortage -> Purchase Request -> approved Purchase Order -> supplier follow-up -> partial Goods Receipt -> inventory -> partial Delivery -> payable / receivable -> partial payment -> audit`

Implemented modules include Dashboard, Action Center, Approval Inbox, unified audit, master data, RFQ/Purchase Orders, receipts/stock controls, Sales Orders/reservations/deliveries, source-backed invoices/payments, and a human-approved Supplier Agent mock flow.

General ledger, journals, tax, bank reconciliation, statutory statements, payroll, manufacturing, multi-company, multi-currency, and warehouse transfers are out of scope.

## Runtime and command boundary

Pages render state and submit closed, named intent; they cannot supply an arbitrary command callback, replace ERP snapshots, hydrate state, or directly mutate stock, documents, prices, invoices, payments, or Supplier Agent results. The public command API exposes named operations only. Pure commands under `lib/erp/commands/` derive the actor from the authoritative current role and recheck status, links, quantities, dates, permissions, and invariants. Success produces one deeply valid v10 next state, advances a nonnegative safe-integer revision exactly once, and appends one authoritative audit event. Rejection returns the original state.

The default repository is a validated browser store using schema/storage **v10**. It reads v9-v3 ERP state plus legacy ProcureBridge v2. A valid v2 record retains its legacy Recovery collections and receives a fresh deterministic ERP slice; legacy records are not converted into ERP transactions. Invalid JSON, invalid relationships, and unsafe revisions fail closed to deterministic Demo Data.

Current-key writes use a versioned lineage envelope and a Web Locks serialized read/compare/write. A missing or failed lock and a same-lineage collision fail closed and are surfaced; stale cross-tab events are ignored. The guide snapshot is also a versioned, deeply validated v10 envelope bound to the current demo session and reset generation, so a reset in any tab invalidates an older guide session.

SQL under `supabase/` and `ErpRepository` are an inactive production foundation. No browser variable selects them and no migration runs automatically. See [Architecture](docs/architecture.md) and [Security](docs/security.md).

## Supplier Agent guardrails

Admin/Approver approval must define exact supplier, PO, products, objective, delivery limit, partial-delivery permission, price boundary, language, and approver. The server/domain boundary then requires:

- matching complete approval;
- valid phone and no Do Not Contact flag;
- allowed Jakarta calling hours;
- no same-PO claim that local day;
- eligible PO state and exact positive order data;
- no unresolved PO dispute.

Saving Human Approval registers its exact scope in the same-process demo server and returns an unguessable, single-use capability bound to the demo session. `POST /api/supplier-calls?forceMock=1` requires that capability in `x-supplier-call-approval`; a direct POST without server approval returns `409 SERVER_APPROVAL_REQUIRED`. Claiming the call consumes the capability atomically, and resetting the demo invalidates outstanding capabilities for the retired session. This process-local store is a demo aid, not durable or multi-instance authorization.

`MockSupplierCallProvider` is deterministic, in-memory, and performs no network I/O. Credentials alone cannot activate a live ERP Supplier Agent; the current composition contains no live supplier provider.

A structured result remains pending for Approve, Edit, Reject, or Human Review. Approval may change a commitment or create a follow-up/dispute. It cannot directly change stock, receipts, invoice balances, payments, order quantity, or approved prices.

## Setup

Requirements: Node.js 22.13 or newer and the checked-in lockfile.

```powershell
npm.cmd ci
npm.cmd run dev
```

No environment file, database, API key, or provider is required for the complete mock demo.

Local production-build preview for Demo Data only:

```powershell
npm.cmd run build
npm.cmd run start -- --port 3004
```

## Environment variables

No `.env.example` exists or is required by the default mock runtime. If you create an untracked local environment file for adapter development:

| Variable | Current use |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Public canonical URL for metadata; never place secrets in it. |
| `CALLE_API_URL` | Optional preserved legacy ProcureBridge adapter URL, not ERP Supplier Agent activation. |
| `CALLE_API_KEY` | Server-only legacy credential. Never prefix with `NEXT_PUBLIC_`. |
| `CALLE_AGENT_ID` | Server-only legacy adapter identifier. |
| `CALLE_WEBHOOK_SECRET` | Server-only legacy webhook placeholder secret. |
| `CALLE_WEBHOOK_SIGNATURE_HEADER` | Optional legacy signature-header name. |
| `SUPABASE_URL` | Reserved for a future reviewed server repository; inactive today. |
| `SUPABASE_ANON_KEY` | Reserved and inactive; it receives no ERP table privilege from the checked-in SQL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Future server-only adapter credential; never expose to browser code. |

There is intentionally no live-call enable flag. Future live mode requires explicit server composition plus production authorization and repository capability; environment values alone are insufficient.

## Demo and reset

Choose **Start Distributor Demo**. The guide uses deterministic `SO-2026-0001`, exact pre-approved Demo Data `PR-2026-0001`, and linked pending-approval `PO-2026-0001`, plus a mock-only business-time clock. Its PO step requires an actual Approver/Admin approval to reach Sent before supplier follow-up. The guide retains the authoritative browser-session identity and covers one referentially continuous shortage-to-audit chain.

The guide seed is a rehearsal fixture: ordinary Sales Order use still requires explicit purchasing actions and never auto-creates or auto-approves a Purchase Request or Purchase Order.

Before **Start Distributor Demo** (including Presentation Fallback), **Restart Demo**, or **Exit & Restore** mutates browser state, the guide awaits a strict same-origin `PUT /api/supplier-calls/session` containing only the current `demoSessionId`. A `204` clears that session's process-local Supplier Agent replay state. Busy, retired, malformed, production-capability, or transport failures are reported as a store conflict and the local guide transition does not run.

- **Presentation Fallback** changes only mock simulation speed to instant.
- **Restart Demo** reseeds the journey while retaining the original restore point.
- **Exit & Restore** restores the exact valid pre-demo state.
- **Reset Demo Data** creates a new session/reset generation, invalidates the prior guide and pending Supplier Agent capabilities, and replaces every browser module with deterministic seed data.

The current key is `arvanta-distributor-mini-erp-demo-v10`. Reset deliberately clears all prior Demo Data and ERP/legacy audit history. The reset action is not retained as an audit row because the deterministic seed is intentionally clean; the new session/reset generation is the reset boundary. Reset never touches a database because the optional repository is inactive. Follow [the demo runbook](docs/distributor-mini-erp-demo.md).

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run test:coverage
npm.cmd run build
npm.cmd audit
```

Cross-platform coverage alias: `npm run test:coverage`.

The historical Task 14 pre-final-fix snapshot on 10 August 2026 recorded 38 test files / 405 tests passing and a successful vinext build. Its coverage report showed 97.41% statements/lines, 82.60% branches, and 98.29% functions **only for the paths explicitly listed under `coverage.include` in `vitest.config.ts`**; those percentages are configured-scope coverage, not repository-wide coverage. Fresh final-fix gates must be recorded separately after this fix wave.

The fresh final-fix verification on 11 August 2026 passed typecheck, zero-warning lint, 56 test files / 530 tests, configured-scope coverage, and the five-stage vinext build. Configured-scope coverage was 97.52% statements/lines, 84.31% branches, and 98.37% functions; it is still not repository-wide coverage.

The fresh ignored audit artifact remains unresolved at **22 vulnerabilities: 4 moderate, 16 high, 2 critical**. The two critical entries are direct development dependencies: `vitest@3.2.4` is affected by [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) (CVSS 9.8, CWE-862), while `@vitest/coverage-v8@3.2.4` inherits the same advisory through Vitest. The available coordinated non-major remediation is `3.2.7` for both packages. No audit fix or breaking upgrade was applied in this wave.

A time-bounded waiver permits only this repository's local-loopback, mock-only Demo Data workflow through **2026-08-24**: do not run the Vitest UI server, do not bind test/dev tooling publicly, and do not use untrusted code or production/customer data. It expires automatically, does not apply to production, and does not make this repository production-ready. Remediation owner: **Repository maintainer**. See [Security](docs/security.md) for the required remediation and invalidation conditions.

## Useful routes

- `/dashboard`, `/actions`, `/approvals`, `/audit` - operational/control surfaces.
- `/sales/orders/so-router-shortage` - seeded shortage.
- `/purchasing/orders/po-router-replenishment` - seeded linked PO awaiting approval.
- `/purchasing/follow-up`, `/supplier-follow-up/po-router-replenishment` - Supplier Agent queue/approval.
- `/purchasing/receipts`, `/inventory`, `/sales/deliveries` - stock workflows.
- `/finance/payables`, `/finance/receivables`, `/finance/payments` - lightweight finance.
- `/collections` - preserved legacy ProcureBridge demo.

## Simulated/inactive surfaces

Supplier telephony, voice, recording, transcript timing, sentiment, extraction, commitments, all companies/documents/prices/stock/finance data, browser storage as durable-repository stand-in, production identity/tenancy/jobs/observability, and the optional Supabase foundation are simulated or inactive.

## 15. Production gaps

Before customer-data or production use: add verified identity and tenant authorization; consent/retention/calling governance; a server-only durable repository with applied migration and live RLS/cross-tenant/backup tests; an official provider contract with signed webhooks, idempotency, queues, retries, monitoring, and incident response; accounting-ledger/tax/reconciliation controls; compatible dependency remediation; and authorized browser, accessibility, security, migration, load, and recovery testing.

All displayed people, companies, documents, calls, prices, stock, finance records, dates, and outcomes remain Demo Data.
