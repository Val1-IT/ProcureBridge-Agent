import { describe, expect, it } from "vitest";
import type { DemoState } from "../lib/domain/types";
import { deserializeDemoState, loadDemoState } from "../lib/demo/persistence";
import { createSeedState } from "../lib/demo/seed";
import { createErpSeedState } from "../lib/erp/seed";
import { selectAvailableStock, selectIncomingStock, selectPhysicalStock } from "../lib/erp/selectors";
import { approveGoodsReceipt, approveStockAdjustment, createGoodsReceipt, proposeStockAdjustment } from "../lib/erp/commands/inventory";
import { completeDelivery, confirmSalesOrder, createDeliveryOrder } from "../lib/erp/commands/sales";
import { createCustomerInvoice, recordPayment, recordSupplierInvoice } from "../lib/erp/commands/finance";

function createStateWithLinkedSelectedQuotation() {
  const state = createSeedState();
  const timestamp = "2026-08-09T00:00:00.000Z";
  state.erp.warehouses.push({ ...state.erp.warehouses[0], id: "warehouse-bandung", code: "WH-BDG", name: "Gudang Bandung", active: false });
  state.erp.purchaseRequests = [
    { id: "request-a", requestNumber: "PR-2026-0001", requesterRole: "procurement", sourceSalesOrderId: null, status: "draft", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_000_000 }], createdAt: timestamp, updatedAt: timestamp },
    { id: "request-b", requestNumber: "PR-2026-0002", requesterRole: "procurement", sourceSalesOrderId: null, status: "draft", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_000_000 }], createdAt: timestamp, updatedAt: timestamp },
  ];
  state.erp.requestForQuotations = [{ id: "rfq-linked", rfqNumber: "RFQ-2026-0001", purchaseRequestId: "request-a", warehouseId: "warehouse-jakarta", requestedSupplierIds: ["supplier-kertas"], selectedQuotationId: "quotation-linked", status: "selected", quoteDueAt: "2026-08-10T00:00:00.000Z", lines: [{ productId: "product-router", quantity: 40 }], createdAt: timestamp, updatedAt: timestamp }];
  state.erp.supplierQuotations = [{ id: "quotation-linked", quotationNumber: "SQ-2026-0001", requestForQuotationId: "rfq-linked", supplierId: "supplier-kertas", status: "selected", validUntil: "2026-08-20", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_000_000 }], createdAt: timestamp, updatedAt: timestamp }];
  state.erp.purchaseOrders[0] = { ...state.erp.purchaseOrders[0], supplierId: "supplier-kertas", purchaseRequestId: "request-a", supplierQuotationId: "quotation-linked", warehouseId: "warehouse-jakarta", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_000_000 }] };
  return state;
}

function addLegacySalesReservations(state: ReturnType<typeof createSeedState>) {
  for (const order of state.erp.salesOrders) {
    for (const line of order.lines) {
      (line as unknown as Record<string, unknown>).reservedQuantity = line.deliveredQuantity;
    }
  }
  return state;
}

function createLegacyPostedReceiptState(actorRole: string, actorId: string) {
  const legacy = addLegacySalesReservations(createSeedState());
  legacy.schemaVersion = 4;
  legacy.erp.purchaseOrders[0] = { ...legacy.erp.purchaseOrders[0], status: "fully_received" };
  legacy.erp.goodsReceipts.push({
    id: "legacy-posted-gr", receiptNumber: "GR-2025-0001", purchaseOrderId: legacy.erp.purchaseOrders[0].id, warehouseId: "warehouse-jakarta", status: "posted",
    lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_050_000 }], createdAt: "2025-12-01T10:00:00.000Z", updatedAt: "2025-12-01T10:00:00.000Z",
  });
  legacy.erp.stockMovements.push({
    id: "legacy-posted-movement", productId: "product-router", warehouseId: "warehouse-jakarta", quantity: 40, direction: "in", sourceType: "goods_receipt", sourceId: "legacy-posted-gr",
    actorRole: actorRole as never, actorId, reason: null, createdAt: "2025-12-01T10:00:00.000Z", updatedAt: "2025-12-01T10:00:00.000Z",
  });
  return legacy;
}

describe("ERP persistence foundation", () => {
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])("fails closed for unsafe ERP revision %s", (revision) => {
    const malformed = createSeedState();
    malformed.erp.revision = revision;

    const loaded = loadDemoState(JSON.stringify(malformed));

    expect(loaded.recoveryReason).toBe("INVALID_SCHEMA");
    expect(loaded.state.erp.revision).toBe(0);
  });

  it("migrates schema v2 recovery data into schema v9 with a deterministic ERP slice", () => {
    const legacy = { ...createSeedState(), schemaVersion: 2 } as unknown as DemoState;
    delete (legacy as Partial<DemoState>).erp;

    const migrated = deserializeDemoState(JSON.stringify(legacy));

    expect(migrated.schemaVersion).toBe(10);
    expect(migrated.erp.products.map((item) => item.sku)).toEqual(["SKU-ROUTER-01", "SKU-SCANNER-01", "SKU-PAPER-80"]);
    expect(migrated.erp.revision).toBe(0);
  });

  it("migrates stored schema v3 ERP data with safe RFQ and follow-up approval defaults", () => {
    const legacy = addLegacySalesReservations(createSeedState());
    legacy.schemaVersion = 3;
    delete (legacy.erp as { requestForQuotations?: unknown }).requestForQuotations;
    delete (legacy.erp as { supplierQuotations?: unknown }).supplierQuotations;
    delete (legacy.erp.purchaseOrders[0] as { supplierQuotationId?: unknown }).supplierQuotationId;

    const migrated = deserializeDemoState(JSON.stringify(legacy));

    expect(migrated.schemaVersion).toBe(10);
    expect(migrated.erp.requestForQuotations).toEqual([]);
    expect(migrated.erp.supplierQuotations).toEqual([]);
    expect(migrated.erp.purchaseOrders[0].supplierQuotationId).toBeNull();
  });

  it("migrates schema v4 ERP data with an empty adjustment proposal collection", () => {
    const legacy = addLegacySalesReservations(createSeedState());
    legacy.schemaVersion = 4;
    delete (legacy.erp as { stockAdjustments?: unknown }).stockAdjustments;

    const migrated = deserializeDemoState(JSON.stringify(legacy));

    expect(migrated.schemaVersion).toBe(10);
    expect(migrated.erp.stockAdjustments).toEqual([]);
  });

  it("fails closed when an adjustment or movement has invalid inventory references", () => {
    const malformedAdjustment = createSeedState();
    malformedAdjustment.erp.stockAdjustments.push({
      id: "stock-adjustment-sa-2026-0001", adjustmentNumber: "SA-2026-0001", warehouseId: "missing-warehouse", productId: "product-router", quantityDelta: -2,
      reason: "Cycle count", status: "pending", proposedByRole: "warehouse", approvedByRole: null, approvedAt: null,
      createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z",
    });
    const malformedMovement = createSeedState();
    malformedMovement.erp.stockMovements[0] = { ...malformedMovement.erp.stockMovements[0], sourceType: "goods_receipt", sourceId: "missing-receipt" };

    expect(loadDemoState(JSON.stringify(malformedAdjustment)).recoveryReason).toBe("INVALID_SCHEMA");
    expect(loadDemoState(JSON.stringify(malformedMovement)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("fails closed when an approved inventory document is missing its matching movement", () => {
    const receiptWithoutMovement = createSeedState();
    receiptWithoutMovement.erp.purchaseOrders[0] = { ...receiptWithoutMovement.erp.purchaseOrders[0], status: "partially_received" };
    receiptWithoutMovement.erp.goodsReceipts.push({
      id: "goods-receipt-gr-2026-0001", receiptNumber: "GR-2026-0001", purchaseOrderId: receiptWithoutMovement.erp.purchaseOrders[0].id,
      warehouseId: "warehouse-jakarta", status: "approved", lines: [{ productId: "product-router", quantity: 2, unitPrice: 1_050_000 }],
      createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z",
    });
    const adjustmentWithoutMovement = createSeedState();
    adjustmentWithoutMovement.erp.stockAdjustments.push({
      id: "stock-adjustment-sa-2026-0001", adjustmentNumber: "SA-2026-0001", warehouseId: "warehouse-jakarta", productId: "product-router", quantityDelta: -2,
      reason: "Cycle count", status: "approved", proposedByRole: "warehouse", approvedByRole: "approver", approvedAt: "2026-08-09T11:00:00.000Z",
      createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T11:00:00.000Z",
    });

    expect(loadDemoState(JSON.stringify(receiptWithoutMovement)).recoveryReason).toBe("INVALID_SCHEMA");
    expect(loadDemoState(JSON.stringify(adjustmentWithoutMovement)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("fails closed on mismatched or duplicate receipt and adjustment posting evidence", () => {
    const receiptState = createSeedState();
    receiptState.erp.purchaseOrders[0] = { ...receiptState.erp.purchaseOrders[0], status: "confirmed" };
    const draft = createGoodsReceipt(receiptState.erp, "warehouse", { purchaseOrderId: receiptState.erp.purchaseOrders[0].id, lines: [{ productId: "product-router", quantity: 2 }] }, "2026-08-09T10:00:00.000Z");
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const posted = approveGoodsReceipt(draft.state, "warehouse", draft.value.id, "2026-08-09T11:00:00.000Z");
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    receiptState.erp = posted.state;
    const wrongQuantity = structuredClone(receiptState);
    wrongQuantity.erp.stockMovements.at(-1)!.quantity = 99;
    const duplicatePosting = structuredClone(receiptState);
    duplicatePosting.erp.stockMovements.push({ ...duplicatePosting.erp.stockMovements.at(-1)!, id: "duplicate-receipt-posting" });

    const adjustmentState = createSeedState();
    const proposed = proposeStockAdjustment(adjustmentState.erp, "warehouse", { productId: "product-router", quantityDelta: -2, reason: "Cycle count" }, "2026-08-09T10:00:00.000Z");
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    const adjusted = approveStockAdjustment(proposed.state, "approver", proposed.value.id, "2026-08-09T11:00:00.000Z");
    expect(adjusted.ok).toBe(true);
    if (!adjusted.ok) return;
    adjustmentState.erp = adjusted.state;
    adjustmentState.erp.stockMovements.at(-1)!.reason = "Tampered reason";

    expect(loadDemoState(JSON.stringify(wrongQuantity)).recoveryReason).toBe("INVALID_SCHEMA");
    expect(loadDemoState(JSON.stringify(duplicatePosting)).recoveryReason).toBe("INVALID_SCHEMA");
    expect(loadDemoState(JSON.stringify(adjustmentState)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it.each([
    ["zero active warehouses in v5", 5, (state: ReturnType<typeof createSeedState>) => { state.erp.warehouses = state.erp.warehouses.map((warehouse) => ({ ...warehouse, active: false })); }],
    ["two active warehouses in v5", 5, (state: ReturnType<typeof createSeedState>) => { state.erp.warehouses.push({ ...state.erp.warehouses[0], id: "warehouse-second", code: "WH-SECOND", active: true }); }],
    ["zero active warehouses while migrating v4", 4, (state: ReturnType<typeof createSeedState>) => { state.erp.warehouses = state.erp.warehouses.map((warehouse) => ({ ...warehouse, active: false })); }],
    ["two active warehouses while migrating v4", 4, (state: ReturnType<typeof createSeedState>) => { state.erp.warehouses.push({ ...state.erp.warehouses[0], id: "warehouse-second", code: "WH-SECOND", active: true }); }],
  ])("fails closed for %s", (_label, schemaVersion, mutate) => {
    const malformed = createSeedState();
    malformed.schemaVersion = schemaVersion;
    mutate(malformed);

    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it.each([
    ["an outbound seed movement", (state: ReturnType<typeof createSeedState>) => { state.erp.stockMovements[0] = { ...state.erp.stockMovements[0], direction: "out", quantity: 31 }; }],
    ["a signed adjustment disguised as seed", (state: ReturnType<typeof createSeedState>) => { state.erp.stockMovements[0] = { ...state.erp.stockMovements[0], direction: "adjustment", quantity: -31 }; }],
    ["an untrusted seed source", (state: ReturnType<typeof createSeedState>) => { state.erp.stockMovements[0] = { ...state.erp.stockMovements[0], sourceId: "forged-opening" }; }],
    ["an extra positive movement disguised as trusted opening stock", (state: ReturnType<typeof createSeedState>) => { state.erp.stockMovements.push({ ...state.erp.stockMovements[0], id: "forged-positive-opening", quantity: 999 }); }],
    ["a movement for an inactive product", (state: ReturnType<typeof createSeedState>) => { state.erp.products[0] = { ...state.erp.products[0], active: false }; }],
  ])("rejects %s", (_label, mutate) => {
    const malformed = createSeedState();
    mutate(malformed);

    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("rejects a movement-matched over-receipt", () => {
    const malformed = createSeedState();
    malformed.erp.purchaseOrders[0] = { ...malformed.erp.purchaseOrders[0], status: "fully_received" };
    malformed.erp.goodsReceipts.push({
      id: "over-gr", receiptNumber: "GR-2026-0001", purchaseOrderId: malformed.erp.purchaseOrders[0].id, warehouseId: "warehouse-jakarta", status: "approved",
      lines: [{ productId: "product-router", quantity: 41, unitPrice: 1_050_000 }], createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z",
    });
    malformed.erp.stockMovements.push({
      id: "over-movement", productId: "product-router", warehouseId: "warehouse-jakarta", quantity: 41, direction: "in", sourceType: "goods_receipt", sourceId: "over-gr",
      actorRole: "warehouse", actorId: "role:warehouse", reason: "Approved GR-2026-0001", createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z",
    });

    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it.each(["confirmed", "fully_received"] as const)("rejects partial receipt totals with PO status %s", (status) => {
    const malformed = createSeedState();
    malformed.erp.purchaseOrders[0] = { ...malformed.erp.purchaseOrders[0], status };
    malformed.erp.goodsReceipts.push({
      id: "partial-gr", receiptNumber: "GR-2026-0001", purchaseOrderId: malformed.erp.purchaseOrders[0].id, warehouseId: "warehouse-jakarta", status: "approved",
      lines: [{ productId: "product-router", quantity: 10, unitPrice: 1_050_000 }], createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z",
    });
    malformed.erp.stockMovements.push({
      id: "partial-movement", productId: "product-router", warehouseId: "warehouse-jakarta", quantity: 10, direction: "in", sourceType: "goods_receipt", sourceId: "partial-gr",
      actorRole: "warehouse", actorId: "role:warehouse", reason: "Approved GR-2026-0001", createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z",
    });

    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("rejects a cancelled PO that retains approved partial receipt history", () => {
    const persisted = createSeedState();
    persisted.erp.purchaseOrders[0] = { ...persisted.erp.purchaseOrders[0], status: "cancelled" };
    persisted.erp.goodsReceipts.push({
      id: "cancelled-partial-gr", receiptNumber: "GR-2026-0001", purchaseOrderId: persisted.erp.purchaseOrders[0].id, warehouseId: "warehouse-jakarta", status: "approved",
      lines: [{ productId: "product-router", quantity: 10, unitPrice: 1_050_000 }], createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z",
    });
    persisted.erp.stockMovements.push({
      id: "cancelled-partial-movement", type: "receipt", productId: "product-router", warehouseId: "warehouse-jakarta", quantity: 10, direction: "in", sourceType: "goods_receipt", sourceId: "cancelled-partial-gr",
      actorRole: "warehouse", actorId: "role:warehouse", reason: "Approved GR-2026-0001", createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z",
    });

    expect(loadDemoState(JSON.stringify(persisted)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it.each(["warehouse", "admin"] as const)("migrates a canonical v4 %s receipt actor without changing stock", (actorRole) => {
    const legacy = createLegacyPostedReceiptState(actorRole, `role:${actorRole}`);

    const stockBeforeMigration = selectPhysicalStock(legacy.erp, "product-router");
    const loaded = loadDemoState(JSON.stringify(legacy));
    const reloaded = loadDemoState(JSON.stringify(loaded.state));

    expect(loaded.recoveryReason).toBeNull();
    expect(loaded.state.erp.goodsReceipts.at(-1)?.status).toBe("approved");
    expect(loaded.state.erp.stockMovements.at(-1)).toMatchObject({
      actorRole,
      actorId: `role:${actorRole}`,
      reason: "Migrated posted goods receipt",
    });
    expect(selectPhysicalStock(loaded.state.erp, "product-router")).toBe(stockBeforeMigration);
    expect(reloaded.recoveryReason).toBeNull();
    expect(selectPhysicalStock(reloaded.state.erp, "product-router")).toBe(stockBeforeMigration);
  });

  it.each([
    ["finance", "role:finance"],
    ["procurement", "role:procurement"],
    ["approver", "role:approver"],
    ["system", "system:migrated-v4"],
    ["unknown", "role:unknown"],
    ["warehouse", "role:admin"],
  ])("rejects schema v4 receipt authority %s / %s before normalization", (actorRole, actorId) => {
    const unauthorized = createLegacyPostedReceiptState(actorRole, actorId);

    expect(loadDemoState(JSON.stringify(unauthorized)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("rejects direct schema v5 receipt evidence that forges legacy system provenance", () => {
    const forged = createSeedState();
    forged.erp.purchaseOrders[0] = { ...forged.erp.purchaseOrders[0], status: "fully_received" };
    forged.erp.goodsReceipts.push({
      id: "forged-legacy-gr", receiptNumber: "GR-2025-0001", purchaseOrderId: forged.erp.purchaseOrders[0].id, warehouseId: "warehouse-jakarta", status: "posted",
      lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_050_000 }], createdAt: "2025-12-01T10:00:00.000Z", updatedAt: "2025-12-01T10:00:00.000Z",
    });
    forged.erp.stockMovements.push({
      id: "forged-legacy-movement", productId: "product-router", warehouseId: "warehouse-jakarta", quantity: 40, direction: "in", sourceType: "goods_receipt", sourceId: "forged-legacy-gr",
      actorRole: "system", actorId: "system:migrated-v4", reason: "Migrated posted goods receipt", createdAt: "2025-12-01T10:00:00.000Z", updatedAt: "2025-12-01T10:00:00.000Z",
    });

    expect(loadDemoState(JSON.stringify(forged)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("rejects exact adjustment evidence when chronological stock becomes negative", () => {
    const malformed = createSeedState();
    malformed.erp.stockAdjustments.push({
      id: "negative-adjustment", adjustmentNumber: "SA-2026-0001", productId: "product-router", warehouseId: "warehouse-jakarta", quantityDelta: -31,
      reason: "Forged variance", status: "approved", proposedByRole: "warehouse", approvedByRole: "approver", approvedAt: "2026-08-09T10:00:00.000Z", createdAt: "2026-08-09T09:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z",
    });
    malformed.erp.stockMovements.push({
      id: "negative-adjustment-movement", productId: "product-router", warehouseId: "warehouse-jakarta", quantity: -31, direction: "adjustment", sourceType: "adjustment", sourceId: "negative-adjustment",
      actorRole: "approver", actorId: "role:approver", reason: "Forged variance", createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z",
    });

    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("orders movement history by actual instant before validating non-negative stock", () => {
    const malformed = createSeedState();
    malformed.erp.stockAdjustments.push({
      id: "offset-negative-adjustment", adjustmentNumber: "SA-2026-0001", productId: "product-router", warehouseId: "warehouse-jakarta", quantityDelta: -30,
      reason: "Offset chronology", status: "approved", proposedByRole: "warehouse", approvedByRole: "approver", approvedAt: "2026-08-09T01:00:00+02:00", createdAt: "2026-08-09T00:30:00+02:00", updatedAt: "2026-08-09T01:00:00+02:00",
    });
    malformed.erp.stockMovements.push({
      id: "offset-negative-movement", productId: "product-router", warehouseId: "warehouse-jakarta", quantity: -30, direction: "adjustment", sourceType: "adjustment", sourceId: "offset-negative-adjustment",
      actorRole: "approver", actorId: "role:approver", reason: "Offset chronology", createdAt: "2026-08-09T01:00:00+02:00", updatedAt: "2026-08-09T01:00:00+02:00",
    });

    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("computes available and incoming quantities without storing derived totals", () => {
    const erp = createErpSeedState();

    expect(selectAvailableStock(erp, "product-router")).toBe(30);
    expect(selectIncomingStock(erp, "product-router")).toBe(40);
  });

  it("reports invalid stored data so the UI can offer a safe reset", () => {
    const loaded = loadDemoState("not-json");

    expect({ ...loaded.state, demoSessionId: "session" }).toEqual({ ...createSeedState(), demoSessionId: "session" });
    expect(loaded.recoveryReason).toBe("INVALID_JSON");
  });

  it("fails closed when a schema v3 ERP slice has an invalid role or product entity", () => {
    const malformed = createSeedState();
    malformed.erp.activeRole = "operator" as never;
    malformed.erp.products = [null as never];

    const loaded = loadDemoState(JSON.stringify(malformed));

    expect({ ...loaded.state, demoSessionId: "session" }).toEqual({ ...createSeedState(), demoSessionId: "session" });
    expect(loaded.recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("subtracts posted receipts only from the open purchase order quantity", () => {
    const erp = createErpSeedState();
    erp.purchaseOrders.push({
      ...erp.purchaseOrders[0],
      id: "po-completed-router",
      orderNumber: "PO-2026-0002",
      status: "completed",
    });
    erp.goodsReceipts.push({
      id: "receipt-completed-router",
      receiptNumber: "GR-2026-0001",
      purchaseOrderId: "po-completed-router",
      warehouseId: "warehouse-jakarta",
      status: "posted",
      lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_050_000 }],
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    });

    expect(selectIncomingStock(erp, "product-router")).toBe(40);
  });

  it("fails closed when linked supplier-call transactions omit their required IDs and status", () => {
    const malformed = createSeedState();
    malformed.erp.supplierCalls = [{
      id: "supplier-call-1",
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    } as never];

    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("fails closed when a purchase order links a selected quotation from a different supplier", () => {
    const malformed = createSeedState();
    malformed.erp.requestForQuotations = [{
      id: "rfq-router", rfqNumber: "RFQ-2026-0001", purchaseRequestId: null, warehouseId: "warehouse-jakarta", requestedSupplierIds: ["supplier-kertas"], selectedQuotationId: "quotation-kertas", status: "selected", quoteDueAt: "2026-08-10T00:00:00.000Z", lines: [{ productId: "product-router", quantity: 40 }], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",
    }];
    malformed.erp.supplierQuotations = [{
      id: "quotation-kertas", quotationNumber: "SQ-2026-0001", requestForQuotationId: "rfq-router", supplierId: "supplier-kertas", status: "selected", validUntil: "2026-08-20", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_000_000 }], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",
    }];
    malformed.erp.purchaseOrders[0].supplierQuotationId = "quotation-kertas";

    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it.each([
    ["a selected RFQ has no selected quotation", (state: ReturnType<typeof createSeedState>) => {
      state.erp.requestForQuotations = [{ id: "rfq-empty", rfqNumber: "RFQ-2026-0001", purchaseRequestId: null, warehouseId: "warehouse-jakarta", requestedSupplierIds: ["supplier-utama"], selectedQuotationId: null, status: "selected", quoteDueAt: "2026-08-10T00:00:00.000Z", lines: [{ productId: "product-router", quantity: 40 }], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" }];
    }],
    ["a selected RFQ points at a selected quotation owned by another RFQ", (state: ReturnType<typeof createSeedState>) => {
      state.erp.requestForQuotations = [
        { id: "rfq-a", rfqNumber: "RFQ-2026-0001", purchaseRequestId: null, warehouseId: "warehouse-jakarta", requestedSupplierIds: ["supplier-utama"], selectedQuotationId: "quotation-b", status: "selected", quoteDueAt: "2026-08-10T00:00:00.000Z", lines: [{ productId: "product-router", quantity: 40 }], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" },
        { id: "rfq-b", rfqNumber: "RFQ-2026-0002", purchaseRequestId: null, warehouseId: "warehouse-jakarta", requestedSupplierIds: ["supplier-kertas"], selectedQuotationId: "quotation-b", status: "selected", quoteDueAt: "2026-08-10T00:00:00.000Z", lines: [{ productId: "product-router", quantity: 40 }], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" },
      ];
      state.erp.supplierQuotations = [{ id: "quotation-b", quotationNumber: "SQ-2026-0001", requestForQuotationId: "rfq-b", supplierId: "supplier-kertas", status: "selected", validUntil: "2026-08-20", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_000_000 }], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" }];
    }],
    ["a selected RFQ points at a quotation that is not selected", (state: ReturnType<typeof createSeedState>) => {
      state.erp.requestForQuotations = [{ id: "rfq-submitted", rfqNumber: "RFQ-2026-0001", purchaseRequestId: null, warehouseId: "warehouse-jakarta", requestedSupplierIds: ["supplier-utama"], selectedQuotationId: "quotation-submitted", status: "selected", quoteDueAt: "2026-08-10T00:00:00.000Z", lines: [{ productId: "product-router", quantity: 40 }], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" }];
      state.erp.supplierQuotations = [{ id: "quotation-submitted", quotationNumber: "SQ-2026-0001", requestForQuotationId: "rfq-submitted", supplierId: "supplier-utama", status: "submitted", validUntil: "2026-08-20", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_000_000 }], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" }];
    }],
  ])("fails closed when %s", (_case, mutate) => {
    const malformed = createSeedState();
    mutate(malformed);

    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it.each([
    ["the purchase request differs from the selected quotation RFQ", (state: ReturnType<typeof createStateWithLinkedSelectedQuotation>) => { state.erp.purchaseOrders[0].purchaseRequestId = "request-b"; }],
    ["the warehouse differs from the selected quotation RFQ", (state: ReturnType<typeof createStateWithLinkedSelectedQuotation>) => { state.erp.requestForQuotations[0].warehouseId = "warehouse-bandung"; }],
  ])("fails closed when %s", (_case, mutate) => {
    const malformed = createStateWithLinkedSelectedQuotation();
    mutate(malformed);

    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it.each([
    ["a purchase order references a missing purchase request", (state: ReturnType<typeof createSeedState>) => { state.erp.purchaseOrders[0].purchaseRequestId = "missing-request"; }],
    ["a supplier invoice omits its required supplier link", (state: ReturnType<typeof createSeedState>) => {
      state.erp.supplierInvoices.push({
        id: "supplier-invoice-1", invoiceNumber: "BILL-2026-0001", purchaseOrderId: null, salesOrderId: null,
        customerId: null, status: "unpaid", lines: [{ productId: "product-router", quantity: 1, unitPrice: 1_050_000 }], dueDate: "2026-08-20",
        createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",
      } as never);
    }],
    ["a payment references an invoice that does not exist", (state: ReturnType<typeof createSeedState>) => {
      state.erp.payments.push({
        id: "payment-1", paymentNumber: "PAY-2026-0001", invoiceId: "missing-invoice", direction: "payable", supplierId: "supplier-utama", customerId: null, amount: 1_000, paymentDate: "2026-08-09", status: "posted",
        createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",
      });
    }],
  ])("fails closed when %s", (_case, mutate) => {
    const malformed = createSeedState();
    mutate(malformed);

    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });
});

function createPostedDeliveryState() {
  let state = createSeedState();
  state.erp.salesOrders[0] = { ...state.erp.salesOrders[0], lines: [{ ...state.erp.salesOrders[0].lines[0], quantity: 20, deliveredQuantity: 0 }] };
  const confirmed = confirmSalesOrder(state.erp, "sales", state.erp.salesOrders[0].id, "2026-08-09T10:00:00.000Z");
  if (!confirmed.ok) throw new Error(confirmed.error.message);
  const draft = createDeliveryOrder(confirmed.state, "warehouse", { salesOrderId: confirmed.value.id, lines: [{ productId: "product-router", quantity: 8 }] }, "2026-08-09T11:00:00.000Z");
  if (!draft.ok) throw new Error(draft.error.message);
  const posted = completeDelivery(draft.state, "warehouse", draft.value.id, "2026-08-09T12:00:00.000Z");
  if (!posted.ok) throw new Error(posted.error.message);
  state = { ...state, erp: posted.state };
  return state;
}

function removeV6OnlyEvidence(state: ReturnType<typeof createSeedState>) {
  state.schemaVersion = 5;
  for (const movement of state.erp.stockMovements) delete (movement as { type?: string }).type;
  for (const request of state.erp.purchaseRequests) delete (request as unknown as { sourceSalesOrderId?: string | null }).sourceSalesOrderId;
  return state;
}

function createLegacyV5PartialDelivery(quantity: number, reservedQuantity: number) {
  const state = removeV6OnlyEvidence(createSeedState());
  state.erp.salesOrders[0] = {
    ...state.erp.salesOrders[0],
    status: "partially_delivered",
    lines: [{ productId: "product-router", quantity, unitPrice: 1_500_000, deliveredQuantity: 8, reservedQuantity } as never],
  };
  state.erp.deliveryOrders = [{
    id: "legacy-delivery", deliveryNumber: "DO-2026-0001", salesOrderId: state.erp.salesOrders[0].id, warehouseId: "warehouse-jakarta", status: "posted",
    lines: [{ productId: "product-router", quantity: 8, unitPrice: 1_500_000 }], createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z",
  }];
  state.erp.stockMovements.push({
    id: "legacy-delivery-movement", productId: "product-router", warehouseId: "warehouse-jakarta", quantity: 8, direction: "out", sourceType: "delivery_order", sourceId: "legacy-delivery",
    actorRole: "warehouse", actorId: "role:warehouse", reason: "Completed DO-2026-0001", createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z",
  });
  return state;
}

function createLegacyV5Confirmed(quantity: number, reservedQuantity: number) {
  const state = removeV6OnlyEvidence(createSeedState());
  state.erp.salesOrders[0] = {
    ...state.erp.salesOrders[0],
    status: "confirmed",
    lines: [{ productId: "product-router", quantity, unitPrice: 1_500_000, deliveredQuantity: 0, reservedQuantity } as never],
  };
  return state;
}

describe("sales persistence evidence", () => {
  it("migrates schema v5 reservation fields and movement kinds into canonical schema v9", () => {
    const legacy = createLegacyV5Confirmed(20, 12);

    const loaded = loadDemoState(JSON.stringify(legacy));

    expect(loaded.recoveryReason).toBeNull();
    expect(loaded.state.schemaVersion).toBe(10);
    expect(loaded.state.erp.salesOrders[0].lines[0]).not.toHaveProperty("reservedQuantity");
    expect(loaded.state.erp.stockMovements.every((movement) => movement.type === "opening")).toBe(true);
  });

  it("round trips a posted partial delivery with exact linked outbound evidence", () => {
    const state = createPostedDeliveryState();

    const loaded = loadDemoState(JSON.stringify(state));

    expect(loaded.recoveryReason).toBeNull();
    expect(loaded.state.erp.deliveryOrders[0]).toMatchObject({ status: "posted", salesOrderId: state.erp.salesOrders[0].id });
    expect(loaded.state.erp.salesOrders[0]).toMatchObject({ status: "partially_delivered", lines: [{ deliveredQuantity: 8 }] });
  });

  it("fails closed for duplicate active shortage requests while retaining cancelled history", () => {
    const duplicate = createSeedState();
    const base = { id: "request-shortage-a", requestNumber: "PR-2026-0001", requesterRole: "sales" as const, sourceSalesOrderId: duplicate.erp.salesOrders[0].id, status: "draft" as const, lines: [{ productId: "product-router", quantity: 5, unitPrice: 1_050_000 }], createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z" };
    duplicate.erp.purchaseRequests = [base, { ...base, id: "request-shortage-b", requestNumber: "PR-2026-0002", status: "submitted" }];
    const withCancelledHistory = structuredClone(duplicate);
    withCancelledHistory.erp.purchaseRequests[0].status = "cancelled";

    expect(loadDemoState(JSON.stringify(duplicate)).recoveryReason).toBe("INVALID_SCHEMA");
    expect(loadDemoState(JSON.stringify(withCancelledHistory)).recoveryReason).toBeNull();
  });

  it("rejects a cancelled Sales Order after any posted delivery evidence", () => {
    const partiallyDelivered = createPostedDeliveryState();
    partiallyDelivered.erp.salesOrders[0].status = "cancelled";
    const state = createPostedDeliveryState();
    state.erp.salesOrders[0].status = "cancelled";
    state.erp.salesOrders[0].lines[0].deliveredQuantity = 20;
    state.erp.deliveryOrders[0].lines[0].quantity = 20;
    state.erp.stockMovements.at(-1)!.quantity = 20;

    expect(loadDemoState(JSON.stringify(partiallyDelivered)).recoveryReason).toBe("INVALID_SCHEMA");
    expect(loadDemoState(JSON.stringify(state)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("migrates a covered v5 partial delivery and fails closed instead of cancelling an executed uncovered order", () => {
    const covered = createLegacyV5PartialDelivery(20, 10);
    const uncovered = createLegacyV5PartialDelivery(35, 12);
    const coveredPhysical = selectPhysicalStock(covered.erp, "product-router");

    const coveredLoaded = loadDemoState(JSON.stringify(covered));
    const uncoveredLoaded = loadDemoState(JSON.stringify(uncovered));

    expect(coveredLoaded.recoveryReason).toBeNull();
    expect(coveredLoaded.state.erp.salesOrders[0]).toMatchObject({ status: "partially_delivered", lines: [{ quantity: 20, deliveredQuantity: 8 }] });
    expect(selectPhysicalStock(coveredLoaded.state.erp, "product-router")).toBe(coveredPhysical);
    expect(coveredLoaded.state.erp.deliveryOrders).toEqual(covered.erp.deliveryOrders);
    expect(coveredLoaded.state.erp.stockMovements.filter((movement) => movement.sourceType === "delivery_order"))
      .toEqual(covered.erp.stockMovements.filter((movement) => movement.sourceType === "delivery_order").map((movement) => ({ ...movement, type: "delivery" })));
    expect(uncoveredLoaded.recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("keeps or releases genuine v5 confirmed reservations according to v6 coverage", () => {
    const covered = loadDemoState(JSON.stringify(createLegacyV5Confirmed(20, 12)));
    const uncovered = loadDemoState(JSON.stringify(createLegacyV5Confirmed(35, 12)));

    expect(covered.recoveryReason).toBeNull();
    expect(covered.state.erp.salesOrders[0]).toMatchObject({ status: "confirmed", lines: [{ quantity: 20, deliveredQuantity: 0 }] });
    expect(uncovered.recoveryReason).toBeNull();
    expect(uncovered.state.erp.salesOrders[0]).toMatchObject({ status: "draft", lines: [{ quantity: 35, deliveredQuantity: 0 }] });
  });

  it("rejects impossible v5 reservation and delivery evidence instead of fabricating fulfillment", () => {
    const negativeReservation = createLegacyV5PartialDelivery(20, 7);
    const missingDelivery = createLegacyV5PartialDelivery(20, 10);
    missingDelivery.erp.deliveryOrders = [];
    missingDelivery.erp.stockMovements = missingDelivery.erp.stockMovements.filter((movement) => movement.sourceType !== "delivery_order");

    expect(loadDemoState(JSON.stringify(negativeReservation)).recoveryReason).toBe("INVALID_SCHEMA");
    expect(loadDemoState(JSON.stringify(missingDelivery)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it.each([
    ["a shortage purchase request links a missing Sales Order", (state: ReturnType<typeof createSeedState>) => {
      state.erp.purchaseRequests.push({ id: "request-shortage", requestNumber: "PR-2026-0001", requesterRole: "sales", sourceSalesOrderId: "missing-order", status: "draft", lines: [{ productId: "product-router", quantity: 5, unitPrice: 1_050_000 }], createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z" });
    }],
    ["a posted delivery quantity differs from its outbound movement", (state: ReturnType<typeof createPostedDeliveryState>) => { state.erp.stockMovements.at(-1)!.quantity = 7; }],
    ["a delivery outbound movement has the wrong operational reason", (state: ReturnType<typeof createPostedDeliveryState>) => { state.erp.stockMovements.at(-1)!.reason = "Forged shipment"; }],
    ["a delivery references a different warehouse than its Sales Order", (state: ReturnType<typeof createPostedDeliveryState>) => {
      state.erp.warehouses.push({ ...state.erp.warehouses[0], id: "warehouse-bandung", code: "WH-BDG", active: false });
      state.erp.deliveryOrders[0].warehouseId = "warehouse-bandung";
      state.erp.stockMovements.at(-1)!.warehouseId = "warehouse-bandung";
    }],
    ["a Sales Order delivered total differs from posted delivery evidence", (state: ReturnType<typeof createPostedDeliveryState>) => { state.erp.salesOrders[0].lines[0].deliveredQuantity = 7; }],
    ["a fully delivered Sales Order retains a stale delivery draft", (state: ReturnType<typeof createPostedDeliveryState>) => {
      state.erp.salesOrders[0].status = "fully_delivered";
      state.erp.salesOrders[0].lines[0].deliveredQuantity = 20;
      state.erp.deliveryOrders[0].lines[0].quantity = 20;
      state.erp.stockMovements.at(-1)!.quantity = 20;
      state.erp.deliveryOrders.push({ ...state.erp.deliveryOrders[0], id: "stale-delivery", deliveryNumber: "DO-2026-0002", status: "draft", lines: [{ ...state.erp.deliveryOrders[0].lines[0], quantity: 1 }] });
    }],
  ])("fails closed when %s", (_label, mutate) => {
    const state = _label.startsWith("a shortage") ? createSeedState() : createPostedDeliveryState();
    mutate(state as never);

    expect(loadDemoState(JSON.stringify(state)).recoveryReason).toBe("INVALID_SCHEMA");
  });
});

function createFinancePersistenceState() {
  let state = createSeedState();
  state.erp.purchaseOrders[0] = { ...state.erp.purchaseOrders[0], status: "confirmed" };
  const receiptDraft = createGoodsReceipt(state.erp, "warehouse", {
    purchaseOrderId: state.erp.purchaseOrders[0].id,
    lines: [{ productId: "product-router", quantity: 10 }],
  }, "2026-08-09T08:00:00.000Z");
  if (!receiptDraft.ok) throw new Error(receiptDraft.error.message);
  const receipt = approveGoodsReceipt(receiptDraft.state, "warehouse", receiptDraft.value.id, "2026-08-09T09:00:00.000Z");
  if (!receipt.ok) throw new Error(receipt.error.message);

  receipt.state.salesOrders[0] = {
    ...receipt.state.salesOrders[0],
    status: "confirmed",
    lines: [{ ...receipt.state.salesOrders[0].lines[0], quantity: 20, deliveredQuantity: 0 }],
  };
  const deliveryDraft = createDeliveryOrder(receipt.state, "warehouse", {
    salesOrderId: receipt.state.salesOrders[0].id,
    lines: [{ productId: "product-router", quantity: 8 }],
  }, "2026-08-09T10:00:00.000Z");
  if (!deliveryDraft.ok) throw new Error(deliveryDraft.error.message);
  const delivery = completeDelivery(deliveryDraft.state, "warehouse", deliveryDraft.value.id, "2026-08-09T11:00:00.000Z");
  if (!delivery.ok) throw new Error(delivery.error.message);

  const payable = recordSupplierInvoice(delivery.state, "finance", {
    purchaseOrderId: delivery.state.purchaseOrders[0].id,
    sourceDocumentIds: [receipt.value.id],
    dueDate: "2026-09-08",
  }, "2026-08-10T10:00:00.000Z");
  if (!payable.ok) throw new Error(payable.error.message);
  const receivable = createCustomerInvoice(payable.state, "finance", {
    salesOrderId: payable.state.salesOrders[0].id,
    sourceDocumentIds: [delivery.value.id],
    dueDate: "2026-09-08",
  }, "2026-08-10T11:00:00.000Z");
  if (!receivable.ok) throw new Error(receivable.error.message);
  const payment = recordPayment(receivable.state, "finance", {
    invoiceId: payable.value.id,
    direction: "payable",
    amount: 5_000_000,
  }, "2026-08-11T10:00:00.000Z");
  if (!payment.ok) throw new Error(payment.error.message);
  state = { ...state, schemaVersion: 7, erp: payment.state };
  return state;
}

function createFullyCoveredFinancePersistenceState() {
  const state = createSeedState();
  state.erp.purchaseOrders[0] = { ...state.erp.purchaseOrders[0], status: "confirmed" };
  const receiptDraft = createGoodsReceipt(state.erp, "warehouse", { purchaseOrderId: state.erp.purchaseOrders[0].id, lines: [{ productId: "product-router", quantity: 40 }] }, "2026-08-09T08:00:00.000Z");
  if (!receiptDraft.ok) throw new Error(receiptDraft.error.message);
  const receipt = approveGoodsReceipt(receiptDraft.state, "warehouse", receiptDraft.value.id, "2026-08-09T09:00:00.000Z");
  if (!receipt.ok) throw new Error(receipt.error.message);
  receipt.state.salesOrders[0] = { ...receipt.state.salesOrders[0], status: "confirmed", lines: [{ ...receipt.state.salesOrders[0].lines[0], quantity: 20, deliveredQuantity: 0 }] };
  const deliveryDraft = createDeliveryOrder(receipt.state, "warehouse", { salesOrderId: receipt.state.salesOrders[0].id, lines: [{ productId: "product-router", quantity: 20 }] }, "2026-08-09T10:00:00.000Z");
  if (!deliveryDraft.ok) throw new Error(deliveryDraft.error.message);
  const delivery = completeDelivery(deliveryDraft.state, "warehouse", deliveryDraft.value.id, "2026-08-09T11:00:00.000Z");
  if (!delivery.ok) throw new Error(delivery.error.message);
  const payable = recordSupplierInvoice(delivery.state, "finance", { purchaseOrderId: delivery.state.purchaseOrders[0].id, sourceDocumentIds: [receipt.value.id], dueDate: "2026-09-08" }, "2026-08-10T10:00:00.000Z");
  if (!payable.ok) throw new Error(payable.error.message);
  const receivable = createCustomerInvoice(payable.state, "finance", { salesOrderId: payable.state.salesOrders[0].id, sourceDocumentIds: [delivery.value.id], dueDate: "2026-09-08" }, "2026-08-10T11:00:00.000Z");
  if (!receivable.ok) throw new Error(receivable.error.message);
  return { ...state, schemaVersion: 7, erp: receivable.state };
}

describe("finance persistence evidence", () => {
  it("migrates an empty schema v6 finance slice into schema v9", () => {
    const legacy = createSeedState();
    legacy.schemaVersion = 6;

    const loaded = loadDemoState(JSON.stringify(legacy));

    expect(loaded.recoveryReason).toBeNull();
    expect(loaded.state.schemaVersion).toBe(10);
    expect(loaded.state.erp.supplierInvoices).toEqual([]);
    expect(loaded.state.erp.customerInvoices).toEqual([]);
    expect(loaded.state.erp.payments).toEqual([]);
  });

  it("fails closed for schema v6 finance records whose source provenance cannot be proven", () => {
    const legacy = createSeedState();
    legacy.schemaVersion = 6;
    legacy.erp.supplierInvoices.push({
      id: "legacy-invoice", invoiceNumber: "SINV-2026-0001", purchaseOrderId: legacy.erp.purchaseOrders[0].id, salesOrderId: null,
      supplierId: legacy.erp.purchaseOrders[0].supplierId, customerId: null, status: "unpaid",
      lines: [{ productId: "product-router", quantity: 1, unitPrice: 1_050_000 }], dueDate: "2026-09-08",
      createdAt: "2026-08-10T10:00:00.000Z", updatedAt: "2026-08-10T10:00:00.000Z",
    } as never);

    expect(loadDemoState(JSON.stringify(legacy)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("round trips source-backed invoices, a partial payment, and scalar finance audits", () => {
    const state = createFinancePersistenceState();

    const loaded = loadDemoState(JSON.stringify(state));

    expect(loaded.recoveryReason).toBeNull();
    expect(loaded.state.erp.supplierInvoices[0]).toMatchObject({ totalAmount: 10_500_000, status: "partially_paid", sourceDocumentIds: [state.erp.goodsReceipts[0].id] });
    expect(loaded.state.erp.customerInvoices[0]).toMatchObject({ totalAmount: 12_000_000, status: "unpaid", sourceDocumentIds: [state.erp.deliveryOrders[0].id] });
    expect(loaded.state.erp.payments[0]).toMatchObject({ direction: "payable", supplierId: "supplier-utama", customerId: null, amount: 5_000_000 });
    expect(loaded.state.erp.auditLogs.filter((event) => event.entityType === "trade_invoice" || event.entityType === "payment").every((event) => Object.values(event.detail).every((value) => value === null || ["string", "number", "boolean"].includes(typeof value)))).toBe(true);
  });

  it("fails closed when fully covered source lifecycles retain pre-invoice statuses", () => {
    const payableStatus = createFullyCoveredFinancePersistenceState();
    payableStatus.erp.purchaseOrders[0].status = "fully_received";
    const receivableStatus = createFullyCoveredFinancePersistenceState();
    receivableStatus.erp.salesOrders[0].status = "fully_delivered";

    expect(loadDemoState(JSON.stringify(payableStatus)).recoveryReason).toBe("INVALID_SCHEMA");
    expect(loadDemoState(JSON.stringify(receivableStatus)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it.each([
    ["an invoice created instant is an impossible normalized date", (state: ReturnType<typeof createFinancePersistenceState>) => { state.erp.supplierInvoices[0].createdAt = "2026-02-31T10:00:00.000Z"; }],
    ["an invoice updated instant is an impossible normalized date", (state: ReturnType<typeof createFinancePersistenceState>) => { state.erp.supplierInvoices[0].updatedAt = "2026-02-31T10:00:00.000Z"; }],
    ["an invoice due date is an impossible normalized date", (state: ReturnType<typeof createFinancePersistenceState>) => { state.erp.supplierInvoices[0].dueDate = "2026-02-31"; }],
    ["a payment date is an impossible normalized date", (state: ReturnType<typeof createFinancePersistenceState>) => { state.erp.payments[0].paymentDate = "2026-02-31"; }],
    ["a payment created instant is an impossible normalized date", (state: ReturnType<typeof createFinancePersistenceState>) => { state.erp.payments[0].createdAt = "2026-02-31T10:00:00.000Z"; }],
    ["a payment updated instant is an impossible normalized date", (state: ReturnType<typeof createFinancePersistenceState>) => { state.erp.payments[0].updatedAt = "2026-02-31T10:00:00.000Z"; }],
    ["an invoice total differs from exact source lines", (state: ReturnType<typeof createFinancePersistenceState>) => { state.erp.supplierInvoices[0].totalAmount += 1; }],
    ["an invoice references a missing source document", (state: ReturnType<typeof createFinancePersistenceState>) => { state.erp.supplierInvoices[0].sourceDocumentIds = ["missing-receipt"]; }],
    ["two active invoices cover the same source quantities", (state: ReturnType<typeof createFinancePersistenceState>) => { state.erp.supplierInvoices.push({ ...state.erp.supplierInvoices[0], id: "duplicate-source-invoice", invoiceNumber: "SINV-2026-0002", status: "unpaid" }); }],
    ["invoice status disagrees with non-voided paid amount", (state: ReturnType<typeof createFinancePersistenceState>) => { state.erp.supplierInvoices[0].status = "unpaid"; }],
    ["a payment has the wrong direction for its invoice", (state: ReturnType<typeof createFinancePersistenceState>) => { state.erp.payments[0].direction = "receivable"; }],
    ["a payment has the wrong counterparty for its invoice", (state: ReturnType<typeof createFinancePersistenceState>) => { state.erp.payments[0].supplierId = "supplier-kertas"; }],
    ["a posted payment amount is not positive", (state: ReturnType<typeof createFinancePersistenceState>) => { state.erp.payments[0].amount = 0; }],
    ["payment identifiers are not unique", (state: ReturnType<typeof createFinancePersistenceState>) => { state.erp.payments.push({ ...state.erp.payments[0] }); }],
    ["posted payments exceed the original invoice total", (state: ReturnType<typeof createFinancePersistenceState>) => { state.erp.payments[0].amount = 11_000_000; }],
    ["a finance audit detail contains a nested value", (state: ReturnType<typeof createFinancePersistenceState>) => { (state.erp.auditLogs.at(-1)!.detail as Record<string, unknown>).nested = { unsafe: true }; }],
  ])("fails closed when %s", (_label, mutate) => {
    const state = createFinancePersistenceState();
    mutate(state);

    expect(loadDemoState(JSON.stringify(state)).recoveryReason).toBe("INVALID_SCHEMA");
  });
});
