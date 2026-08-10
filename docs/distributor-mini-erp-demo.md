# Distributor Mini ERP demo runbook

All people, companies, documents, calls, prices, stock, finance records, dates, and outcomes are **Demo Data**.

## Start

Requirements: Node.js 22.13+ and the checked-in lockfile.

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run start -- --port 3004
```

Open `http://127.0.0.1:3004` (or another free local port). No env file, database, key, or provider is required. Use a fresh browser profile or **Reset Demo Data** before rehearsal. Never use production customer data.

## Controls

- **Start Distributor Demo**: deterministic ten-step journey with accelerated mock transcript.
- **Presentation Fallback**: same seed/guardrails/provider with instant simulation.
- **Next**: unlocks only when the authoritative business condition exists.
- **Restart Demo**: reseeds the guide while retaining its original restore point.
- **Exit & Restore**: restores the exact valid pre-demo state.
- **Reset Demo Data**: creates a fresh session and resets all browser modules to v10 seed.

The guide uses a labeled mock-only 10:00 Jakarta clock. Ordinary calls use authoritative server time.

## Primary desktop flow

Refresh after each numbered section and confirm documents/guide state survive.

### 1. Sales shortage

1. Start the guide and open `SO-2026-0001` at `/sales/orders/so-router-shortage`.
2. Review 35 Router Bisnis requested versus 30 physical: shortage 5.
3. Create the linked Purchase Request. It remains draft and cannot auto-create/approve a PO.

### 2. Purchase release and follow-up

1. Open seeded `PO-2026-0001` at `/purchasing/orders/po-router-replenishment`.
2. Confirm it is sent/released, scoped to PT Teknologi Utama, and overdue for confirmation.
3. Open `/purchasing/follow-up`, then `/supplier-follow-up/po-router-replenishment`.

### 3. Approval and guardrails

1. Use Admin/Approver role.
2. Review exact PO/products, objective, delivery limit, partial-delivery permission, price boundary, language, and approver.
3. Save Human Approval and confirm the labeled mock clock plus **8/8 PASS**.
4. Start Call. The same-origin route is `/api/supplier-calls?forceMock=1`; provider must be `mock`.

### 4. Transcript and human result review

1. Complete the accelerated deterministic transcript; confirm Simulation/Demo Data labels.
2. Review commitment, provenance, dates, follow-up, summary, sentiment, and scope.
3. Approve the result. PO commitment/follow-up may update; stock, receipts, invoices, payments, order quantity, and approved price must not.

### 5. Partial Goods Receipt and reservation

1. Open `/purchasing/receipts?purchaseOrderId=po-router-replenishment`.
2. Prepare and approve **10 routers**.
3. Confirm receipt, PO progress, inbound movement, and physical stock update together.
4. Return to `SO-2026-0001` and confirm its now-covered reservation.

### 6. Partial delivery

1. Open `/sales/deliveries?salesOrderId=so-router-shortage`.
2. Create a Delivery Order smaller than the full sales quantity.
3. Use Warehouse/Admin and post it.
4. Confirm physical/reserved stock decrease once, one outbound movement exists, and Sales Order becomes partially delivered.

### 7. Trade invoices

1. At `/finance/payables`, select the approved receipt and record a supplier invoice; stock must not change.
2. At `/finance/receivables`, select the posted delivery and create a customer invoice.
3. Confirm source document, original total, paid, remaining, and status for both.

### 8. Partial payment

1. Open `/finance/payments` and select an eligible invoice.
2. Enter a positive amount smaller than the remaining balance.
3. Preview before/after, explicitly confirm, and verify `partially_paid` plus remaining balance.

### 9. Dashboard and audit

1. Review `/dashboard`, `/actions`, and `/approvals` for synchronized current work.
2. At `/audit`, filter `PO-2026-0001` and inspect purchasing, Supplier Agent, receipt, stock, delivery, invoice, and payment evidence.

### 10. Exit

Use **Exit & Restore** for the exact pre-demo snapshot. Use **Reset Demo Data** only for a new deterministic seed.

## Tablet acceptance (820-1024 px)

Manually confirm grouped navigation, role/Demo labels, scroll-safe tables, reachable form/actions, Supplier Brief guardrails, transcript/result controls, receipt quantities, delivery form, payment confirmation, and guided panel have no unusable overlap. Unit and HTTP smoke do not replace this browser check.

## Reset acceptance

1. First create call/result, receipt, delivery, invoices, payment, follow-up/dispute, and audit evidence.
2. Choose **Reset Demo Data**.
3. Confirm a new session and the seed: `SO-2026-0001`, `PO-2026-0001`, three products, two suppliers, two customers, one active warehouse.
4. Confirm no stale guided call/result, receipt, delivery, invoice, payment, dispute/follow-up, adjustment, or prior ERP audit remains.
5. Refresh and confirm the clean seed survives.

Reset affects browser data only; optional Supabase persistence is inactive.

## Shell smoke contract

Required GET routes:

```text
/  /dashboard  /actions  /products  /suppliers
/purchasing/orders  /purchasing/follow-up  /inventory  /sales/orders
/finance/payables  /finance/receivables  /approvals  /audit  /api/health
```

Eligible deterministic payload to `POST /api/supplier-calls?forceMock=1`:

```json
{
  "callId": "supplier-call-po-1",
  "supplierId": "supplier-utama",
  "purchaseOrderId": "po-router-replenishment",
  "demoSessionId": "demo_task14_shell_eligible_123456",
  "demoClockIso": "2026-08-10T03:00:00.000Z"
}
```

Expected: HTTP `201`, `SUPPLIER_CALL_CREATED`, provider `mock`.

Stable ineligible path: use another valid session and `demoClockIso` `2026-08-10T14:00:00.000Z` (21:00 Jakarta). Expected: HTTP `409`, `SUPPLIER_CALL_INELIGIBLE`, reason `OUTSIDE_CALLING_HOURS`.

## Disclose these gaps

Browser persistence/selectable roles are not production storage/identity; calls/transcripts/extraction are simulated; Supabase SQL is inactive and not live-tested; no official live provider or durable jobs/observability exists; lightweight finance is not general-ledger/tax/reconciliation; and Task 14 audit has 22 unresolved vulnerabilities (4 moderate, 16 high, 2 critical).
