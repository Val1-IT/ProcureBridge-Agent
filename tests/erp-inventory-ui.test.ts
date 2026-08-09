import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InventoryPage from "../app/inventory/page";
import StockAdjustmentsPage from "../app/inventory/adjustments/page";
import StockMovementsPage from "../app/inventory/movements/page";
import GoodsReceiptsPage, { executeReceiptApproval, executeReceiptDraftCreation } from "../app/purchasing/receipts/page";
import { createSeedState } from "../lib/demo/seed";
import type { DemoState } from "../lib/domain/types";
import { buildReceiptPreparationRows } from "../lib/erp/purchasing-view-model";
import type { ErpCommandResult } from "../lib/erp/errors";
import type { ErpState } from "../lib/erp/types";

const harness = vi.hoisted(() => ({ query: "", state: null as DemoState | null }));

vi.mock("next/navigation", () => ({
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

describe("inventory pages", () => {
  beforeEach(() => {
    harness.state = createSeedState();
    harness.query = "";
  });

  it("renders physical, reserved, available, and incoming stock per product", () => {
    const html = renderToStaticMarkup(createElement(InventoryPage));

    expect(html).toContain("Stock Overview");
    expect(html).toContain("Physical");
    expect(html).toContain("Reserved");
    expect(html).toContain("Available");
    expect(html).toContain("Incoming");
    expect(html).toContain("Router Bisnis");
    expect(html).toContain(">30<");
    expect(html).toContain(">12<");
    expect(html).toContain(">18<");
    expect(html).toContain(">40<");
  });

  it("renders movement source, actor, time, signed quantity, and resulting balance", () => {
    const html = renderToStaticMarkup(createElement(StockMovementsPage));

    expect(html).toContain("Stock Movements");
    expect(html).toContain("Opening balance");
    expect(html).toContain("System");
    expect(html).toContain("+30");
    expect(html).toContain("Balance 30");
  });

  it("shows adjustment approval only to a distinct approval role", () => {
    harness.state!.erp.stockAdjustments = [{
      id: "stock-adjustment-sa-2026-0001",
      adjustmentNumber: "SA-2026-0001",
      warehouseId: "warehouse-jakarta",
      productId: "product-router",
      quantityDelta: -2,
      reason: "Cycle count variance",
      status: "pending",
      proposedByRole: "warehouse",
      approvedByRole: null,
      approvedAt: null,
      createdAt: "2026-08-09T10:00:00.000Z",
      updatedAt: "2026-08-09T10:00:00.000Z",
    }];
    harness.state!.erp.activeRole = "warehouse";
    const warehouseHtml = renderToStaticMarkup(createElement(StockAdjustmentsPage));
    harness.state!.erp.activeRole = "approver";
    const approverHtml = renderToStaticMarkup(createElement(StockAdjustmentsPage));

    expect(warehouseHtml).toContain("Role approver diperlukan");
    expect(warehouseHtml).not.toContain(">Approve adjustment<");
    expect(approverHtml).toContain(">Approve adjustment<");
  });

  it("previews receipt balances and exposes the command-backed create action", () => {
    harness.state!.erp.purchaseOrders[0] = { ...harness.state!.erp.purchaseOrders[0], status: "confirmed" };
    harness.query = "purchaseOrderId=po-router-replenishment&mode=prepare";

    const html = renderToStaticMarkup(createElement(GoodsReceiptsPage));

    expect(html).toContain("Current 30");
    expect(html).toContain("After receipt 70");
    expect(html).toContain(">Create Goods Receipt draft<");
    expect(html).toContain("Validation errors will be shown here");
    expect(html).toContain('aria-label="Receive Router Bisnis"');
    expect(html).toContain('max="40"');
  });

  it("creates a partial receipt through the page boundary and routes approval to durable receipt context", () => {
    let erp = createSeedState().erp;
    erp.purchaseOrders[0] = { ...erp.purchaseOrders[0], status: "confirmed" };
    const selected = buildReceiptPreparationRows(erp)[0];
    const run = <T,>(command: (state: ErpState) => ErpCommandResult<T>): ErpCommandResult<T> => {
      const result = command(erp);
      if (result.ok) erp = result.state;
      return result;
    };

    const draft = executeReceiptDraftCreation(run, selected, { "product-router": 10 }, "2026-08-09T10:00:00.000Z");
    expect(draft).toMatchObject({ ok: true, value: { status: "draft", lines: [{ productId: "product-router", quantity: 10 }] } });
    let destination = "";
    const approved = executeReceiptApproval(run, draft.ok ? draft.value.id : "missing", "2026-08-09T11:00:00.000Z", (href) => { destination = href; });

    expect(approved).toMatchObject({ ok: true, value: { status: "approved" } });
    expect(erp.purchaseOrders[0].status).toBe("partially_received");
    expect(destination).toBe(`/purchasing/receipts?goodsReceiptId=${draft.ok ? draft.value.id : "missing"}&purchaseOrderId=po-router-replenishment&status=approved`);
  });

  it("does not present draft or missing receipt IDs as approved receipt context", () => {
    harness.state!.erp.goodsReceipts = [{
      id: "draft-gr", receiptNumber: "GR-2026-0009", purchaseOrderId: "po-router-replenishment", warehouseId: "warehouse-jakarta", status: "draft",
      lines: [{ productId: "product-router", quantity: 2, unitPrice: 1_050_000 }], createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z",
    }];
    harness.query = "goodsReceiptId=draft-gr&status=approved";
    const draftHtml = renderToStaticMarkup(createElement(GoodsReceiptsPage));
    harness.query = "goodsReceiptId=missing-gr&status=approved";
    const missingHtml = renderToStaticMarkup(createElement(GoodsReceiptsPage));

    for (const html of [draftHtml, missingHtml]) {
      expect(html).toContain("Goods Receipt is not approved or was not found");
      expect(html).not.toContain("Approved Goods Receipt and linked purchase order");
      expect(html).not.toContain(">Approved GR<");
      expect(html).not.toContain(">Affected PO<");
    }
  });
});
