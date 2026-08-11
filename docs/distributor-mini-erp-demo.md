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
- **Reset Demo Data**: creates a fresh session/reset generation, invalidates the prior guide and unconsumed Supplier Agent capabilities, and replaces all browser modules with clean v10 seed.

Start/Presentation Fallback, Restart, and Exit first await `PUT /api/supplier-calls/session` with exactly `{ "demoSessionId": "..." }`. Only `204` permits the local guide transition; busy, retired, malformed, unauthorized, or transport failures surface a conflict and leave the current guide/browser state unchanged.

The guide uses a labeled mock-only 10:00 Jakarta clock. Ordinary calls use authoritative server time.

## Primary desktop flow

Refresh after each numbered section and confirm documents/guide state survive.

### 1. Sales shortage

1. Start the guide and open `SO-2026-0001` at `/sales/orders/so-router-shortage`.
2. Review 35 Router Bisnis requested versus 30 physical: shortage 5.
3. Inspect pre-approved Demo Data `PR-2026-0001`: it links to this exact Sales Order and carries only the five-unit shortage.

The guide seeds that approval evidence solely for deterministic rehearsal. Ordinary Sales Order use does not auto-create or auto-approve purchasing documents.

### 2. Purchase release and follow-up

1. Open linked `PO-2026-0001` at `/purchasing/orders/po-router-replenishment`.
2. Confirm `purchaseRequestId` points to `PR-2026-0001`, its one line retains the same five-unit demand, and its status is `pending_approval`.
3. As Admin or Approver, choose **Approve** and confirm the linked PO reaches `sent` before any supplier follow-up.
4. Open `/purchasing/follow-up`, then `/supplier-follow-up/po-router-replenishment`.

### 3. Approval and guardrails

1. Use Admin/Approver role.
2. Review exact PO/products, objective, delivery limit, partial-delivery permission, price boundary, language, and approver.
3. Save Human Approval and confirm the labeled mock clock plus **8/8 PASS**. Saving also registers that exact scope with the same-process demo server and obtains an opaque, single-use capability.
4. Start Call. The same-origin route is `/api/supplier-calls?forceMock=1`; it must send the capability in `x-supplier-call-approval`, consume it with the atomic call claim, and return provider `mock`.

### 4. Transcript and human result review

1. Complete the accelerated deterministic transcript; confirm Simulation/Demo Data labels.
2. Review commitment, provenance, dates, follow-up, summary, sentiment, and scope.
3. Approve the result. PO commitment/follow-up may update; stock, receipts, invoices, payments, order quantity, and approved price must not.

### 5. Goods Receipt and reservation

1. Open `/purchasing/receipts?purchaseOrderId=po-router-replenishment`.
2. Prepare and approve the **five linked routers**.
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

## Tablet acceptance (820-1120 px)

At controller checkpoints 820 px and 1024 px, manually confirm grouped navigation, role/Demo labels, horizontal table scrolling through the rightmost action column, reachable forms/actions, Supplier Brief guardrails, transcript/result controls, receipt quantities, delivery form, payment confirmation, and no unusable guided-panel overlap. The style contract covers the full `<=1120px` breakpoint; unit and HTTP smoke do not replace this browser check.

## Reset acceptance

1. First create call/result, receipt, delivery, invoices, payment, follow-up/dispute, and audit evidence.
2. Choose **Reset Demo Data**.
3. Confirm a new session/reset generation and the seed: `SO-2026-0001`, `PO-2026-0001`, three products, two suppliers, two customers, one active warehouse.
4. Confirm no stale guided session/capability, call/result, receipt, delivery, invoice, payment, dispute/follow-up, adjustment, or prior ERP/legacy audit remains.
5. Refresh and confirm the clean seed survives.

Reset affects browser data plus the same-process demo authorization session only; optional Supabase persistence is inactive. The reset action is deliberately not retained as an audit row because the deterministic seed is clean; the new session/reset generation is the documented reset boundary.

## Shell smoke contract

Required GET routes:

```text
/  /dashboard  /actions  /products  /suppliers
/purchasing/orders  /purchasing/follow-up  /inventory  /sales/orders
/finance/payables  /finance/receivables  /approvals  /audit  /api/health
```

Direct-bypass payload to `POST /api/supplier-calls?forceMock=1`:

```json
{
  "callId": "supplier-call-po-1",
  "supplierId": "supplier-utama",
  "purchaseOrderId": "po-router-replenishment",
  "demoSessionId": "demo_direct_bypass_123456789012",
  "demoClockIso": "2026-08-10T03:00:00.000Z"
}
```

Without a previously registered exact approval and `x-supplier-call-approval` header, expected: HTTP `409`, `SERVER_APPROVAL_REQUIRED`. This is the stable direct-bypass check.

For the authorized `201` proof, use the Human Approval workflow: its same-origin registration call returns a cache-disabled `approvalCapability`, and Start Call immediately supplies that opaque value in `x-supplier-call-approval`. Expected: `SUPPLIER_CALL_CREATED`, provider `mock`. Never log, browser-persist, preseed, or reuse the raw capability; concurrent starts must produce at most one provider call.

For the after-hours path, register a fresh exact approval/capability, then use `demoClockIso` `2026-08-10T14:00:00.000Z` (21:00 Jakarta). Expected: HTTP `409`, `SUPPLIER_CALL_INELIGIBLE`, reason `OUTSIDE_CALLING_HOURS`.

A guide replay must call `PUT /api/supplier-calls/session` for the still-active demo session; it clears prior process-local call/capability/claim state without retiring the browser session. Full **Reset Demo Data** calls `DELETE /api/supplier-calls/session` for the retired demo session. A subsequent start with its old capability must return `409 SERVER_APPROVAL_REQUIRED` and must not reach the provider.

## Disclose these gaps

Browser persistence/selectable roles are not production storage/identity; the process-local approval-capability store is not durable or multi-instance authorization; calls/transcripts/extraction are simulated; Supabase SQL is inactive and not live-tested; no official live provider or durable jobs/observability exists; lightweight finance is not general-ledger/tax/reconciliation; and the retained audit has 22 unresolved vulnerabilities (4 moderate, 16 high, 2 critical). The dated local-loopback demo waiver in `docs/security.md` is not a production waiver.
