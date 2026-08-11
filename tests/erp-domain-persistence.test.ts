import { describe, expect, it } from "vitest";
import { createSeedState } from "../lib/demo/seed";
import { loadDemoState } from "../lib/demo/persistence";
import { approveGoodsReceipt, createGoodsReceipt } from "../lib/erp/commands/inventory";
import { completeDelivery, confirmSalesOrder, createDeliveryOrder, createSalesOrder } from "../lib/erp/commands/sales";
import type { DemoState } from "../lib/domain/types";

const now = "2026-08-09T10:00:00.000Z";

function selectedQuotationChain(): DemoState {
  const state = createSeedState();
  const quantity = 40;
  state.erp.purchaseRequests = [{
    id: "purchase-request-linked",
    requestNumber: "PR-2026-0001",
    requesterRole: "procurement",
    sourceSalesOrderId: null,
    status: "approved",
    lines: [{ productId: "product-router", quantity, unitPrice: 1_050_000 }],
    createdAt: now,
    updatedAt: now,
  }];
  state.erp.requestForQuotations = [{
    id: "rfq-linked",
    rfqNumber: "RFQ-2026-0001",
    purchaseRequestId: "purchase-request-linked",
    warehouseId: "warehouse-jakarta",
    requestedSupplierIds: ["supplier-utama"],
    selectedQuotationId: "quotation-linked",
    quoteDueAt: "2026-08-10T10:00:00.000Z",
    status: "selected",
    lines: [{ productId: "product-router", quantity }],
    createdAt: now,
    updatedAt: now,
  }];
  state.erp.supplierQuotations = [{
    id: "quotation-linked",
    quotationNumber: "SQ-2026-0001",
    requestForQuotationId: "rfq-linked",
    supplierId: "supplier-utama",
    validUntil: "2026-08-20",
    status: "selected",
    lines: [{ productId: "product-router", quantity, unitPrice: 1_050_000 }],
    createdAt: now,
    updatedAt: now,
  }];
  state.erp.purchaseOrders[0] = {
    ...state.erp.purchaseOrders[0],
    purchaseRequestId: "purchase-request-linked",
    supplierQuotationId: "quotation-linked",
    lines: [{ productId: "product-router", quantity, unitPrice: 1_050_000 }],
  };
  return state;
}

function recoveryReason(state: DemoState) {
  return loadDemoState(JSON.stringify(state)).recoveryReason;
}

function withCancelledPartiallyReceivedPurchaseOrder(quantity = 10): DemoState {
  const state = createSeedState();
  state.erp.purchaseOrders[0] = { ...state.erp.purchaseOrders[0], status: "confirmed" };
  const receipt = createGoodsReceipt(state.erp, "warehouse", {
    purchaseOrderId: state.erp.purchaseOrders[0].id,
    lines: [{ productId: "product-router", quantity }],
  }, now);
  if (!receipt.ok) throw new Error(receipt.error.message);
  const approved = approveGoodsReceipt(receipt.state, "warehouse", receipt.value.id, "2026-08-09T10:01:00.000Z");
  if (!approved.ok) throw new Error(approved.error.message);
  state.erp = approved.state;
  state.erp.purchaseOrders[0] = { ...state.erp.purchaseOrders[0], status: "cancelled" };
  return state;
}

function withCancelledPartiallyDeliveredSalesOrder(quantity = 1): DemoState {
  const state = createSeedState();
  state.erp.salesOrders = [];
  state.erp.deliveryOrders = [];
  state.erp.purchaseRequests = [];
  const created = createSalesOrder(state.erp, "sales", {
    customerId: "erp-customer-sinar",
    lines: [{ productId: "product-router", quantity: 2, unitPrice: 1_500_000 }],
  }, now);
  if (!created.ok) throw new Error(created.error.message);
  const confirmed = confirmSalesOrder(created.state, "sales", created.value.id, "2026-08-09T10:01:00.000Z");
  if (!confirmed.ok) throw new Error(confirmed.error.message);
  const delivery = createDeliveryOrder(confirmed.state, "warehouse", {
    salesOrderId: created.value.id,
    lines: [{ productId: "product-router", quantity }],
  }, "2026-08-09T10:02:00.000Z");
  if (!delivery.ok) throw new Error(delivery.error.message);
  const posted = completeDelivery(delivery.state, "warehouse", delivery.value.id, "2026-08-09T10:03:00.000Z");
  if (!posted.ok) throw new Error(posted.error.message);
  state.erp = posted.state;
  state.erp.salesOrders = state.erp.salesOrders.map((order) => order.id === created.value.id ? { ...order, status: "cancelled" } : order);
  return state;
}

describe("deep v10 purchasing and execution persistence invariants", () => {
  it.each([
    ["zero product sale price", (state: DemoState) => { state.erp.products[0].salePrice = 0; }],
    ["zero product purchase price", (state: DemoState) => { state.erp.products[0].purchasePrice = 0; }],
    ["negative product reorder point", (state: DemoState) => { state.erp.products[0].reorderPoint = -1; }],
    ["negative customer credit limit", (state: DemoState) => { state.erp.customers[0].creditLimit = -1; }],
    ["negative supplier payment term", (state: DemoState) => { state.erp.suppliers[0].paymentTermDays = -1; }],
    ["fractional supplier payment term", (state: DemoState) => { state.erp.suppliers[0].paymentTermDays = 0.5; }],
    ["unsafe supplier payment term", (state: DemoState) => { state.erp.suppliers[0].paymentTermDays = Number.MAX_SAFE_INTEGER + 1; }],
  ] as const)("rejects persisted master data with %s", (_label, mutate) => {
    const state = createSeedState();
    mutate(state);

    expect(recoveryReason(state)).toBe("INVALID_SCHEMA");
  });

  it("accepts one eligible exact-demand selected quotation chain", () => {
    expect(recoveryReason(selectedQuotationChain())).toBeNull();
  });
  it("rejects a quotation whose valid-through value is an ISO instant instead of a calendar date", () => {
    const state = selectedQuotationChain();
    state.erp.supplierQuotations[0].validUntil = "2026-08-20T00:00:00.000Z";

    expect(recoveryReason(state)).toBe("INVALID_SCHEMA");
  });


  it.each([0, 0.5])("rejects a linked purchasing chain whose canonical quantity is %s", (quantity) => {
    const state = selectedQuotationChain();
    state.erp.purchaseRequests[0].lines[0].quantity = quantity;
    state.erp.requestForQuotations[0].lines[0].quantity = quantity;
    state.erp.supplierQuotations[0].lines[0].quantity = quantity;
    state.erp.purchaseOrders[0].lines[0].quantity = quantity;

    expect(recoveryReason(state)).toBe("INVALID_SCHEMA");
  });

  it("rejects an RFQ linked to an ineligible Purchase Request", () => {
    const state = selectedQuotationChain();
    state.erp.purchaseRequests[0].status = "draft";

    expect(recoveryReason(state)).toBe("INVALID_SCHEMA");
  });

  it("rejects multiple non-cancelled RFQs for the same approved Purchase Request", () => {
    const state = selectedQuotationChain();
    state.erp.requestForQuotations.push({
      ...state.erp.requestForQuotations[0],
      id: "rfq-duplicate-active",
      rfqNumber: "RFQ-2026-0002",
      selectedQuotationId: null,
      status: "open",
    });

    expect(recoveryReason(state)).toBe("INVALID_SCHEMA");
  });

  it("rejects an RFQ whose demand differs from its approved Purchase Request", () => {
    const state = selectedQuotationChain();
    state.erp.purchaseRequests[0].lines[0].quantity = 41;

    expect(recoveryReason(state)).toBe("INVALID_SCHEMA");
  });

  it("rejects two non-terminal Purchase Orders consuming one selected quotation", () => {
    const state = selectedQuotationChain();
    state.erp.purchaseOrders.push({
      ...state.erp.purchaseOrders[0],
      id: "purchase-order-duplicate-quotation",
      orderNumber: "PO-2026-0002",
      status: "draft",
    });

    expect(recoveryReason(state)).toBe("INVALID_SCHEMA");
  });

  it("rejects a cancelled Purchase Order that already has approved receipt evidence", () => {
    expect(recoveryReason(withCancelledPartiallyReceivedPurchaseOrder())).toBe("INVALID_SCHEMA");
  });

  it("rejects a cancelled Sales Order that already has posted delivery evidence", () => {
    expect(recoveryReason(withCancelledPartiallyDeliveredSalesOrder())).toBe("INVALID_SCHEMA");
  });

  it.each([[10, "partially_received"], [40, "fully_received"]] as const)("normalizes a legacy v9 cancelled PO with exact receipt evidence to %s units / %s", (quantity, status) => {
    const legacy = withCancelledPartiallyReceivedPurchaseOrder(quantity);
    (legacy as unknown as { schemaVersion: number }).schemaVersion = 9;
    const loaded = loadDemoState(JSON.stringify(legacy));

    expect(loaded.recoveryReason).toBeNull();
    expect(loaded.state.erp.purchaseOrders[0].status).toBe(status);
  });

  it.each([[1, "partially_delivered"], [2, "fully_delivered"]] as const)("normalizes a legacy v9 cancelled SO with exact delivery evidence to %s units / %s", (quantity, status) => {
    const legacy = withCancelledPartiallyDeliveredSalesOrder(quantity);
    (legacy as unknown as { schemaVersion: number }).schemaVersion = 9;
    const loaded = loadDemoState(JSON.stringify(legacy));

    expect(loaded.recoveryReason).toBeNull();
    expect(loaded.state.erp.salesOrders[0].status).toBe(status);
  });
});
