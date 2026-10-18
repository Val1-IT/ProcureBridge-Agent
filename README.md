# Arvanta Distributor Mini ERP

> Every company, document, quantity, price, metric, transcript, call, and result is **Demo Data**. The ERP Supplier Agent uses `MockSupplierCallProvider` and does not contact a real supplier.

Arvanta Distributor Mini ERP is a browser-based, single-company distributor prototype. It connects purchasing, receiving, inventory, sales, delivery, trade invoices, payments, approvals, and audit evidence. It is not a production accounting or telephony system.

## DealTwin private Judge and verification boundary

DealTwin is the server-authoritative proof-carrying-commerce subsystem, separate
from the browser-only distributor demo below. Its deterministic compiler,
signed synthetic Judge sessions and PostgreSQL commitment ledger never turn a
quote or reservation into confirmed bank cash. The locked specification and
implementation plan live under docs/dealtwin and docs/superpowers/plans.

Task29 is saved as a partial checkpoint; final coverage, benchmark, builds,
browser, restore, fresh audit and the actual evidence packet remain pending.
See [candidate evidence](docs/dealtwin/VERIFICATION.md)
and [deployment boundary](docs/dealtwin/DEPLOYMENT.md). **Public release remains
blocked** by unresolved dependency findings and missing external readiness
evidence. A passing build or structurally complete JSON packet is not release
authorization. No production data, live provider, public session issuer or
deployment is required or authorized by the local Judge workflow.

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

## DealTwin local PostgreSQL Judge

DealTwin is a separate synthetic, server-authoritative namespace. The original ProcureBridge browser demo remains unchanged. No production, hosted deployment, real financial data or money movement is enabled.

Prerequisites: the repository's disposable PostgreSQL fixture/migration gate has passed; use only loopback `dealtwin_test` on allowlisted55432 or55632 with distinct `dealtwin_app_login` and `dealtwin_reset_login` credentials. This Windows checkpoint uses55632 because Windows reserves55432. Never point tests or this launcher at another database.

```powershell
# With the disposable cluster already seeded and no competing build/test job:
npm.cmd run judge:build
npm.cmd run judge:demo
```

The dedicated Node production target binds only `127.0.0.1:4177`, preserves current synthetic business state and generates an in-memory signing key. Private HttpOnly/Secure/SameSite=Strict admin/approver cookie artifacts expire in one hour under ignored `output/playwright/demo/auth`. There is no public session issuer or browser role-grant control. Do not commit/share auth files or traces.

Use separate named browser sessions through the trusted local Playwright CLI:

```powershell
npx.cmd --package @playwright/cli playwright-cli --session dealtwin-admin open http://127.0.0.1:4177/dealtwin/judge --headed
npx.cmd --package @playwright/cli playwright-cli --session dealtwin-admin state-load output/playwright/demo/auth/admin.json
npx.cmd --package @playwright/cli playwright-cli --session dealtwin-admin reload
# Approval uses its own separately signed session, not a client role selector:
npx.cmd --package @playwright/cli playwright-cli --session dealtwin-approver open http://127.0.0.1:4177/dealtwin/deals/judge-deal-a --headed
npx.cmd --package @playwright/cli playwright-cli --session dealtwin-approver state-load output/playwright/demo/auth/approver.json
npx.cmd --package @playwright/cli playwright-cli --session dealtwin-approver reload
```

Reset requires explicit UI confirmation and touches only `dealtwin-judge-v1`; it restores the canonical business seed, increments revision once and retains immutable operation receipts. The guide uses persisted compiler/proof/commitment evidence. Commit requires live approval; retry resends the original key and payload, then reads fresh server state. Committed remediation retains the original Sales Order/capacity and never creates a second COMMIT.

`npm.cmd run judge:test` runs serial production-target browser tests and resets only the synthetic tenant. Run it separately from PostgreSQL Vitest suites and other project builds. Its three independent journeys cover1440/820/1024px, exact3m failure/25% amendment/27% remediation, genuine collision/replay, refresh, identity/storage denial and unchanged cash evidence. Persistent screenshots are under `output/playwright/task24/evidence`; runner scratch is separate. Local evidence is not hosted CI, a public release or provider integration.

The browser test command explicitly prepares the synthetic fixture before its preserving server starts, even if a prior database suite left only migrated schema. It uses the existing reset service and separate reset login, never drops schema or runs migrations. Ordinary `judge:demo` startup still does not reset or auto-initialize state.

## DealTwin private local MCP surface

`POST /api/dealtwin/mcp` exposes seventeen strict application-service tools and
JSON-RPC initialize/discovery/calls, under the signed Judge server session. The
explicit compatibility profile is MCP2025-11-25 (also accepting2025-03-26 and
2025-06-18), not latest2026/public Alexa/OAuth integration. Native clients accept
JSON and event-stream media types; this stateless profile returns JSON only.

Mutation `mode: prepare` validates request shape without a client/provider/write;
it does not authorize or establish feasibility. `mode: execute` additionally
needs a short-lived signed grant bound to the exact operation/payload/session.
Only a trusted host that collected actual human intent may call the private
confirmation helper; no public issuer/tool or model boolean provides consent.
Conversation serialization stores identifiers/revision/pending intent only;
PostgreSQL services remain business truth. Unknown proof owners and stale or
historical responses demand refresh instead of reusing another Deal's capacity.

The private native HTTP witness is `scripts/dealtwin/mcp-smoke.ts`; run it only
against the owned4177Node target with disposable synthetic state, its private
signing environment and ignored signed cookie. Do not run it concurrently with
database test fixtures. Checkpoint commands/results/boundaries are recorded in
[Task26 verification](docs/dealtwin/TASK26-VERIFICATION.md). This is not browser,
public-client, live-provider or competition submission evidence.

## DealTwin synthetic benchmark (local only)

`npm.cmd run benchmark:dealtwin -- --run-id my-run` evaluates13 checked-in plus100
seeded cases (seed27), independent exhaustive cash-prefix/amendment ground truth,
the real compiler/recompiler/proof replay and the explicit margin/20%-deposit
rule. Default execution also resets ONLY synthetic dealtwin-judge-v1 for three
actual command flows/races; provide separate least-privilege
`DEALTWIN_BENCHMARK_APP_DATABASE_URL` and `DEALTWIN_BENCHMARK_RESET_DATABASE_URL`
pointing to the owned loopback dealtwin_test/55432 or55632 fixture. No owner or
remote fallback, migrations, production access or provider calls are performed.
Never overlap this command with PostgreSQL tests or a running Judge demo.

`--no-services` runs pure evaluation only and labels missing service measurements
NOT_MEASURED. `--count` is generated count (core fixtures are additional);
`--seed` selects the reproducible generator. Output is ignored under
output/dealtwin/task27/<run-id>; existing run directories are not overwritten.
`npm.cmd run benchmark:dealtwin -- --replay my-run` independently reexecutes every
reported mismatch against the same source fingerprint. A failed benchmark still
retains its failure fixtures. Metric denominators, source SHA/tree hash/dirty
state and versions are recorded; zero observed failures never imply universal
safety. Offline extraction4fixture contracts are not live LLM accuracy, and
LLM-only remains unmeasured without equivalent-context captured evidence.

Observer v2 requires the complete declared flow/race/offline-case inventory,
metric-specific payloads and code-owned invariants; caller expectations cannot
redefine success. The fingerprint includes ERP persistence/money mappers and
local schema/runner dependencies. Reports and mismatch fixtures are create-only.
Known deferred Minor: repeating replay currently replaces replay.json; preserve
that first replay externally if multiple replay attestations are required.

See [Task27 checkpoint](docs/dealtwin/TASK27-VERIFICATION.md) for actual evidence,
known scope and remaining gates. Nothing is published or submitted by this CLI.

## Useful routes — original ProcureBridge

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
