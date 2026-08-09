import { describe, expect, it } from "vitest";
import type { DemoState } from "../lib/domain/types";
import { deserializeDemoState, loadDemoState } from "../lib/demo/persistence";
import { createSeedState } from "../lib/demo/seed";
import { createErpSeedState } from "../lib/erp/seed";
import { selectAvailableStock, selectIncomingStock } from "../lib/erp/selectors";
import { approveGoodsReceipt, approveStockAdjustment, createGoodsReceipt, proposeStockAdjustment } from "../lib/erp/commands/inventory";

function createStateWithLinkedSelectedQuotation() {
  const state = createSeedState();
  const timestamp = "2026-08-09T00:00:00.000Z";
  state.erp.warehouses.push({ ...state.erp.warehouses[0], id: "warehouse-bandung", code: "WH-BDG", name: "Gudang Bandung", active: false });
  state.erp.purchaseRequests = [
    { id: "request-a", requestNumber: "PR-2026-0001", requesterRole: "procurement", status: "draft", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_000_000 }], createdAt: timestamp, updatedAt: timestamp },
    { id: "request-b", requestNumber: "PR-2026-0002", requesterRole: "procurement", status: "draft", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_000_000 }], createdAt: timestamp, updatedAt: timestamp },
  ];
  state.erp.requestForQuotations = [{ id: "rfq-linked", rfqNumber: "RFQ-2026-0001", purchaseRequestId: "request-a", warehouseId: "warehouse-jakarta", requestedSupplierIds: ["supplier-kertas"], selectedQuotationId: "quotation-linked", status: "selected", quoteDueAt: "2026-08-10T00:00:00.000Z", lines: [{ productId: "product-router", quantity: 40 }], createdAt: timestamp, updatedAt: timestamp }];
  state.erp.supplierQuotations = [{ id: "quotation-linked", quotationNumber: "SQ-2026-0001", requestForQuotationId: "rfq-linked", supplierId: "supplier-kertas", status: "selected", validUntil: "2026-08-20T00:00:00.000Z", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_000_000 }], createdAt: timestamp, updatedAt: timestamp }];
  state.erp.purchaseOrders[0] = { ...state.erp.purchaseOrders[0], supplierId: "supplier-kertas", purchaseRequestId: "request-a", supplierQuotationId: "quotation-linked", warehouseId: "warehouse-jakarta", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_000_000 }] };
  return state;
}

describe("ERP persistence foundation", () => {
  it("migrates schema v2 recovery data into schema v5 with a deterministic ERP slice", () => {
    const legacy = { ...createSeedState(), schemaVersion: 2 } as unknown as DemoState;
    delete (legacy as Partial<DemoState>).erp;

    const migrated = deserializeDemoState(JSON.stringify(legacy));

    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.erp.products.map((item) => item.sku)).toEqual(["SKU-ROUTER-01", "SKU-SCANNER-01", "SKU-PAPER-80"]);
    expect(migrated.erp.revision).toBe(0);
  });

  it("migrates stored schema v3 ERP data with safe RFQ and follow-up approval defaults", () => {
    const legacy = createSeedState();
    legacy.schemaVersion = 3;
    delete (legacy.erp as { requestForQuotations?: unknown }).requestForQuotations;
    delete (legacy.erp as { supplierQuotations?: unknown }).supplierQuotations;
    delete (legacy.erp.purchaseOrders[0] as { supplierQuotationId?: unknown }).supplierQuotationId;

    const migrated = deserializeDemoState(JSON.stringify(legacy));

    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.erp.requestForQuotations).toEqual([]);
    expect(migrated.erp.supplierQuotations).toEqual([]);
    expect(migrated.erp.purchaseOrders[0].supplierQuotationId).toBeNull();
  });

  it("migrates schema v4 ERP data with an empty adjustment proposal collection", () => {
    const legacy = createSeedState();
    legacy.schemaVersion = 4;
    delete (legacy.erp as { stockAdjustments?: unknown }).stockAdjustments;

    const migrated = deserializeDemoState(JSON.stringify(legacy));

    expect(migrated.schemaVersion).toBe(5);
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

  it("fails closed when a schema v3 ERP slice has an invalid role or product entity", () => {
    const malformed = createSeedState();
    malformed.erp.activeRole = "operator" as never;
    malformed.erp.products = [null as never];

    const loaded = loadDemoState(JSON.stringify(malformed));

    expect(loaded.state).toEqual(createSeedState());
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
      id: "quotation-kertas", quotationNumber: "SQ-2026-0001", requestForQuotationId: "rfq-router", supplierId: "supplier-kertas", status: "selected", validUntil: "2026-08-20T00:00:00.000Z", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_000_000 }], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",
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
      state.erp.supplierQuotations = [{ id: "quotation-b", quotationNumber: "SQ-2026-0001", requestForQuotationId: "rfq-b", supplierId: "supplier-kertas", status: "selected", validUntil: "2026-08-20T00:00:00.000Z", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_000_000 }], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" }];
    }],
    ["a selected RFQ points at a quotation that is not selected", (state: ReturnType<typeof createSeedState>) => {
      state.erp.requestForQuotations = [{ id: "rfq-submitted", rfqNumber: "RFQ-2026-0001", purchaseRequestId: null, warehouseId: "warehouse-jakarta", requestedSupplierIds: ["supplier-utama"], selectedQuotationId: "quotation-submitted", status: "selected", quoteDueAt: "2026-08-10T00:00:00.000Z", lines: [{ productId: "product-router", quantity: 40 }], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" }];
      state.erp.supplierQuotations = [{ id: "quotation-submitted", quotationNumber: "SQ-2026-0001", requestForQuotationId: "rfq-submitted", supplierId: "supplier-utama", status: "submitted", validUntil: "2026-08-20T00:00:00.000Z", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_000_000 }], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" }];
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
        id: "payment-1", paymentNumber: "PAY-2026-0001", invoiceId: "missing-invoice", direction: "payable", amount: 1_000, paymentDate: "2026-08-09", status: "posted",
        createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",
      });
    }],
  ])("fails closed when %s", (_case, mutate) => {
    const malformed = createSeedState();
    mutate(malformed);

    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });
});
