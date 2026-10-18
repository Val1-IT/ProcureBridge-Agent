import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PurchaseOrderDetailPage from "../app/purchasing/orders/[orderId]/page";
import SalesOrderDetailPage from "../app/sales/orders/[orderId]/page";
import { createSeedState } from "../lib/demo/seed";
import type { DemoState } from "../lib/domain/types";
import { createCustomerInvoice, recordSupplierInvoice } from "../lib/erp/commands/finance";
import { approveGoodsReceipt, createGoodsReceipt } from "../lib/erp/commands/inventory";
import { cancelPurchaseOrder, confirmPurchaseOrder } from "../lib/erp/commands/purchasing";
import { cancelSalesOrder, completeDelivery, confirmSalesOrder, createDeliveryOrder } from "../lib/erp/commands/sales";
import { createErpSeedState } from "../lib/erp/seed";
import type { ErpState } from "../lib/erp/types";

const confirmedAt = "2026-08-09T08:00:00.000Z";
const executedAt = "2026-08-09T09:00:00.000Z";
const cancelledAt = "2026-08-09T10:00:00.000Z";
const invoicedAt = "2026-08-10T10:00:00.000Z";

const harness = vi.hoisted(() => ({
  orderId: "po-router-replenishment",
  state: null as DemoState | null,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ orderId: harness.orderId }),
}));

vi.mock("@/components/demo-store-provider", () => ({
  useDemoStore: () => {
    if (!harness.state) throw new Error("Test DemoState was not configured.");
    return { state: harness.state };
  },
}));

vi.mock("@/components/erp-command-provider", () => {
  const unexpectedCommand = () => { throw new Error("Render test must not execute commands."); };
  return {
    useErpCommands: () => ({
      purchaseOrderAction: unexpectedCommand,
      cancelPurchaseOrder: unexpectedCommand,
      confirmSalesOrder: unexpectedCommand,
      cancelSalesOrder: unexpectedCommand,
      createPurchaseRequestFromShortage: unexpectedCommand,
    }),
  };
});

function confirmedPurchaseOrder(): ErpState {
  const state = createErpSeedState();
  const confirmed = confirmPurchaseOrder(state, "procurement", state.purchaseOrders[0].id, confirmedAt);
  if (!confirmed.ok) throw new Error(confirmed.error.message);
  return confirmed.state;
}

function withApprovedReceipt(): { state: ErpState; receiptId: string } {
  const confirmed = confirmedPurchaseOrder();
  const draft = createGoodsReceipt(confirmed, "warehouse", {
    purchaseOrderId: confirmed.purchaseOrders[0].id,
    lines: [{ productId: "product-router", quantity: 10 }],
  }, executedAt);
  if (!draft.ok) throw new Error(draft.error.message);
  const approved = approveGoodsReceipt(draft.state, "warehouse", draft.value.id, cancelledAt);
  if (!approved.ok) throw new Error(approved.error.message);
  return { state: approved.state, receiptId: approved.value.id };
}

function confirmedSalesOrder(): ErpState {
  const state = createErpSeedState();
  state.salesOrders[0] = {
    ...state.salesOrders[0],
    lines: [{ ...state.salesOrders[0].lines[0], quantity: 20 }],
  };
  const confirmed = confirmSalesOrder(state, "sales", state.salesOrders[0].id, confirmedAt);
  if (!confirmed.ok) throw new Error(confirmed.error.message);
  return confirmed.state;
}

function withPostedDelivery(): { state: ErpState; deliveryId: string } {
  const confirmed = confirmedSalesOrder();
  const draft = createDeliveryOrder(confirmed, "warehouse", {
    salesOrderId: confirmed.salesOrders[0].id,
    lines: [{ productId: "product-router", quantity: 8 }],
  }, executedAt);
  if (!draft.ok) throw new Error(draft.error.message);
  const posted = completeDelivery(draft.state, "warehouse", draft.value.id, cancelledAt);
  if (!posted.ok) throw new Error(posted.error.message);
  return { state: posted.state, deliveryId: posted.value.id };
}

function renderState(erp: ErpState, role: ErpState["activeRole"], orderId: string): DemoState {
  const state = createSeedState();
  state.erp = erp;
  state.erp.activeRole = role;
  state.updatedAt = cancelledAt;
  harness.state = state;
  harness.orderId = orderId;
  return state;
}

describe("executed-order cancellation and finance evidence", () => {
  beforeEach(() => {
    harness.state = null;
    harness.orderId = "po-router-replenishment";
  });

  it("rejects Purchase Order cancellation after any approved receipt without mutation", () => {
    const fixture = withApprovedReceipt();
    const staleParent = structuredClone(fixture.state);
    staleParent.purchaseOrders[0].status = "confirmed";

    const actualLifecycle = cancelPurchaseOrder(fixture.state, "procurement", fixture.state.purchaseOrders[0].id, invoicedAt);
    const defensiveLifecycle = cancelPurchaseOrder(staleParent, "procurement", staleParent.purchaseOrders[0].id, invoicedAt);

    expect(actualLifecycle).toMatchObject({ ok: false, state: fixture.state, error: { code: "INVALID_STATE" } });
    expect(defensiveLifecycle).toMatchObject({ ok: false, state: staleParent, error: { code: "INVALID_STATE" } });
  });

  it("rejects Sales Order cancellation after any posted delivery without mutation", () => {
    const fixture = withPostedDelivery();
    const staleParent = structuredClone(fixture.state);
    staleParent.salesOrders[0].status = "confirmed";

    const actualLifecycle = cancelSalesOrder(fixture.state, "sales", fixture.state.salesOrders[0].id, invoicedAt);
    const defensiveLifecycle = cancelSalesOrder(staleParent, "sales", staleParent.salesOrders[0].id, invoicedAt);

    expect(actualLifecycle).toMatchObject({ ok: false, state: fixture.state, error: { code: "INVALID_STATE" } });
    expect(defensiveLifecycle).toMatchObject({ ok: false, state: staleParent, error: { code: "INVALID_STATE" } });
  });

  it("still allows cancellation before either order has execution evidence", () => {
    const purchaseState = confirmedPurchaseOrder();
    const salesState = confirmedSalesOrder();

    expect(cancelPurchaseOrder(purchaseState, "procurement", purchaseState.purchaseOrders[0].id, cancelledAt)).toMatchObject({ ok: true, value: { status: "cancelled" } });
    expect(cancelSalesOrder(salesState, "sales", salesState.salesOrders[0].id, cancelledAt)).toMatchObject({ ok: true, value: { status: "cancelled" } });
  });

  it("hides the Purchase Order cancellation action once receipt execution exists", () => {
    const unexecuted = confirmedPurchaseOrder();
    renderState(unexecuted, "procurement", unexecuted.purchaseOrders[0].id);
    const beforeExecution = renderToStaticMarkup(createElement(PurchaseOrderDetailPage));

    const executed = withApprovedReceipt().state;
    renderState(executed, "procurement", executed.purchaseOrders[0].id);
    const afterExecution = renderToStaticMarkup(createElement(PurchaseOrderDetailPage));

    expect(beforeExecution).toContain("Batalkan PO");
    expect(afterExecution).not.toContain("Batalkan PO");
  });

  it("hides the Sales Order cancellation action once delivery execution exists", () => {
    const unexecuted = confirmedSalesOrder();
    renderState(unexecuted, "sales", unexecuted.salesOrders[0].id);
    const beforeExecution = renderToStaticMarkup(createElement(SalesOrderDetailPage));

    const executed = withPostedDelivery().state;
    renderState(executed, "sales", executed.salesOrders[0].id);
    const afterExecution = renderToStaticMarkup(createElement(SalesOrderDetailPage));

    expect(beforeExecution).toContain("Cancel Sales Order");
    expect(afterExecution).not.toContain("Cancel Sales Order");
  });

  it("keeps approved receipt evidence invoiceable after cancellation is rejected", () => {
    const fixture = withApprovedReceipt();
    const cancellation = cancelPurchaseOrder(fixture.state, "procurement", fixture.state.purchaseOrders[0].id, invoicedAt);
    expect(cancellation).toMatchObject({ ok: false, state: fixture.state, error: { code: "INVALID_STATE" } });

    const result = recordSupplierInvoice(cancellation.state, "finance", {
      purchaseOrderId: fixture.state.purchaseOrders[0].id,
      sourceDocumentIds: [fixture.receiptId],
      dueDate: "2026-09-08",
    }, invoicedAt);

    expect(result).toMatchObject({
      ok: true,
      value: { sourceDocumentIds: [fixture.receiptId], totalAmount: 10_500_000 },
      state: { purchaseOrders: [{ status: "partially_received" }] },
    });
  });

  it("keeps posted delivery evidence invoiceable after cancellation is rejected", () => {
    const fixture = withPostedDelivery();
    const cancellation = cancelSalesOrder(fixture.state, "sales", fixture.state.salesOrders[0].id, invoicedAt);
    expect(cancellation).toMatchObject({ ok: false, state: fixture.state, error: { code: "INVALID_STATE" } });

    const result = createCustomerInvoice(cancellation.state, "finance", {
      salesOrderId: fixture.state.salesOrders[0].id,
      sourceDocumentIds: [fixture.deliveryId],
      dueDate: "2026-09-08",
    }, invoicedAt);

    expect(result).toMatchObject({
      ok: true,
      value: { sourceDocumentIds: [fixture.deliveryId], totalAmount: 12_000_000 },
      state: { salesOrders: [{ status: "partially_delivered" }] },
    });
  });
});
