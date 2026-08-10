# Arvanta Distributor Mini ERP

> Every company, document, quantity, price, metric, transcript, call, and result is **Demo Data**. The ERP Supplier Agent uses `MockSupplierCallProvider` and does not contact a real supplier.

Arvanta Distributor Mini ERP is a browser-based, single-company distributor prototype. It connects purchasing, receiving, inventory, sales, delivery, trade invoices, payments, approvals, and audit evidence. It is not a production accounting or telephony system.

## Implemented workflow

`Sales shortage -> Purchase Request -> approved Purchase Order -> supplier follow-up -> partial Goods Receipt -> inventory -> partial Delivery -> payable / receivable -> partial payment -> audit`

Implemented modules include Dashboard, Action Center, Approval Inbox, unified audit, master data, RFQ/Purchase Orders, receipts/stock controls, Sales Orders/reservations/deliveries, source-backed invoices/payments, and a human-approved Supplier Agent mock flow.

General ledger, journals, tax, bank reconciliation, statutory statements, payroll, manufacturing, multi-company, multi-currency, and warehouse transfers are out of scope.

## Runtime and command boundary

Pages render state and submit intent; they cannot replace ERP snapshots or directly mutate stock, documents, prices, invoices, payments, or Supplier Agent results. Pure commands under `lib/erp/commands/` recheck role, status, links, quantities, dates, and invariants. Success produces one next state, advances the revision exactly once, and appends audit evidence. Rejection returns the original state.

The default repository is a validated browser store using schema/storage **v10**. It reads supported v9-to-v2 keys, migrates only provable data, synchronizes the current key across tabs, and fails closed to deterministic Demo Data when JSON or relationships are invalid.

SQL under `supabase/` and `ErpRepository` are an inactive production foundation. No browser variable selects them and no migration runs automatically. See [Architecture](docs/architecture.md) and [Security](docs/security.md).

## Supplier Agent guardrails

Admin/Approver approval must define exact supplier, PO, products, objective, delivery limit, partial-delivery permission, price boundary, language, and approver. The server/domain boundary then requires:

- matching complete approval;
- valid phone and no Do Not Contact flag;
- allowed Jakarta calling hours;
- no same-PO claim that local day;
- eligible PO state and exact positive order data;
- no unresolved PO dispute.

`POST /api/supplier-calls?forceMock=1` is same-origin and returns provider `mock`. `MockSupplierCallProvider` is deterministic, in-memory, and performs no network I/O. Credentials alone cannot activate a live ERP Supplier Agent; the current composition contains no live supplier provider.

A structured result remains pending for Approve, Edit, Reject, or Human Review. Approval may change a commitment or create a follow-up/dispute. It cannot directly change stock, receipts, invoice balances, payments, order quantity, or approved prices.

## Setup

Requirements: Node.js 22.13 or newer and the checked-in lockfile.

```powershell
npm.cmd ci
npm.cmd run dev
```

No environment file, database, API key, or provider is required for the complete mock demo.

Production-equivalent local preview:

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

Choose **Start Distributor Demo**. The guide uses deterministic `SO-2026-0001` and `PO-2026-0001`, a mock-only business-time clock, and a fresh session. It covers the complete shortage-to-audit chain.

- **Presentation Fallback** changes only mock simulation speed to instant.
- **Restart Demo** reseeds the journey while retaining the original restore point.
- **Exit & Restore** restores the exact valid pre-demo state.
- **Reset Demo Data** creates a new session and restores deterministic seed data across all browser modules.

The current key is `arvanta-distributor-mini-erp-demo-v10`. Reset never touches a database because the optional repository is inactive. Follow [the demo runbook](docs/distributor-mini-erp-demo.md).

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

Task 14 shell verification on 10 August 2026 recorded 38 test files / 405 tests passing, 97.41% statements/lines, 82.60% branches, 98.29% functions, and a successful vinext build. Audit remains unresolved at **22 vulnerabilities: 4 moderate, 16 high, 2 critical**. No audit fix or breaking upgrade was applied. This repository is not production-approved.

## Useful routes

- `/dashboard`, `/actions`, `/approvals`, `/audit` - operational/control surfaces.
- `/sales/orders/so-router-shortage` - seeded shortage.
- `/purchasing/orders/po-router-replenishment` - seeded released PO.
- `/purchasing/follow-up`, `/supplier-follow-up/po-router-replenishment` - Supplier Agent queue/approval.
- `/purchasing/receipts`, `/inventory`, `/sales/deliveries` - stock workflows.
- `/finance/payables`, `/finance/receivables`, `/finance/payments` - lightweight finance.
- `/collections` - preserved legacy ProcureBridge demo.

## Simulated/inactive surfaces

Supplier telephony, voice, recording, transcript timing, sentiment, extraction, commitments, all companies/documents/prices/stock/finance data, browser storage as durable-repository stand-in, production identity/tenancy/jobs/observability, and the optional Supabase foundation are simulated or inactive.

## 15. Production gaps

Before customer-data or production use: add verified identity and tenant authorization; consent/retention/calling governance; a server-only durable repository with applied migration and live RLS/cross-tenant/backup tests; an official provider contract with signed webhooks, idempotency, queues, retries, monitoring, and incident response; accounting-ledger/tax/reconciliation controls; compatible dependency remediation; and authorized browser, accessibility, security, migration, load, and recovery testing.

All displayed people, companies, documents, calls, prices, stock, finance records, dates, and outcomes remain Demo Data.
