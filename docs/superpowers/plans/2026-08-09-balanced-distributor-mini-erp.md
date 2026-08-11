# Balanced Distributor Mini ERP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the ProcureBridge prototype into a runnable Balanced Distributor Mini ERP whose purchasing, inventory, sales, lightweight finance, and approval-gated Supplier Agent form one persistent, auditable end-to-end workflow.

**Architecture:** Preserve the existing Next.js/vinext shell and proven browser-store/provider boundaries, then add a nested `ErpState` with pure command modules and repository-independent types. Build the core modules as successive testable vertical slices; switch the primary navigation and branding only after the ERP flow is complete, while retaining legacy recovery routes until final regression verification.

**Tech Stack:** Next.js 15 App Router, vinext 0.0.50, React 19, TypeScript 5.9, Tailwind/CSS, Vitest, versioned localStorage, optional PostgreSQL/Supabase SQL.

## Global Constraints

- Node.js version is `>=22.13.0`; use `npm.cmd` for Windows validation commands.
- Version one is single-company, Indonesian rupiah, and one active warehouse.
- Demo execution requires no database, API key, or external connection.
- `MockSupplierCallProvider` is the only active supplier-call provider; no production telephony activation is part of this plan.
- UI components never mutate inventory, document, payable, receivable, pricing, or call-result state directly.
- Every consequential mutation passes through a pure domain command, role authorization, invariant validation, atomic state replacement, and audit creation.
- All seeded transactions, metrics, transcripts, and activities remain visibly labeled **Demo Data** or **Simulation**.
- Preserve the existing ProcureBridge recovery routes and tests during migration; remove or redirect them only in a separately approved retirement change.
- Do not activate Supabase, authentication, tenancy, live CALL-E, tax, general ledger, payroll, manufacturing, multi-currency, or multi-warehouse transfers.

---

## Phase A — State and command foundation

### Task 1: ERP state model, deterministic seed, and schema-v3 migration

**Files:**
- Create: `lib/erp/types.ts`
- Create: `lib/erp/seed.ts`
- Create: `lib/erp/selectors.ts`
- Modify: `lib/domain/types.ts`
- Modify: `lib/demo/seed.ts`
- Modify: `lib/demo/persistence.ts`
- Test: `tests/erp-persistence.test.ts`
- Test: `tests/persistence.test.ts`

**Interfaces:**
- Produces: `ErpState`, all ERP entity types, `createErpSeedState()`, `selectAvailableStock()`, `selectIncomingStock()`, `migrateDemoState()`, and recovery-aware `loadDemoState()`.
- Consumes: existing `DemoState`, `createSeedState()`, and browser persistence functions.

- [ ] **Step 1: Write failing persistence and selector tests**

```ts
it("migrates schema v2 recovery data into schema v3 with a deterministic ERP slice", () => {
  const legacy = { ...createSeedState(), schemaVersion: 2 } as unknown as DemoState;
  delete (legacy as Partial<DemoState>).erp;
  const migrated = deserializeDemoState(JSON.stringify(legacy));
  expect(migrated.schemaVersion).toBe(3);
  expect(migrated.erp.products.map((item) => item.sku)).toEqual(["SKU-ROUTER-01", "SKU-SCANNER-01", "SKU-PAPER-80"]);
  expect(migrated.erp.revision).toBe(0);
});

it("computes available and incoming quantities without storing derived totals", () => {
  const erp = createErpSeedState();
  expect(selectAvailableStock(erp, "product-router")).toBe(18);
  expect(selectIncomingStock(erp, "product-router")).toBe(40);
});

it("reports invalid stored data so the UI can offer a safe reset", () => {
  const loaded = loadDemoState("not-json");
  expect(loaded.state).toEqual(createSeedState());
  expect(loaded.recoveryReason).toBe("INVALID_JSON");
});
```

- [ ] **Step 2: Run the focused tests and verify the red state**

Run: `npm.cmd run test -- tests/erp-persistence.test.ts tests/persistence.test.ts`

Expected: FAIL because `ErpState`, schema version 3, migration, and selectors do not exist.

- [ ] **Step 3: Define focused ERP types**

```ts
export type ErpRole = "admin" | "procurement" | "warehouse" | "sales" | "finance" | "approver";
export type PurchaseOrderStatus = "draft" | "pending_approval" | "sent" | "confirmed" | "partially_received" | "fully_received" | "completed" | "rejected" | "cancelled";
export type SalesOrderStatus = "draft" | "confirmed" | "partially_delivered" | "fully_delivered" | "invoiced" | "completed" | "cancelled";
export type InvoiceStatus = "unpaid" | "partially_paid" | "paid" | "cancelled";

export interface QuantityLine {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface ErpState {
  revision: number;
  activeRole: ErpRole;
  products: Product[];
  suppliers: Supplier[];
  customers: ErpCustomer[];
  warehouses: Warehouse[];
  purchaseRequests: PurchaseRequest[];
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  salesOrders: SalesOrder[];
  deliveryOrders: DeliveryOrder[];
  supplierInvoices: TradeInvoice[];
  customerInvoices: TradeInvoice[];
  payments: Payment[];
  stockMovements: StockMovement[];
  supplierCalls: SupplierCall[];
  supplierApprovals: SupplierCallApproval[];
  supplierResults: SupplierCallResult[];
  disputes: ErpDispute[];
  followUps: ErpFollowUp[];
  auditLogs: ErpAuditEvent[];
}
```

Define each referenced interface in this file with stable `id`, document/status fields, `createdAt`, `updatedAt`, and explicit linked IDs. Do not use `unknown` payloads for transactional line items.

- [ ] **Step 4: Add deterministic ERP seed data and selectors**

Seed one active warehouse, three products, two suppliers, two customers, a sales shortage, one approved PO that is overdue for confirmation, and empty transaction collections needed by the primary demo. Implement selectors from source collections rather than duplicating calculated balances.

```ts
export function selectAvailableStock(state: ErpState, productId: string): number {
  const physical = selectPhysicalStock(state, productId);
  const reserved = state.salesOrders
    .filter((order) => !["cancelled", "completed"].includes(order.status))
    .flatMap((order) => order.lines)
    .filter((line) => line.productId === productId)
    .reduce((sum, line) => sum + line.reservedQuantity - line.deliveredQuantity, 0);
  return physical - reserved;
}
```

- [ ] **Step 5: Extend `DemoState` and implement migration**

Set `DEMO_SCHEMA_VERSION = 3` and `DEMO_STORAGE_KEY = "arvanta-distributor-mini-erp-demo-v3"`. `migrateDemoState()` must preserve valid legacy recovery collections while adding a fresh ERP slice. Invalid JSON or invalid v3 collections fail closed to `createSeedState()`. `loadDemoState()` also returns `recoveryReason: "INVALID_JSON" | "INVALID_SCHEMA" | null`, allowing the provider to show a non-production recovery banner instead of silently hiding corruption; retain `deserializeDemoState()` as the state-only compatibility wrapper used by existing tests.

- [ ] **Step 6: Run focused and legacy persistence tests**

Run: `npm.cmd run test -- tests/erp-persistence.test.ts tests/persistence.test.ts tests/reducer.test.ts`

Expected: PASS with deterministic reset and v2-to-v3 migration coverage.

- [ ] **Step 7: Commit the state foundation**

```bash
git add lib/erp/types.ts lib/erp/seed.ts lib/erp/selectors.ts lib/domain/types.ts lib/demo/seed.ts lib/demo/persistence.ts tests/erp-persistence.test.ts tests/persistence.test.ts
git commit -m "feat: add distributor ERP state foundation"
```

### Task 2: Role permissions and atomic command boundary

**Files:**
- Create: `lib/erp/errors.ts`
- Create: `lib/erp/permissions.ts`
- Create: `lib/erp/commands/shared.ts`
- Create: `lib/erp/commands/master-data.ts`
- Create: `components/erp-command-provider.tsx`
- Modify: `lib/demo/reducer.ts`
- Modify: `components/demo-store-provider.tsx`
- Modify: `app/layout.tsx`
- Test: `tests/erp-command-boundary.test.ts`

**Interfaces:**
- Consumes: `ErpState`, `ErpRole`, and existing `DemoStoreProvider`.
- Produces: `ErpCommandResult<T>`, `authorize(role, permission)`, `commitErpState()`, `useErpCommands()`, `setActiveRole()`, and master-data commands.

- [ ] **Step 1: Write failing permission and atomicity tests**

```ts
it("rejects a warehouse user changing supplier master data without mutation or audit", () => {
  const before = createErpSeedState();
  const result = upsertSupplier(before, "warehouse", supplierInput, fixedNow);
  expect(result).toEqual({ ok: false, state: before, error: { code: "FORBIDDEN", message: "You do not have permission to manage suppliers." } });
  expect(result.state.auditLogs).toHaveLength(before.auditLogs.length);
});

it("increments revision exactly once for a successful atomic command", () => {
  const before = createErpSeedState();
  const result = upsertProduct(before, "admin", productInput, fixedNow);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.state.revision).toBe(before.revision + 1);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm.cmd run test -- tests/erp-command-boundary.test.ts`

Expected: FAIL because the command boundary is absent.

- [ ] **Step 3: Implement stable errors, permissions, and audit helper**

```ts
export type ErpPermission = "master.manage" | "purchase.write" | "purchase.approve" | "stock.receive" | "stock.adjust" | "sales.write" | "finance.write" | "call.approve";
export interface ErpError { code: "FORBIDDEN" | "INVALID_INPUT" | "INVALID_STATE" | "INSUFFICIENT_STOCK" | "STALE_STATE" | "NOT_FOUND"; message: string; details?: Record<string, string | number> }
export type ErpCommandResult<T> = { ok: true; state: ErpState; value: T } | { ok: false; state: ErpState; error: ErpError };

export function commitErpState<T>(before: ErpState, next: Omit<ErpState, "revision">, value: T): ErpCommandResult<T> {
  return { ok: true, state: { ...next, revision: before.revision + 1 }, value };
}
```

Implement an explicit role-permission matrix. Admin has all permissions; approver receives purchase/call/stock approvals; other roles receive only their operational area.

- [ ] **Step 4: Add reducer commit protection and command hook**

Add `DemoAction` variant:

```ts
| { type: "ERP_COMMIT"; expectedRevision: number; erp: ErpState }
```

The reducer accepts it only when `state.erp.revision === expectedRevision`. `useErpCommands().run(command)` evaluates the pure command against the latest state, dispatches only a successful result, and returns the result so the page can display its stable message.

- [ ] **Step 5: Implement validated master-data commands**

`upsertProduct`, `upsertSupplier`, and `upsertCustomer` validate required names, unique SKU or code, positive prices where present, valid phone/email formatting, and the active role. `setActiveRole` accepts only the `ErpRole` union and appends `demo.role_switched`. Each success appends one safe audit event.

- [ ] **Step 6: Run focused tests and reducer regression**

Run: `npm.cmd run test -- tests/erp-command-boundary.test.ts tests/reducer.test.ts`

Expected: PASS; stale or unauthorized commands do not mutate persisted state.

- [ ] **Step 7: Commit the command boundary**

```bash
git add lib/erp/errors.ts lib/erp/permissions.ts lib/erp/commands components/erp-command-provider.tsx lib/demo/reducer.ts components/demo-store-provider.tsx app/layout.tsx tests/erp-command-boundary.test.ts
git commit -m "feat: enforce ERP command permissions"
```

## Phase B — ERP core modules

### Task 3: ERP shell, grouped navigation, role switcher, and master-data pages

**Files:**
- Create: `components/erp/grouped-nav.tsx`
- Create: `components/erp/role-switcher.tsx`
- Create: `components/erp/entity-table.tsx`
- Create: `components/erp/entity-form.tsx`
- Create: `lib/erp/navigation.ts`
- Create: `app/products/page.tsx`
- Create: `app/suppliers/page.tsx`
- Create: `app/customers/page.tsx`
- Create: `app/warehouse/page.tsx`
- Modify: `components/app-shell.tsx`
- Modify: `app/globals.css`
- Test: `tests/erp-navigation.test.ts`

**Interfaces:**
- Consumes: `useDemoStore()`, `useErpCommands()`, master-data commands, and `ErpRole`.
- Produces: primary ERP navigation and usable master-data CRUD surfaces.

- [ ] **Step 1: Write failing navigation-model and command-boundary tests**

```ts
it("builds every approved navigation group with actionable routes", () => {
  const groups = buildErpNavigation("admin");
  expect(groups.map((group) => group.label)).toEqual(["Overview", "Purchasing", "Inventory", "Sales", "Finance", "Master Data", "Control"]);
  expect(groups.flatMap((group) => group.items).every((item) => item.href.startsWith("/") && item.label.length > 0)).toBe(true);
});

it("rejects a rendered master-data submission when the active role lacks permission", () => {
  const result = submitSupplierForm(createErpSeedState(), "warehouse", supplierFormFixture, fixedNow);
  expect(result.ok).toBe(false);
  expect(result.ok ? null : result.error.code).toBe("FORBIDDEN");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm.cmd run test -- tests/erp-navigation.test.ts`

Expected: FAIL because the new shell and pages do not exist.

- [ ] **Step 3: Implement grouped navigation and role switching**

Keep the persistent sidebar, Demo Data badge, simulation controls, and reset action. Replace the primary recovery links with grouped ERP links. Role switching updates `erp.activeRole` through the audited `setActiveRole` command and shows the active role in the top bar. When `loadDemoState()` reports recovery, render a dismissible banner explaining that invalid browser data was replaced with safe Demo Data and link its action to Reset Demo Data.

- [ ] **Step 4: Implement master-data pages**

Each page contains a filterable table, a compact add/edit form, status chips, and operational empty/error states. Warehouse is read-only except for Admin because version one has one seeded active warehouse.

- [ ] **Step 5: Add desktop/tablet styles without redesigning the visual language**

Add `.nav-group`, `.erp-toolbar`, `.entity-form-grid`, `.document-grid`, and tablet overflow rules using existing cream/navy/amber tokens and strong borders.

- [ ] **Step 6: Run navigation tests, typecheck, and lint**

Run: `npm.cmd run test -- tests/erp-navigation.test.ts`

Run: `npm.cmd run typecheck`

Run: `npm.cmd run lint`

Expected: PASS.

- [ ] **Step 7: Commit the shell and master data**

```bash
git add components/erp lib/erp/navigation.ts components/app-shell.tsx app/products app/suppliers app/customers app/warehouse app/globals.css tests/erp-navigation.test.ts
git commit -m "feat: add ERP shell and master data"
```

### Task 4: Purchasing domain commands and state transitions

**Files:**
- Create: `lib/erp/commands/purchasing.ts`
- Create: `lib/erp/transitions/purchase-order.ts`
- Create: `lib/erp/document-numbers.ts`
- Modify: `lib/erp/selectors.ts`
- Test: `tests/erp-purchasing.test.ts`

**Interfaces:**
- Produces: `createPurchaseRequest`, `createPurchaseOrder`, `submitPurchaseOrder`, `approvePurchaseOrder`, `sendPurchaseOrder`, `confirmPurchaseOrder`, `cancelPurchaseOrder`, `nextDocumentNumber`, and `selectSupplierFollowUpQueue`.
- Consumes: command boundary, permissions, master data, and ERP audit types.

- [ ] **Step 1: Write failing lifecycle and invariant tests**

```ts
it("moves an approved PO through the explicit lifecycle and writes one audit per command", () => {
  const draft = createPurchaseOrder(seed, "procurement", poInput, fixedNow);
  const submitted = submitPurchaseOrder(draft.state, "procurement", draft.value.id, fixedNow);
  const approved = approvePurchaseOrder(submitted.state, "approver", submitted.value.id, fixedNow);
  expect(approved.ok && approved.value.status).toBe("sent");
  expect(approved.ok && approved.state.auditLogs.map((log) => log.action)).toContain("purchase_order.approved");
});

it("rejects duplicate supplier/product request lines and non-positive quantities", () => {
  const result = createPurchaseOrder(seed, "procurement", invalidPoInput, fixedNow);
  expect(result.ok).toBe(false);
  expect(result.state).toBe(seed);
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run: `npm.cmd run test -- tests/erp-purchasing.test.ts`

Expected: FAIL because purchasing commands are absent.

- [ ] **Step 3: Implement document numbering and transition machine**

```ts
const allowed: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["sent", "rejected", "cancelled"],
  sent: ["confirmed", "cancelled"],
  confirmed: ["partially_received", "fully_received", "cancelled"],
  partially_received: ["fully_received", "cancelled"],
  fully_received: ["completed"],
  completed: [], rejected: [], cancelled: [],
};
```

`nextDocumentNumber("PO", date, existingNumbers)` returns the next `PO-YYYY-0001` value without relying on collection length.

- [ ] **Step 4: Implement purchasing commands and follow-up selector**

Validate supplier/product existence, positive quantity/price, unique product lines, role permissions, and legal transitions. A PO enters follow-up when confirmation is missing beyond `confirmationDueAt`, promised delivery is overdue, outstanding quantity remains after a partial receipt, or an approved follow-up is due.

- [ ] **Step 5: Run focused tests and command-boundary regression**

Run: `npm.cmd run test -- tests/erp-purchasing.test.ts tests/erp-command-boundary.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit purchasing domain logic**

```bash
git add lib/erp/commands/purchasing.ts lib/erp/transitions/purchase-order.ts lib/erp/document-numbers.ts lib/erp/selectors.ts tests/erp-purchasing.test.ts
git commit -m "feat: add purchase order lifecycle"
```

### Task 5: Purchasing pages and linked-document workflow

**Files:**
- Create: `components/erp/document-status-timeline.tsx`
- Create: `components/erp/line-items-editor.tsx`
- Create: `app/purchasing/requests/page.tsx`
- Create: `app/purchasing/orders/page.tsx`
- Create: `app/purchasing/orders/[orderId]/page.tsx`
- Create: `app/purchasing/receipts/page.tsx`
- Create: `app/purchasing/follow-up/page.tsx`
- Test: `tests/erp-purchasing-view-model.test.ts`

**Interfaces:**
- Consumes: purchasing commands/selectors, grouped navigation, shared tables/forms.
- Produces: usable purchase request, PO, receipt queue, and supplier follow-up surfaces.

- [ ] **Step 1: Write failing purchasing view-model behavior tests**

```ts
it("builds a linked PO detail model with only the actions allowed by status and role", () => {
  const model = buildPurchaseOrderDetailModel(seedWithSentPo, "procurement", "po-1", fixedNow);
  expect(model.links).toEqual({ supplier: "/suppliers?supplierId=supplier-utama", receipts: "/purchasing/receipts?purchaseOrderId=po-1", followUp: "/purchasing/follow-up?purchaseOrderId=po-1" });
  expect(model.allowedActions).toEqual(["confirm"]);
});

it("shows an operational follow-up reason for an overdue unconfirmed PO", () => {
  const [item] = buildSupplierFollowUpRows(seedWithOverduePo, fixedNow);
  expect(item).toMatchObject({ purchaseOrderId: "po-1", priority: "high", reasonCode: "CONFIRMATION_OVERDUE" });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm.cmd run test -- tests/erp-purchasing-view-model.test.ts`

Expected: FAIL because the pages are absent.

- [ ] **Step 3: Build request and order list pages**

Lists include document number, supplier, total, approval status, expected date, received progress, and next action. Filters cover status, supplier, and overdue/follow-up state.

- [ ] **Step 4: Build the PO detail page**

Use the approved transaction-detail pattern: status timeline, line items, totals, linked request/receipts/calls, approval state, activity timeline, and only those action buttons allowed by role and current status.

- [ ] **Step 5: Build receipt and follow-up queue pages**

The receipt page starts a goods-receipt draft against confirmed/partially received POs. The follow-up queue shows explicit priority reasons and routes to Supplier Agent approval rather than starting a call directly.

- [ ] **Step 6: Run UI test, typecheck, and lint**

Run: `npm.cmd run test -- tests/erp-purchasing-view-model.test.ts`

Run: `npm.cmd run typecheck`

Run: `npm.cmd run lint`

Expected: PASS.

- [ ] **Step 7: Commit purchasing UI**

```bash
git add components/erp app/purchasing tests/erp-purchasing-view-model.test.ts
git commit -m "feat: add purchasing workspace"
```

### Task 6: Inventory receipts, stock movements, adjustments, and pages

**Files:**
- Create: `lib/erp/commands/inventory.ts`
- Create: `app/inventory/page.tsx`
- Create: `app/inventory/movements/page.tsx`
- Create: `app/inventory/adjustments/page.tsx`
- Modify: `app/purchasing/receipts/page.tsx`
- Modify: `lib/erp/selectors.ts`
- Test: `tests/erp-inventory.test.ts`
- Test: `tests/erp-inventory-ui.test.ts`

**Interfaces:**
- Produces: `createGoodsReceipt`, `approveGoodsReceipt`, `proposeStockAdjustment`, `approveStockAdjustment`, `selectPhysicalStock`, and stock-card selectors.
- Consumes: approved purchase orders, one active warehouse, permissions, and atomic command boundary.

- [ ] **Step 1: Write failing atomic receipt and negative-stock tests**

```ts
it("approves a partial receipt atomically", () => {
  const result = approveGoodsReceipt(seedWithConfirmedPo, "warehouse", receiptInput, fixedNow);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.status).toBe("approved");
  expect(result.state.purchaseOrders[0].status).toBe("partially_received");
  expect(selectPhysicalStock(result.state, "product-router")).toBe(28);
  expect(result.state.stockMovements.at(-1)?.type).toBe("goods_receipt");
});

it("rejects receipt quantities above the outstanding PO quantity without partial mutation", () => {
  const result = approveGoodsReceipt(seedWithConfirmedPo, "warehouse", excessiveReceipt, fixedNow);
  expect(result.ok).toBe(false);
  expect(result.state).toBe(seedWithConfirmedPo);
});
```

- [ ] **Step 2: Run inventory tests and verify failure**

Run: `npm.cmd run test -- tests/erp-inventory.test.ts tests/erp-inventory-ui.test.ts`

Expected: FAIL because receipt commands and pages are absent.

- [ ] **Step 3: Implement receipt and adjustment commands**

Receipt approval validates PO status, outstanding quantity, product identity, and positive quantities, then creates movements and updates the PO in one committed state. Adjustment proposals cannot mutate stock; approval creates a signed movement with reason and approver.

- [ ] **Step 4: Build stock overview, stock card, and adjustment pages**

Show physical, reserved, available, and incoming quantities per product. Movement history includes source document, actor, timestamp, signed quantity, and resulting balance. Adjustment action is restricted to approval roles.

- [ ] **Step 5: Connect the purchasing receipt page to inventory commands**

The page previews resulting balances, displays validation errors, and routes to the approved Goods Receipt and affected PO after success.

- [ ] **Step 6: Run tests, typecheck, and lint**

Run: `npm.cmd run test -- tests/erp-inventory.test.ts tests/erp-inventory-ui.test.ts tests/erp-purchasing.test.ts`

Run: `npm.cmd run typecheck`

Run: `npm.cmd run lint`

Expected: PASS.

- [ ] **Step 7: Commit inventory**

```bash
git add lib/erp/commands/inventory.ts lib/erp/selectors.ts app/inventory app/purchasing/receipts/page.tsx tests/erp-inventory.test.ts tests/erp-inventory-ui.test.ts
git commit -m "feat: add inventory receiving and controls"
```

### Task 7: Sales orders, reservations, deliveries, and pages

**Files:**
- Create: `lib/erp/commands/sales.ts`
- Create: `lib/erp/transitions/sales-order.ts`
- Create: `app/sales/orders/page.tsx`
- Create: `app/sales/orders/[orderId]/page.tsx`
- Create: `app/sales/deliveries/page.tsx`
- Modify: `lib/erp/selectors.ts`
- Test: `tests/erp-sales.test.ts`
- Test: `tests/erp-sales-ui.test.ts`

**Interfaces:**
- Produces: `createSalesOrder`, `confirmSalesOrder`, `cancelSalesOrder`, `createDeliveryOrder`, `completeDelivery`, `selectSalesShortage`, and sales-order transitions.
- Consumes: product/customer data, available-stock selectors, stock movements, and document numbering.

- [ ] **Step 1: Write failing reservation, shortage, cancellation, and delivery tests**

```ts
it("confirms an order only when available stock covers every line", () => {
  const result = confirmSalesOrder(seed, "sales", "so-ready", fixedNow);
  expect(result.ok).toBe(true);
  if (result.ok) expect(selectAvailableStock(result.state, "product-router")).toBe(8);
});

it("does not confirm a shortage and returns the exact missing quantity", () => {
  const result = confirmSalesOrder(seed, "sales", "so-shortage", fixedNow);
  expect(result.ok).toBe(false);
  expect(result.ok ? null : result.error).toMatchObject({ code: "INSUFFICIENT_STOCK", details: { productId: "product-router", shortage: 12 } });
});

it("completes a partial delivery by reducing physical and reserved stock once", () => {
  const result = completeDelivery(seedWithReservation, "warehouse", deliveryInput, fixedNow);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.state.stockMovements.at(-1)?.type).toBe("delivery");
});
```

- [ ] **Step 2: Run tests and verify the red state**

Run: `npm.cmd run test -- tests/erp-sales.test.ts tests/erp-sales-ui.test.ts`

Expected: FAIL because sales commands and routes are absent.

- [ ] **Step 3: Implement sales transition and reservation commands**

Reservations are derived from confirmed, undelivered line quantities. Cancellation releases the remaining reservation without creating a stock movement. Delivery completion rejects quantities above both reservation and physical stock.

- [ ] **Step 4: Implement shortage-to-purchase-request draft**

Add `createPurchaseRequestFromShortage(state, "sales", salesOrderId, now)`. It creates a draft request for exact unmet quantities, links the source sales order, and never creates or approves a PO.

- [ ] **Step 5: Build sales order and delivery pages**

Show availability per line before confirmation, shortage reasons, linked purchase requests, reserved/delivered quantities, and eligible next actions. Delivery completion requires Warehouse role.

- [ ] **Step 6: Run tests, typecheck, and lint**

Run: `npm.cmd run test -- tests/erp-sales.test.ts tests/erp-sales-ui.test.ts tests/erp-inventory.test.ts`

Run: `npm.cmd run typecheck`

Run: `npm.cmd run lint`

Expected: PASS.

- [ ] **Step 7: Commit sales**

```bash
git add lib/erp/commands/sales.ts lib/erp/transitions/sales-order.ts lib/erp/selectors.ts app/sales tests/erp-sales.test.ts tests/erp-sales-ui.test.ts
git commit -m "feat: add sales reservation and delivery flow"
```

### Task 8: Payables, receivables, payments, and finance pages

**Files:**
- Create: `lib/erp/commands/finance.ts`
- Create: `lib/erp/selectors-finance.ts`
- Create: `app/finance/payables/page.tsx`
- Create: `app/finance/receivables/page.tsx`
- Create: `app/finance/payments/page.tsx`
- Test: `tests/erp-finance.test.ts`
- Test: `tests/erp-finance-ui.test.ts`

**Interfaces:**
- Produces: `recordSupplierInvoice`, `createCustomerInvoice`, `recordPayment`, `selectPayableBalance`, and `selectReceivableBalance`.
- Consumes: approved receipts, delivered quantities, suppliers/customers, and Finance permission.

- [ ] **Step 1: Write failing eligibility and partial-payment tests**

```ts
it("creates a payable without changing inventory", () => {
  const beforeStock = selectPhysicalStock(seedWithReceipt, "product-router");
  const result = recordSupplierInvoice(seedWithReceipt, "finance", supplierInvoiceInput, fixedNow);
  expect(result.ok).toBe(true);
  if (result.ok) expect(selectPhysicalStock(result.state, "product-router")).toBe(beforeStock);
});

it("records partial payment and prevents overpayment", () => {
  const partial = recordPayment(seedWithPayable, "finance", { invoiceId: "sinv-1", amount: 5_000_000, direction: "payable" }, fixedNow);
  expect(partial.ok && selectPayableBalance(partial.state, "sinv-1")).toBe(7_000_000);
  const excessive = recordPayment(partial.ok ? partial.state : seedWithPayable, "finance", { invoiceId: "sinv-1", amount: 8_000_000, direction: "payable" }, fixedNow);
  expect(excessive.ok).toBe(false);
});
```

- [ ] **Step 2: Run tests and verify the red state**

Run: `npm.cmd run test -- tests/erp-finance.test.ts tests/erp-finance-ui.test.ts`

Expected: FAIL because finance commands and pages are absent.

- [ ] **Step 3: Implement invoice eligibility and balance selectors**

Supplier invoices reference approved receipt quantities; customer invoices reference delivered quantities. Duplicate source quantities cannot be invoiced twice. Balances are invoice totals minus non-voided payments.

- [ ] **Step 4: Implement partial/full payment commands**

Payments validate positive amount, remaining balance, matching counterparty, and Finance permission. A zero balance marks an invoice paid; a positive reduced balance marks it partially paid.

- [ ] **Step 5: Build finance pages**

Payables and receivables show counterparty, source documents, due date, original total, paid, remaining, and status. Payment entry previews remaining balance and requires explicit confirmation.

- [ ] **Step 6: Run tests, typecheck, and lint**

Run: `npm.cmd run test -- tests/erp-finance.test.ts tests/erp-finance-ui.test.ts tests/erp-inventory.test.ts tests/erp-sales.test.ts`

Run: `npm.cmd run typecheck`

Run: `npm.cmd run lint`

Expected: PASS.

- [ ] **Step 7: Commit finance**

```bash
git add lib/erp/commands/finance.ts lib/erp/selectors-finance.ts app/finance tests/erp-finance.test.ts tests/erp-finance-ui.test.ts
git commit -m "feat: add lightweight payables and receivables"
```

## Phase C — Supplier Agent and operational control

### Task 9: Supplier Agent provider contract, guardrails, and server authorization

**Files:**
- Create: `lib/supplier-call/types.ts`
- Create: `lib/supplier-call/mock-provider.ts`
- Create: `lib/supplier-call/scripts.ts`
- Create: `lib/erp/commands/supplier-calls.ts`
- Create: `lib/erp/guardrails/supplier-call.ts`
- Create: `lib/server/supplier-call-authorization.ts`
- Create: `app/api/supplier-calls/route.ts`
- Test: `tests/supplier-call-guardrails.test.ts`
- Test: `tests/supplier-call-api.test.ts`
- Test: `tests/supplier-call-provider.test.ts`

**Interfaces:**
- Produces: `SupplierCallProvider`, `MockSupplierCallProvider`, `evaluateSupplierCallEligibility`, `saveSupplierCallApproval`, and a fail-closed `POST /api/supplier-calls`.
- Consumes: suppliers, purchase orders, follow-up queue, approval state, and existing safe API response patterns.

- [ ] **Step 1: Write failing guardrail table tests**

```ts
it.each([
  ["APPROVAL_INCOMPLETE", { approval: null }],
  ["INVALID_PHONE", { supplier: { ...supplier, phone: "123" } }],
  ["DO_NOT_CONTACT", { supplier: { ...supplier, doNotContact: true } }],
  ["OUTSIDE_CALLING_HOURS", { localTime: "19:00" }],
  ["ALREADY_CALLED_TODAY", { callsToday: 1 }],
  ["PURCHASE_ORDER_CLOSED", { purchaseOrder: { ...po, status: "completed" } }],
  ["INVALID_ORDER_DATA", { purchaseOrder: { ...po, lines: [] } }],
  ["OPEN_DISPUTE", { openDispute: true }],
])("blocks %s", (code, patch) => {
  expect(evaluateSupplierCallEligibility({ ...eligibleInput, ...patch }).codes).toContain(code);
});
```

- [ ] **Step 2: Write failing API tests**

Test invalid payload `400`, ineligible call `409`, demo call `201` with provider `mock`, `forceMock=1`, safe provider failure `502`, and a repository capability test proving that any future live mode is rejected unless `authorizationMode === "production"`.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm.cmd run test -- tests/supplier-call-guardrails.test.ts tests/supplier-call-api.test.ts tests/supplier-call-provider.test.ts`

Expected: FAIL because supplier-call modules do not exist.

- [ ] **Step 4: Implement the isolated supplier provider contract**

```ts
export type SupplierScenario = "delivery_commitment" | "partial_delivery" | "stock_unavailable" | "price_discrepancy" | "failed_contact";
export interface CreateSupplierCallInput { callId: string; supplierId: string; purchaseOrderId: string; phone: string; language: string; scenario: SupplierScenario; disclosure: string }
export interface SupplierCallProvider { createCall(input: CreateSupplierCallInput): Promise<CreateCallResult>; getCall(callId: string): Promise<CallStatus>; endCall(callId: string): Promise<void>; getTranscript(callId: string): Promise<TranscriptSegment[]> }
```

The mock provider uses deterministic scripts, masks sensitive numeric patterns, and never performs network I/O.

- [ ] **Step 5: Implement approval command, guardrails, and API handler**

The handler loads server-owned supplier, PO, approval, same-day history, and disputes; evaluates all guardrails; then creates only a mock call. It returns stable codes and never reflects payloads, repository internals, or secrets.

- [ ] **Step 6: Run focused tests and existing call regression**

Run: `npm.cmd run test -- tests/supplier-call-guardrails.test.ts tests/supplier-call-api.test.ts tests/supplier-call-provider.test.ts tests/call-api.test.ts tests/calle-provider.test.ts`

Expected: PASS with zero external requests.

- [ ] **Step 7: Commit Supplier Agent backend**

```bash
git add lib/supplier-call lib/erp/commands/supplier-calls.ts lib/erp/guardrails/supplier-call.ts lib/server/supplier-call-authorization.ts app/api/supplier-calls tests/supplier-call-guardrails.test.ts tests/supplier-call-api.test.ts tests/supplier-call-provider.test.ts
git commit -m "feat: add guarded supplier call boundary"
```

### Task 10: Supplier brief, call console, structured result review, and synchronization

**Files:**
- Create: `app/supplier-follow-up/[purchaseOrderId]/page.tsx`
- Create: `app/supplier-calls/[callId]/page.tsx`
- Create: `app/supplier-calls/[callId]/result/page.tsx`
- Create: `components/supplier-call/approval-form.tsx`
- Create: `components/supplier-call/guardrail-panel.tsx`
- Create: `components/supplier-call/transcript-console.tsx`
- Create: `components/supplier-call/result-review.tsx`
- Create: `lib/erp/commands/supplier-results.ts`
- Test: `tests/supplier-result-review.test.ts`
- Test: `tests/supplier-call-ui.test.ts`

**Interfaces:**
- Produces: `editSupplierResult`, `approveSupplierResult`, `rejectSupplierResult`, `markSupplierResultForHumanReview` and the complete agent UI.
- Consumes: Supplier Agent API/provider, PO follow-up selector, persistence, simulation speed, and audit boundary.

- [ ] **Step 1: Write failing review and idempotency tests**

```ts
it("applies an approved delivery commitment once", () => {
  const first = approveSupplierResult(seedWithPendingResult, "approver", "result-1", fixedNow);
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  expect(first.state.purchaseOrders[0].promisedDeliveryDate).toBe("2026-08-12");
  expect(first.state.followUps).toHaveLength(1);
  const second = approveSupplierResult(first.state, "approver", "result-1", fixedNow);
  expect(second.ok).toBe(false);
  expect(second.state).toBe(first.state);
});

it("never changes stock, invoices, or payments from a call result", () => {
  const result = approveSupplierResult(seedWithPendingResult, "approver", "result-1", fixedNow);
  expect(result.ok && result.state.stockMovements).toEqual(seedWithPendingResult.stockMovements);
  expect(result.ok && result.state.payments).toEqual(seedWithPendingResult.payments);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm.cmd run test -- tests/supplier-result-review.test.ts tests/supplier-call-ui.test.ts`

Expected: FAIL because result commands and pages are absent.

- [ ] **Step 3: Implement supplier result commands**

Approved delivery/partial-delivery results update only PO commitment fields and follow-ups. Stock-unavailable and discrepancy results create a dispute/human task. Failed contact creates only a policy-checked follow-up. Edit/reject/human-review decisions append audit records.

- [ ] **Step 4: Build supplier brief and approval page**

Display PO/customer impact, supplier history, shortages, permitted negotiation boundaries, mandatory confirmations, and eight guardrail decisions. Start Call remains disabled until approval and all guardrails pass.

- [ ] **Step 5: Build simulation console and result review**

Reuse existing simulation speed semantics: real-time 30–45 seconds, fast demo 12–18 seconds, and instant result. The structured result page offers Approve, Edit, Reject, and Human Review and clearly labels transcript/sentiment/entities as Simulation.

- [ ] **Step 6: Run focused tests, existing result regression, typecheck, and lint**

Run: `npm.cmd run test -- tests/supplier-result-review.test.ts tests/supplier-call-ui.test.ts tests/results.test.ts tests/reducer.test.ts`

Run: `npm.cmd run typecheck`

Run: `npm.cmd run lint`

Expected: PASS.

- [ ] **Step 7: Commit Supplier Agent UI**

```bash
git add app/supplier-follow-up app/supplier-calls components/supplier-call lib/erp/commands/supplier-results.ts tests/supplier-result-review.test.ts tests/supplier-call-ui.test.ts
git commit -m "feat: add supplier call review workflow"
```

### Task 11: Dashboard, Action Center, Approval Inbox, and unified ERP audit

**Files:**
- Create: `lib/erp/dashboard.ts`
- Create: `app/actions/page.tsx`
- Create: `app/approvals/page.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: `app/audit/page.tsx`
- Modify: `components/metric-card.tsx`
- Test: `tests/erp-dashboard.test.ts`
- Test: `tests/erp-synchronization.test.ts`

**Interfaces:**
- Produces: `buildDashboardMetrics`, `buildActionItems`, ERP Dashboard, Action Center, Approval Inbox, and audit filtering.
- Consumes: all completed ERP modules and approved result synchronization.

- [ ] **Step 1: Write failing metric and cross-module synchronization tests**

```ts
it("updates dashboard and action items after the primary workflow", () => {
  const finalState = runPrimaryDemoCommands(createErpSeedState());
  const metrics = buildDashboardMetrics(finalState, "2026-08-09");
  expect(metrics.overduePurchaseOrders).toBe(0);
  expect(metrics.lowStockProducts).toBe(0);
  expect(metrics.openPayables).toBe(1);
  expect(metrics.openReceivables).toBe(1);
  expect(buildActionItems(finalState, "2026-08-09").some((item) => item.kind === "supplier_follow_up")).toBe(false);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm.cmd run test -- tests/erp-dashboard.test.ts tests/erp-synchronization.test.ts`

Expected: FAIL because ERP metrics and full primary-flow fixture are absent.

- [ ] **Step 3: Implement derived metrics and actionable work queue**

Derive metrics from source transactions at render time. Action items include pending approvals, overdue/unconfirmed POs, low stock, blocked sales orders, pending receipts, due invoices, and supplier follow-ups. Each item contains a stable entity link.

- [ ] **Step 4: Replace the primary dashboard and extend audit filtering**

Use the approved operational cards and tables. Audit filters cover actor, module, action, date, and document number. Legacy recovery audit events remain viewable under a Legacy Recovery filter.

- [ ] **Step 5: Build Approval Inbox and Action Center**

Approval Inbox groups PO, stock adjustment, and Supplier Agent result approvals. Action Center groups work by owner role and urgency without manufacturing fake production notifications.

- [ ] **Step 6: Run focused tests and the complete unit suite**

Run: `npm.cmd run test -- tests/erp-dashboard.test.ts tests/erp-synchronization.test.ts`

Run: `npm.cmd run test`

Expected: PASS.

- [ ] **Step 7: Commit operational control surfaces**

```bash
git add lib/erp/dashboard.ts app/dashboard/page.tsx app/actions app/approvals app/audit/page.tsx components/metric-card.tsx tests/erp-dashboard.test.ts tests/erp-synchronization.test.ts
git commit -m "feat: add ERP action center and dashboard"
```

## Phase D — Demo readiness and optional production boundary

### Task 12: Primary demo guide, deterministic reset, and product branding

**Files:**
- Create: `lib/demo/erp-judge-mode.ts`
- Create: `components/erp-demo-guide.tsx`
- Modify: `components/judge-demo-provider.tsx`
- Modify: `components/app-shell.tsx`
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `lib/demo/seed.ts`
- Modify: `README.md`
- Test: `tests/erp-demo-readiness.test.ts`

**Interfaces:**
- Produces: one-click primary demo, Presentation Fallback, deterministic reset, updated metadata/landing page, and setup documentation.
- Consumes: the completed primary transaction workflow and existing demo snapshot/restore pattern.

- [ ] **Step 1: Write failing demo-session behavior tests**

```ts
it("starts the ERP judge session in fast mock mode and advances from authoritative state", () => {
  const started = startErpJudgeSession(createSeedState());
  expect(started.session).toMatchObject({ active: true, simulationSpeed: "fast_demo", providerMode: "mock", step: "sales_shortage" });
  expect(started.state.erp.purchaseRequests[0]).toMatchObject({ sourceSalesOrderId: "so-router-shortage", status: "approved", lines: [{ productId: "product-router", quantity: 5 }] });
  expect(started.state.erp.purchaseOrders[0]).toMatchObject({ purchaseRequestId: started.state.erp.purchaseRequests[0].id, status: "pending_approval", lines: [{ productId: "product-router", quantity: 5 }] });
  const advanced = advanceErpJudgeSession(started.session, started.state);
  expect(advanced.step).toBe("purchase_order_approval");
});

it("restores the exact pre-demo snapshot and reset returns the deterministic seed", () => {
  const before = stateWithOperatorChanges;
  const started = startErpJudgeSession(before);
  expect(exitErpJudgeSession(started.session)).toEqual(before);
  expect(resetErpDemo(started.state)).toEqual(createSeedState());
});

it("keeps Presentation Fallback on the mock provider", () => {
  expect(startPresentationFallback(createSeedState()).session.providerMode).toBe("mock");
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run: `npm.cmd run test -- tests/erp-demo-readiness.test.ts`

Expected: FAIL because the ERP guide and branding are absent.

- [ ] **Step 3: Implement ERP demo session and guide**

The guide preserves the pre-demo browser snapshot and authoritative session identity, selects the seeded shortage scenario, and overlays an exact approved five-unit PR plus its linked same-demand pending-approval PO. The PO step advances only after the real Admin/Approver action moves that exact PO to Sent. It defaults to fast simulation, advances only while that referential chain and later authoritative state conditions hold, and restores the previous snapshot when exited. Ordinary Sales Order use remains manual and never auto-creates or auto-approves purchasing documents.

- [ ] **Step 4: Update landing, shell copy, metadata, and README**

Explain the ERP core, Supplier Agent differentiator, complete mock execution, environment variables, reset, simulated components, and production gaps. Keep the existing warm Arvanta visual system and do not claim live integrations.

- [ ] **Step 5: Verify reset and legacy recovery compatibility**

Run: `npm.cmd run test -- tests/erp-demo-readiness.test.ts tests/judge-readiness.test.ts tests/persistence.test.ts tests/reducer.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit demo readiness**

```bash
git add lib/demo/erp-judge-mode.ts components/erp-demo-guide.tsx components/judge-demo-provider.tsx components/app-shell.tsx app/page.tsx app/layout.tsx lib/demo/seed.ts README.md tests/erp-demo-readiness.test.ts
git commit -m "feat: add distributor ERP demo journey"
```

### Task 13: Optional SQL schema and repository contracts

**Files:**
- Create: `supabase/migrations/20260809_000001_distributor_mini_erp.sql`
- Create: `lib/repository/erp-repository.ts`
- Create: `lib/repository/mappers/erp-product-mapper.ts`
- Create: `lib/repository/mappers/erp-purchase-order-mapper.ts`
- Create: `lib/repository/mappers/erp-stock-movement-mapper.ts`
- Create: `lib/repository/mappers/erp-trade-invoice-mapper.ts`
- Modify: `supabase/schema.sql`
- Test: `tests/erp-repository-mappers.test.ts`
- Test: `tests/erp-schema.test.ts`

**Interfaces:**
- Produces: optional `ErpRepository` interface, validated DB/domain mappers, and an inactive reviewed SQL foundation.
- Consumes: ERP entity types only; demo UI/store must not import a Supabase client.

- [ ] **Step 1: Write failing mapper and schema-contract tests**

Verify snake_case mapping, enum rejection, numeric-string conversion, null handling, tenant key presence, unique document numbers per tenant, non-negative constraints, stock-movement append-only intent, indexes, RLS enabled, and service-role-only mutation policies.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm.cmd run test -- tests/erp-repository-mappers.test.ts tests/erp-schema.test.ts`

Expected: FAIL because the schema and mappers are absent.

- [ ] **Step 3: Define the optional repository interface**

```ts
export interface ErpRepository {
  loadWorkspace(tenantId: string): Promise<ErpState>;
  saveAtomic(tenantId: string, expectedRevision: number, state: ErpState): Promise<{ revision: number }>;
  appendAuditEvents(tenantId: string, events: ErpAuditEvent[]): Promise<void>;
}
```

The interface does not activate production storage and cannot be selected by browser environment variables.

- [ ] **Step 4: Implement schema and explicit mappers**

Create tenant-scoped master/transaction tables, line tables, approvals, disputes, follow-ups, calls, results, payments, stock movements, and audit events. Use constraints and indexes corresponding to domain invariants. Do not add permissive anonymous mutation policies.

- [ ] **Step 5: Run schema/mapper and full repository tests**

Run: `npm.cmd run test -- tests/erp-repository-mappers.test.ts tests/erp-schema.test.ts tests/repository-mappers.test.ts`

Expected: PASS without contacting Supabase.

- [ ] **Step 6: Commit optional persistence boundary**

```bash
git add supabase/migrations/20260809_000001_distributor_mini_erp.sql supabase/schema.sql lib/repository/erp-repository.ts lib/repository/mappers tests/erp-repository-mappers.test.ts tests/erp-schema.test.ts
git commit -m "feat: add optional distributor ERP schema"
```

### Task 14: Full verification, browser smoke, security hygiene, and final documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/security.md`
- Create: `docs/distributor-mini-erp-demo.md`
- Modify: `.env.example` only if existing variables need clearer descriptions; do not add a live-call enable flag.
- Test: all `tests/*.test.ts`

**Interfaces:**
- Consumes: the complete application.
- Produces: verified production build, reproducible demo instructions, risk disclosure, and a clean handoff.

- [ ] **Step 1: Run dependency installation and all static/automated checks**

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run test:coverage
npm.cmd run build
npm.cmd audit
```

Expected: typecheck, lint, tests, coverage thresholds, and build PASS. Record `npm audit` counts exactly; do not run `npm audit fix --force` or major upgrades.

- [ ] **Step 2: Start the production-equivalent preview and smoke core routes**

Smoke at minimum:

- `/`
- `/dashboard`
- `/actions`
- `/products`
- `/suppliers`
- `/purchasing/orders`
- `/purchasing/follow-up`
- `/inventory`
- `/sales/orders`
- `/finance/payables`
- `/finance/receivables`
- `/approvals`
- `/audit`
- `/api/health`
- `POST /api/supplier-calls`

Expected: HTTP success for pages/health, mock provider for eligible supplier calls, stable error codes for ineligible calls, and no external network request.

- [ ] **Step 3: Run the full browser demo at desktop width**

Execute the exact primary demonstration: shortage -> inspect the exact linked approved PR -> inspect and approve its same-demand pending PO to Sent -> follow-up queue -> approval/guardrails -> mock transcript -> result review -> linked receipt -> partial delivery -> supplier/customer invoices -> partial payment -> dashboard/audit. Refresh between major steps and confirm state survives.

- [ ] **Step 4: Verify tablet usability and reset**

At approximately 820-1120 px width (controller checkpoints 820 and 1024), confirm sidebar/navigation, horizontally scrollable tables, forms, and rightmost primary actions remain usable. Trigger Reset Demo Data and verify all modules return to the deterministic seed with no stale call, receipt, payment, dispute, or audit entries.

- [ ] **Step 5: Run repository hygiene checks**

```powershell
git diff --check
git status --short
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' "C:/Users/|C:\\Users\\|api[_-]?key\s*[:=]\s*['\"][^'\"]+|password\s*[:=]\s*['\"][^'\"]+|token\s*[:=]\s*['\"][^'\"]+" .
```

Expected: no unapproved local paths, credentials, production customer data, or unrelated changes.

- [ ] **Step 6: Update architecture, security, and demo documentation**

Document module boundaries, atomic command model, schema version/migration, Supplier Agent guardrails, simulated surfaces, optional repository activation requirements, environment variables, setup, reset, primary demo, and known production gaps.

- [ ] **Step 7: Re-run final validation after documentation changes**

Run: `npm.cmd run typecheck`

Run: `npm.cmd run lint`

Run: `npm.cmd run test`

Run: `npm.cmd run build`

Expected: PASS with a clean application worktree except for the intended final documentation changes.

- [ ] **Step 8: Commit the verified release candidate**

```bash
git add README.md docs .env.example
git commit -m "docs: finalize distributor mini ERP handoff"
```

## Execution checkpoints

- **Checkpoint 1 — Foundation:** Tasks 1–3. Persistent ERP state, permissions, shell, and master data are usable.
- **Checkpoint 2 — ERP Core:** Tasks 4–8. Purchasing, inventory, sales, and lightweight finance complete one non-AI transaction flow.
- **Checkpoint 3 — Differentiator:** Tasks 9–11. Supplier Agent, result review, Dashboard, Action Center, approvals, and audit synchronize.
- **Checkpoint 4 — Submission-ready:** Tasks 12–14. Demo guide, optional SQL boundary, documentation, full validation, and browser smoke are complete.

At each checkpoint, stop newly started preview servers, inspect the worktree, and report exact PASS/FAIL/partial results before continuing.
