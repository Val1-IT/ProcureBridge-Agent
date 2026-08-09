# Arvanta Distributor Mini ERP

> Every company, document, quantity, price, metric, transcript, call, and result in this repository is **Demo Data**. The complete demo runs with `MockSupplierCallProvider`; it does not contact a real supplier.

## 1. Product overview

Arvanta Distributor Mini ERP is a focused browser-based ERP prototype for one distributor. It connects purchasing, goods receipt, inventory, sales, delivery, supplier/customer invoices, payments, approvals, and audit evidence in one persistent transaction state.

The ERP core is useful without AI. The differentiator is the **Supplier Agent**, which prioritizes an overdue or unconfirmed Purchase Order, prepares a scoped supplier brief, enforces human approval and contact guardrails, runs a deterministic mock conversation, and holds the structured result for a second human decision.

## 2. ERP core

The primary operational chain is:

`Sales shortage → Purchase Request → approved Purchase Order → Supplier follow-up → Goods Receipt → Inventory → Delivery → Payable / Receivable → Payment → Audit`

Business mutations go through pure domain commands. Role policy, current document status, quantities, and invariants are rechecked at the command boundary. A rejected command leaves revision, documents, inventory, balances, and audit history unchanged.

## 3. Supplier Agent

The Supplier Agent is not an autonomous purchasing bot. Before a call, a human defines the permitted PO, products, delivery-date limit, partial-delivery permission, price boundary, language, and operator identity. A second review is required before an extracted commitment, follow-up, or dispute can affect ERP data.

Even after approval, the result cannot directly change received stock, invoice balances, payment state, ordered quantities, or approved prices. Those remain separate ERP actions.

## 4. Primary demo

Choose **Start Distributor Demo** from the landing page or sidebar. The guide starts from deterministic `SO-2026-0001`, where 35 routers are requested and 30 are physically available. It then walks through the linked purchase and Supplier Agent flow, a partial receipt, confirmed reservation, delivery, both trade invoices, a partial payment, and audit evidence.

Starting the guide preserves an exact snapshot of the current valid browser state. **Exit & Restore** restores that snapshot. **Restart Demo** reseeds the primary journey while retaining the original restore point.

## 5. Presentation Fallback

**Presentation Fallback** uses the same seeded ERP journey and the same guardrails, but selects the instant simulation speed. Its provider mode is still `mock`; it never switches to a live service or converts a provider failure into a successful result.

## 6. Mock operation

The complete demo needs no API keys, database, or external network/service requests. Starting `MockSupplierCallProvider` makes a same-origin `POST /api/supplier-calls?forceMock=1` round trip so server-owned demo authorization and guardrails are still evaluated; that request does not contact an external provider. Transcript progression and result extraction then run locally against the approved seeded scenario.

Legacy ProcureBridge receivables screens, persisted records, migration support, and their recovery guide remain available under `/collections`. They are labeled separately and are not presented as production activity.

## 7. Local setup

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the URL printed by the development server. No environment file is required for mock mode.

## 8. Environment variables

Environment variables are optional unless you are developing a replacement adapter:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Canonical application URL used by metadata |
| `CALLE_API_URL` | Optional legacy CALL-E adapter base URL |
| `CALLE_API_KEY` | Server-only optional legacy CALL-E credential |
| `CALLE_AGENT_ID` | Optional legacy voice-agent identifier |
| `CALLE_WEBHOOK_SECRET` | Server-only optional legacy webhook verifier secret |
| `CALLE_WEBHOOK_SIGNATURE_HEADER` | Placeholder legacy signature header name |
| `SUPABASE_URL` | Optional repository-development project URL |
| `SUPABASE_ANON_KEY` | Reserved optional client credential |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only optional repository credential |

Never prefix server secrets with `NEXT_PUBLIC_`. Supplying credentials alone does not make the ERP demo production-ready and does not activate a live Supplier Agent call.

## 9. Browser persistence

The demo repository stores a versioned state in `localStorage`, synchronizes supported updates across tabs, validates stored collections on load, and migrates supported legacy recovery data. Invalid JSON or an unrecognized schema fails closed to safe seed data and displays the existing recovery notice.

## 10. Reset Demo Data

**Reset Demo Data** clears transaction changes in this browser, creates a new valid demo session ID, restores all deterministic seed collections, removes the active guide session, and returns to the ERP dashboard. It does not delete server or production data because the default repository is browser-only.

## 11. Architecture and provider replacement

Pages submit intent to the ERP command boundary; domain commands validate and produce the next state; the demo repository persists that state; provider interfaces isolate call execution. The current ERP Supplier Agent calls `POST /api/supplier-calls?forceMock=1`, and server authorization remains fail-closed.

A production provider replacement must implement the provider contract and add verified authentication, tenant authorization, consent provenance, calling-hours policy, idempotency, durable repositories, safe webhook validation, retries, monitoring, and human-review evidence. Replacing the adapter alone is insufficient.

## 12. Verification

```bash
npm run typecheck
npm run lint
npm run test
npm run test:coverage
npm run build
```

Tests are offline. They cover ERP permissions and transitions, synchronization, stock safety, finance, Supplier Agent guardrails and result review, persistence/migrations/reset, the guided session, and preserved legacy recovery behavior.

## 13. Simulated features

- supplier telephony, voice, recording, transcript timing, sentiment, and extraction;
- supplier commitments and scenario outcomes used in the guided journey;
- all companies, products, documents, stock opening balances, prices, and dates;
- dashboard totals and action counts derived from Demo Data;
- browser persistence as a stand-in for a reviewed durable repository;
- production authentication, tenant isolation, background jobs, and observability.

## 14. Deliberate scope

Version one covers a single company and active warehouse. It does not include a general ledger, journal posting, tax engine, statutory reporting, bank reconciliation, payroll, manufacturing, fixed assets, multi-company consolidation, multi-currency accounting, or warehouse transfers.

## 15. Production gaps

- Authentication, tenant isolation, production authorization, consent provenance, and retention controls are not active.
- Supplier calling uses `MockSupplierCallProvider`; no official live Supplier Agent contract has been verified.
- The optional CALL-E adapter and webhook verifier belong to the preserved legacy recovery prototype and are not claimed as an active ERP integration.
- Supabase SQL and mappers are foundations only; the default ERP state remains browser-local.
- Durable idempotency, queues, retries, dead-letter handling, backups, monitoring, alerting, and incident procedures are not implemented.
- Prices, stock, invoices, payment records, histories, metrics, and outcomes are seeded or operator-created Demo Data, not production statistics.
- Production accounting still requires a reviewed ledger/tax integration and reconciliation controls.

## 16. Security boundary

Supplier calls fail closed when approval is incomplete, the phone is invalid, Do Not Contact is active, local calling time is disallowed, the same PO was already called that day, the PO is ineligible, or an unresolved dispute requires review. Secrets stay server-only and provider failures are not relabeled as successful mock calls.

## 17. Useful routes

- `/dashboard` and `/actions` — ERP summary and actionable queues
- `/sales/orders/so-router-shortage` — seeded shortage scenario
- `/purchasing/orders/po-router-replenishment` — seeded released PO
- `/purchasing/follow-up` — Supplier Agent queue
- `/purchasing/receipts`, `/sales/deliveries` — stock-changing workflows
- `/finance/payables`, `/finance/receivables`, `/finance/payments` — lightweight finance
- `/approvals`, `/audit` — control evidence
- `/collections` — preserved Legacy Recovery workflow

## 18. Truthful next steps

Before production use, replace browser storage with a reviewed tenant-safe repository, add identity and authorization, verify the selected supplier-call provider contract, implement durable jobs and webhooks, connect accounting controls, and run security, migration, load, recovery, and end-to-end tests against authorized non-customer environments.
