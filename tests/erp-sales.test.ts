import { describe, expect, it } from "vitest";
import {
  cancelSalesOrder,
  completeDelivery,
  confirmSalesOrder,
  createDeliveryOrder,
  createPurchaseRequestFromShortage,
  createSalesOrder,
} from "../lib/erp/commands/sales";
import { createErpSeedState } from "../lib/erp/seed";
import { selectAvailableStock, selectPhysicalStock, selectReservedStock, selectSalesShortage } from "../lib/erp/selectors";
import { canTransitionSalesOrder } from "../lib/erp/transitions/sales-order";
import type { ErpState, SalesOrder } from "../lib/erp/types";

const fixedNow = "2026-08-09T10:00:00.000Z";

function cleanState(): ErpState {
  const state = createErpSeedState();
  state.salesOrders = [];
  state.deliveryOrders = [];
  state.purchaseRequests = [];
  return state;
}

function createDraft(state: ErpState, quantity = 20): { state: ErpState; order: SalesOrder } {
  const result = createSalesOrder(state, "sales", {
    customerId: "erp-customer-sinar",
    lines: [{ productId: "product-router", quantity, unitPrice: 1_500_000 }],
  }, fixedNow);
  if (!result.ok) throw new Error(result.error.message);
  return { state: result.state, order: result.value };
}

describe("sales order lifecycle and derived reservations", () => {
  it("defines only the approved sales-order status transitions", () => {
    expect(canTransitionSalesOrder("draft", "confirmed")).toBe(true);
    expect(canTransitionSalesOrder("confirmed", "partially_delivered")).toBe(true);
    expect(canTransitionSalesOrder("partially_delivered", "fully_delivered")).toBe(true);
    expect(canTransitionSalesOrder("fully_delivered", "invoiced")).toBe(true);
    expect(canTransitionSalesOrder("invoiced", "completed")).toBe(true);
    expect(canTransitionSalesOrder("cancelled", "confirmed")).toBe(false);
  });

  it("creates a validated draft with a deterministic document number and no reservation", () => {
    const state = cleanState();

    const result = createSalesOrder(state, "sales", {
      customerId: "erp-customer-sinar",
      lines: [{ productId: "product-router", quantity: 20, unitPrice: 1_500_000 }],
    }, fixedNow);

    expect(result).toMatchObject({ ok: true, value: { orderNumber: "SO-2026-0001", status: "draft", lines: [{ deliveredQuantity: 0 }] } });
    expect(selectReservedStock(result.state, "product-router")).toBe(0);
    expect(result.state.stockMovements).toHaveLength(state.stockMovements.length);
    expect(result.state.revision).toBe(state.revision + 1);
  });

  it("confirms an order only when available stock covers every line", () => {
    const created = createDraft(cleanState(), 22);

    const result = confirmSalesOrder(created.state, "sales", created.order.id, fixedNow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("confirmed");
    expect(selectPhysicalStock(result.state, "product-router")).toBe(30);
    expect(selectReservedStock(result.state, "product-router")).toBe(22);
    expect(selectAvailableStock(result.state, "product-router")).toBe(8);
    expect(result.state.stockMovements).toHaveLength(created.state.stockMovements.length);
  });

  it("does not partially confirm a multi-line shortage and returns the exact first missing quantity", () => {
    const state = cleanState();
    const created = createSalesOrder(state, "sales", {
      customerId: "erp-customer-sinar",
      lines: [
        { productId: "product-router", quantity: 22, unitPrice: 1_500_000 },
        { productId: "product-paper", quantity: 132, unitPrice: 15_000 },
      ],
    }, fixedNow);
    if (!created.ok) throw new Error(created.error.message);

    const result = confirmSalesOrder(created.state, "sales", created.value.id, fixedNow);

    expect(result).toMatchObject({
      ok: false,
      state: created.state,
      error: {
        code: "INSUFFICIENT_STOCK",
        message: "Available stock is insufficient to confirm this Sales Order.",
        details: { productId: "product-paper", availableQuantity: 120, requestedQuantity: 132, shortage: 12 },
      },
    });
    expect(result.state.salesOrders.find((order) => order.id === created.value.id)?.status).toBe("draft");
    expect(result.state.auditLogs).toHaveLength(created.state.auditLogs.length);
  });

  it("derives shortage after reservations owned by other confirmed orders", () => {
    const first = createDraft(cleanState(), 20);
    const confirmed = confirmSalesOrder(first.state, "sales", first.order.id, fixedNow);
    if (!confirmed.ok) throw new Error(confirmed.error.message);
    const second = createDraft(confirmed.state, 12);

    expect(selectSalesShortage(second.state, second.order.id)).toEqual([
      { productId: "product-router", requestedQuantity: 12, availableQuantity: 10, shortage: 2 },
    ]);
  });

  it("cancels a confirmed order by releasing its remaining reservation without movement", () => {
    const created = createDraft(cleanState(), 20);
    const confirmed = confirmSalesOrder(created.state, "sales", created.order.id, fixedNow);
    if (!confirmed.ok) throw new Error(confirmed.error.message);
    const movementCount = confirmed.state.stockMovements.length;

    const result = cancelSalesOrder(confirmed.state, "sales", created.order.id, fixedNow);

    expect(result).toMatchObject({ ok: true, value: { status: "cancelled" } });
    expect(selectReservedStock(result.state, "product-router")).toBe(0);
    expect(selectAvailableStock(result.state, "product-router")).toBe(30);
    expect(result.state.stockMovements).toHaveLength(movementCount);
  });

  it("creates one draft purchase request for each exact unmet quantity and links the source sales order", () => {
    const state = cleanState();
    const created = createSalesOrder(state, "sales", {
      customerId: "erp-customer-sinar",
      lines: [
        { productId: "product-router", quantity: 42, unitPrice: 1_500_000 },
        { productId: "product-paper", quantity: 132, unitPrice: 15_000 },
      ],
    }, fixedNow);
    if (!created.ok) throw new Error(created.error.message);

    const result = createPurchaseRequestFromShortage(created.state, "sales", created.value.id, fixedNow);

    expect(result).toMatchObject({
      ok: true,
      value: {
        requestNumber: "PR-2026-0001",
        requesterRole: "sales",
        status: "draft",
        sourceSalesOrderId: created.value.id,
        lines: [
          { productId: "product-router", quantity: 12, unitPrice: 1_050_000 },
          { productId: "product-paper", quantity: 12, unitPrice: 11_000 },
        ],
      },
    });
    expect(result.state.purchaseOrders).toHaveLength(state.purchaseOrders.length);
    expect(result.state.auditLogs.at(-1)?.action).toBe("purchase_request.created_from_sales_shortage");
  });

  it("rejects sales writes from unauthorized roles without mutation", () => {
    const state = cleanState();
    const created = createDraft(state);

    expect(createSalesOrder(state, "warehouse", { customerId: "erp-customer-sinar", lines: [{ productId: "product-router", quantity: 1, unitPrice: 1 }] }, fixedNow)).toMatchObject({ ok: false, state, error: { code: "FORBIDDEN" } });
    expect(confirmSalesOrder(created.state, "procurement", created.order.id, fixedNow)).toMatchObject({ ok: false, state: created.state, error: { code: "FORBIDDEN" } });
    expect(cancelSalesOrder(created.state, "warehouse", created.order.id, fixedNow)).toMatchObject({ ok: false, state: created.state, error: { code: "FORBIDDEN" } });
  });
});

describe("delivery drafts and atomic completion", () => {
  function confirmedOrder(quantity = 20) {
    const created = createDraft(cleanState(), quantity);
    const confirmed = confirmSalesOrder(created.state, "sales", created.order.id, fixedNow);
    if (!confirmed.ok) throw new Error(confirmed.error.message);
    return { state: confirmed.state, order: confirmed.value };
  }

  it("creates a stock-neutral partial delivery draft from a confirmed reservation", () => {
    const confirmed = confirmedOrder();

    const result = createDeliveryOrder(confirmed.state, "sales", {
      salesOrderId: confirmed.order.id,
      lines: [{ productId: "product-router", quantity: 8 }],
    }, fixedNow);

    expect(result).toMatchObject({ ok: true, value: { deliveryNumber: "DO-2026-0001", status: "draft", lines: [{ productId: "product-router", quantity: 8, unitPrice: 1_500_000 }] } });
    expect(selectPhysicalStock(result.state, "product-router")).toBe(30);
    expect(selectReservedStock(result.state, "product-router")).toBe(20);
  });

  it("completes a partial delivery by reducing physical and reserved stock exactly once", () => {
    const confirmed = confirmedOrder();
    const draft = createDeliveryOrder(confirmed.state, "warehouse", { salesOrderId: confirmed.order.id, lines: [{ productId: "product-router", quantity: 8 }] }, fixedNow);
    if (!draft.ok) throw new Error(draft.error.message);

    const result = completeDelivery(draft.state, "warehouse", draft.value.id, "2026-08-09T11:00:00.000Z");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("posted");
    expect(result.state.salesOrders[0]).toMatchObject({ status: "partially_delivered", lines: [{ deliveredQuantity: 8 }] });
    expect(selectPhysicalStock(result.state, "product-router")).toBe(22);
    expect(selectReservedStock(result.state, "product-router")).toBe(12);
    expect(selectAvailableStock(result.state, "product-router")).toBe(10);
    expect(result.state.stockMovements.at(-1)).toMatchObject({
      type: "delivery",
      direction: "out",
      quantity: 8,
      sourceType: "delivery_order",
      sourceId: draft.value.id,
      actorRole: "warehouse",
      reason: `Completed ${draft.value.deliveryNumber}`,
    });
    expect(result.state.auditLogs.at(-1)?.action).toBe("delivery_order.completed");
    expect(result.state.revision).toBe(draft.state.revision + 1);
  });

  it("marks the sales order fully delivered only when every line is complete", () => {
    const confirmed = confirmedOrder(20);
    const first = createDeliveryOrder(confirmed.state, "warehouse", { salesOrderId: confirmed.order.id, lines: [{ productId: "product-router", quantity: 8 }] }, fixedNow);
    if (!first.ok) throw new Error(first.error.message);
    const firstPosted = completeDelivery(first.state, "warehouse", first.value.id, "2026-08-09T11:00:00.000Z");
    if (!firstPosted.ok) throw new Error(firstPosted.error.message);
    const second = createDeliveryOrder(firstPosted.state, "warehouse", { salesOrderId: confirmed.order.id, lines: [{ productId: "product-router", quantity: 12 }] }, "2026-08-09T12:00:00.000Z");
    if (!second.ok) throw new Error(second.error.message);

    const result = completeDelivery(second.state, "admin", second.value.id, "2026-08-09T13:00:00.000Z");

    expect(result).toMatchObject({ ok: true, state: { salesOrders: [{ status: "fully_delivered", lines: [{ deliveredQuantity: 20 }] }] } });
    expect(selectReservedStock(result.state, "product-router")).toBe(0);
    expect(selectPhysicalStock(result.state, "product-router")).toBe(10);
  });

  it("cancels stale sibling drafts when another delivery fully consumes the reservation", () => {
    const confirmed = confirmedOrder();
    const stale = createDeliveryOrder(confirmed.state, "warehouse", { salesOrderId: confirmed.order.id, lines: [{ productId: "product-router", quantity: 8 }] }, fixedNow);
    if (!stale.ok) throw new Error(stale.error.message);
    const full = createDeliveryOrder(stale.state, "warehouse", { salesOrderId: confirmed.order.id, lines: [{ productId: "product-router", quantity: 20 }] }, "2026-08-09T11:00:00.000Z");
    if (!full.ok) throw new Error(full.error.message);

    const result = completeDelivery(full.state, "warehouse", full.value.id, "2026-08-09T12:00:00.000Z");

    expect(result).toMatchObject({ ok: true, state: { salesOrders: [{ status: "fully_delivered" }] } });
    expect(result.state.deliveryOrders.find((delivery) => delivery.id === stale.value.id)?.status).toBe("cancelled");
  });

  it("allows only Warehouse or Admin to complete a delivery", () => {
    const confirmed = confirmedOrder();
    const draft = createDeliveryOrder(confirmed.state, "sales", { salesOrderId: confirmed.order.id, lines: [{ productId: "product-router", quantity: 8 }] }, fixedNow);
    if (!draft.ok) throw new Error(draft.error.message);

    expect(completeDelivery(draft.state, "sales", draft.value.id, fixedNow)).toMatchObject({ ok: false, state: draft.state, error: { code: "FORBIDDEN" } });
    expect(completeDelivery(draft.state, "procurement", draft.value.id, fixedNow)).toMatchObject({ ok: false, state: draft.state, error: { code: "FORBIDDEN" } });
  });

  it("rejects completion above the remaining reservation after another delivery posts", () => {
    const confirmed = confirmedOrder();
    const stale = createDeliveryOrder(confirmed.state, "warehouse", { salesOrderId: confirmed.order.id, lines: [{ productId: "product-router", quantity: 20 }] }, fixedNow);
    if (!stale.ok) throw new Error(stale.error.message);
    const newer = createDeliveryOrder(stale.state, "warehouse", { salesOrderId: confirmed.order.id, lines: [{ productId: "product-router", quantity: 10 }] }, fixedNow);
    if (!newer.ok) throw new Error(newer.error.message);
    const posted = completeDelivery(newer.state, "warehouse", newer.value.id, "2026-08-09T11:00:00.000Z");
    if (!posted.ok) throw new Error(posted.error.message);

    const result = completeDelivery(posted.state, "warehouse", stale.value.id, "2026-08-09T12:00:00.000Z");

    expect(result).toMatchObject({ ok: false, state: posted.state, error: { code: "INSUFFICIENT_STOCK", details: { productId: "product-router", availableQuantity: 10, requestedQuantity: 20, shortage: 10 } } });
    expect(result.state.stockMovements).toHaveLength(posted.state.stockMovements.length);
  });

  it("rechecks physical stock at posting and fails atomically", () => {
    const confirmed = confirmedOrder();
    const draft = createDeliveryOrder(confirmed.state, "warehouse", { salesOrderId: confirmed.order.id, lines: [{ productId: "product-router", quantity: 20 }] }, fixedNow);
    if (!draft.ok) throw new Error(draft.error.message);
    const state = structuredClone(draft.state);
    state.stockAdjustments.push({
      id: "stock-adjustment-loss", adjustmentNumber: "SA-2026-0001", productId: "product-router", warehouseId: "warehouse-jakarta", quantityDelta: -15,
      reason: "Loss before loading", status: "approved", proposedByRole: "warehouse", approvedByRole: "approver", approvedAt: fixedNow, createdAt: fixedNow, updatedAt: fixedNow,
    });
    state.stockMovements.push({
      id: "stock-movement-loss", productId: "product-router", warehouseId: "warehouse-jakarta", quantity: -15, direction: "adjustment", sourceType: "adjustment", sourceId: "stock-adjustment-loss",
      actorRole: "approver", actorId: "role:approver", reason: "Loss before loading", createdAt: fixedNow, updatedAt: fixedNow,
    });

    const result = completeDelivery(state, "warehouse", draft.value.id, "2026-08-09T11:00:00.000Z");

    expect(result).toMatchObject({ ok: false, state, error: { code: "INSUFFICIENT_STOCK", details: { productId: "product-router", availableQuantity: 15, requestedQuantity: 20, shortage: 5 } } });
    expect(result.state.salesOrders[0].lines[0].deliveredQuantity).toBe(0);
    expect(result.state.stockMovements).toHaveLength(state.stockMovements.length);
  });

  it("cancels linked delivery drafts when cancelling the remaining sales order reservation", () => {
    const confirmed = confirmedOrder();
    const draft = createDeliveryOrder(confirmed.state, "warehouse", { salesOrderId: confirmed.order.id, lines: [{ productId: "product-router", quantity: 8 }] }, fixedNow);
    if (!draft.ok) throw new Error(draft.error.message);

    const result = cancelSalesOrder(draft.state, "sales", confirmed.order.id, "2026-08-09T11:00:00.000Z");

    expect(result).toMatchObject({ ok: true, value: { status: "cancelled" } });
    expect(result.state.deliveryOrders[0].status).toBe("cancelled");
    expect(result.state.stockMovements).toHaveLength(draft.state.stockMovements.length);
  });
});
