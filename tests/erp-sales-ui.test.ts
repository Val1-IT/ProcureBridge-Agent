import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeliveryOrdersPage, { executeDeliveryCompletion, executeDeliveryCreation } from "../app/sales/deliveries/page";
import SalesOrderDetailPage, { executeSalesOrderConfirmation, executeShortagePurchaseRequest } from "../app/sales/orders/[orderId]/page";
import SalesOrdersPage from "../app/sales/orders/page";
import { createSeedState } from "../lib/demo/seed";
import type { DemoState } from "../lib/domain/types";
import type { ErpCommandResult } from "../lib/erp/errors";
import type { ErpState } from "../lib/erp/types";

const harness = vi.hoisted(() => ({ orderId: "so-router-shortage", query: "", state: null as DemoState | null }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ orderId: harness.orderId }),
  useSearchParams: () => new URLSearchParams(harness.query),
  useRouter: () => ({ replace: () => undefined }),
}));

vi.mock("@/components/demo-store-provider", () => ({
  useDemoStore: () => {
    if (!harness.state) throw new Error("Test DemoState was not configured.");
    return { state: harness.state };
  },
}));

vi.mock("@/components/erp-command-provider", () => ({
  useErpCommands: () => ({ run: () => { throw new Error("Render test must not execute commands."); } }),
}));

describe("sales pages", () => {
  beforeEach(() => {
    harness.state = createSeedState();
    harness.orderId = "so-router-shortage";
    harness.query = "";
  });

  it("renders the sales order list with availability, shortage, delivered, linked documents, and eligible action", () => {
    const html = renderToStaticMarkup(createElement(SalesOrdersPage));

    expect(html).toContain("Sales Orders");
    expect(html).toContain("SO-2026-0001");
    expect(html).toContain("Available 30");
    expect(html).toContain("Shortage 5");
    expect(html).toContain("Reserved 0");
    expect(html).toContain("Delivered 0");
    expect(html).toContain("Create Purchase Request");
    expect(html).toContain("Demo Data");
  });

  it("renders detail links, per-line availability, shortage reason, quantities, and command-eligible actions", () => {
    const html = renderToStaticMarkup(createElement(SalesOrderDetailPage));

    expect(html).toContain("Available stock is insufficient to confirm this Sales Order.");
    expect(html).toContain("Router Bisnis");
    expect(html).toContain("Available before confirmation");
    expect(html).toContain("Reserved");
    expect(html).toContain("Delivered");
    expect(html).toContain("Purchase requests (0)");
    expect(html).toContain("Delivery orders (0)");
    expect(html).toContain("Create Purchase Request");
    expect(html).not.toContain(">Confirm Sales Order<");
  });

  it("executes confirmation and shortage conversion through the page command runner", () => {
    let erp = createSeedState().erp;
    erp.salesOrders[0] = { ...erp.salesOrders[0], lines: [{ ...erp.salesOrders[0].lines[0], quantity: 20 }] };
    const run = <T,>(command: (state: ErpState) => ErpCommandResult<T>): ErpCommandResult<T> => {
      const result = command(erp);
      if (result.ok) erp = result.state;
      return result;
    };

    const confirmed = executeSalesOrderConfirmation(run, "sales", "so-router-shortage", "2026-08-09T10:00:00.000Z");
    expect(confirmed).toMatchObject({ ok: true, value: { status: "confirmed" } });
    erp.salesOrders[0] = { ...erp.salesOrders[0], id: "shortage", orderNumber: "SO-2026-0002", status: "draft", lines: [{ ...erp.salesOrders[0].lines[0], quantity: 42, deliveredQuantity: 0 }] };
    const request = executeShortagePurchaseRequest(run, "sales", "shortage", "2026-08-09T11:00:00.000Z");
    expect(request).toMatchObject({ ok: true, value: { status: "draft", sourceSalesOrderId: "shortage", lines: [{ quantity: 12 }] } });
  });

  it("renders delivery monitoring and gates posting to Warehouse or Admin", () => {
    harness.state!.erp.salesOrders[0] = { ...harness.state!.erp.salesOrders[0], status: "confirmed", lines: [{ ...harness.state!.erp.salesOrders[0].lines[0], quantity: 20 }] };
    harness.state!.erp.activeRole = "sales";
    const salesHtml = renderToStaticMarkup(createElement(DeliveryOrdersPage));
    harness.state!.erp.activeRole = "warehouse";
    const warehouseHtml = renderToStaticMarkup(createElement(DeliveryOrdersPage));

    expect(salesHtml).toContain("Deliveries");
    expect(salesHtml).toContain("Reserved 20");
    expect(salesHtml).toContain("Warehouse or Admin role is required to complete delivery");
    expect(warehouseHtml).toContain("Create Delivery Order draft");
  });

  it("creates and completes a delivery through the page command runner", () => {
    let erp = createSeedState().erp;
    erp.salesOrders[0] = { ...erp.salesOrders[0], status: "confirmed", lines: [{ ...erp.salesOrders[0].lines[0], quantity: 20, deliveredQuantity: 0 }] };
    const run = <T,>(command: (state: ErpState) => ErpCommandResult<T>): ErpCommandResult<T> => {
      const result = command(erp);
      if (result.ok) erp = result.state;
      return result;
    };

    const draft = executeDeliveryCreation(run, "warehouse", { salesOrderId: "so-router-shortage", lines: [{ productId: "product-router", quantity: 8 }] }, "2026-08-09T10:00:00.000Z");
    expect(draft).toMatchObject({ ok: true, value: { status: "draft" } });
    const completed = executeDeliveryCompletion(run, "warehouse", draft.ok ? draft.value.id : "missing", "2026-08-09T11:00:00.000Z");
    expect(completed).toMatchObject({ ok: true, value: { status: "posted" } });
    expect(erp.salesOrders[0]).toMatchObject({ status: "partially_delivered", lines: [{ deliveredQuantity: 8 }] });
  });
});
