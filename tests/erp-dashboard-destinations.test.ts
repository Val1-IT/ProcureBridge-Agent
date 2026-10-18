import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StockMovementsPage from "../app/inventory/movements/page";
import StockAdjustmentsPage from "../app/inventory/adjustments/page";
import GoodsReceiptsPage from "../app/purchasing/receipts/page";
import SupplierFollowUpPage from "../app/purchasing/follow-up/page";
import PayablesPage from "../app/finance/payables/page";
import ReceivablesPage from "../app/finance/receivables/page";
import { createSeedState } from "../lib/demo/seed";
import type { DemoState } from "../lib/domain/types";
import { buildActionItems } from "../lib/erp/dashboard";

const harness = vi.hoisted(() => ({ query: "", state: null as DemoState | null }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(harness.query),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/components/demo-store-provider", () => ({ useDemoStore: () => ({ state: harness.state }) }));
vi.mock("@/components/erp-command-provider", () => ({ useErpCommands: () => ({ run: () => { throw new Error("Destination render must not execute commands."); } }) }));

function destinationState(): DemoState {
  const state = createSeedState();
  state.updatedAt = "2026-08-09T10:00:00.000Z";
  state.erp.activeRole = "approver";
  state.erp.products[0] = { ...state.erp.products[0], reorderPoint: 40 };
  state.erp.purchaseOrders[0] = { ...state.erp.purchaseOrders[0], status: "confirmed", promisedDeliveryDate: "2026-08-08" };
  state.erp.goodsReceipts = [{ id: "receipt-target", receiptNumber: "GR-2026-0042", purchaseOrderId: "po-router-replenishment", warehouseId: "warehouse-jakarta", status: "draft", lines: [{ productId: "product-router", quantity: 5, unitPrice: 1_050_000 }], createdAt: "2026-08-09T09:00:00.000Z", updatedAt: "2026-08-09T09:00:00.000Z" }];
  state.erp.stockAdjustments = [
    { id: "adjustment-target", adjustmentNumber: "SA-2026-0042", productId: "product-router", warehouseId: "warehouse-jakarta", quantityDelta: -1, reason: "Target cycle count", status: "pending", proposedByRole: "warehouse", approvedByRole: null, approvedAt: null, createdAt: "2026-08-09T09:00:00.000Z", updatedAt: "2026-08-09T09:00:00.000Z" },
    { id: "adjustment-other", adjustmentNumber: "SA-2026-0043", productId: "product-scanner", warehouseId: "warehouse-jakarta", quantityDelta: 1, reason: "Other cycle count", status: "pending", proposedByRole: "warehouse", approvedByRole: null, approvedAt: null, createdAt: "2026-08-09T09:01:00.000Z", updatedAt: "2026-08-09T09:01:00.000Z" },
  ];
  state.erp.supplierInvoices = [
    { id: "payable-target", invoiceNumber: "SINV-2026-0042", purchaseOrderId: "po-router-replenishment", salesOrderId: null, supplierId: "supplier-utama", customerId: null, sourceDocumentIds: ["receipt-target"], status: "unpaid", lines: [{ productId: "product-router", quantity: 5, unitPrice: 1_050_000 }], totalAmount: 5_250_000, dueDate: "2026-08-10", createdAt: "2026-08-09T09:00:00.000Z", updatedAt: "2026-08-09T09:00:00.000Z" },
    { id: "payable-other", invoiceNumber: "SINV-2026-0043", purchaseOrderId: "po-router-replenishment", salesOrderId: null, supplierId: "supplier-utama", customerId: null, sourceDocumentIds: ["receipt-other"], status: "unpaid", lines: [{ productId: "product-router", quantity: 1, unitPrice: 1_050_000 }], totalAmount: 1_050_000, dueDate: "2026-08-10", createdAt: "2026-08-09T09:01:00.000Z", updatedAt: "2026-08-09T09:01:00.000Z" },
  ];
  state.erp.customerInvoices = [
    { id: "receivable-target", invoiceNumber: "CINV-2026-0042", purchaseOrderId: null, salesOrderId: "so-router-shortage", supplierId: null, customerId: "erp-customer-sinar", sourceDocumentIds: ["delivery-target"], status: "unpaid", lines: [{ productId: "product-router", quantity: 2, unitPrice: 1_500_000 }], totalAmount: 3_000_000, dueDate: "2026-08-10", createdAt: "2026-08-09T09:00:00.000Z", updatedAt: "2026-08-09T09:00:00.000Z" },
    { id: "receivable-other", invoiceNumber: "CINV-2026-0043", purchaseOrderId: null, salesOrderId: "so-router-shortage", supplierId: null, customerId: "erp-customer-sinar", sourceDocumentIds: ["delivery-other"], status: "unpaid", lines: [{ productId: "product-router", quantity: 1, unitPrice: 1_500_000 }], totalAmount: 1_500_000, dueDate: "2026-08-10", createdAt: "2026-08-09T09:01:00.000Z", updatedAt: "2026-08-09T09:01:00.000Z" },
  ];
  return state;
}

function openAction(kind: ReturnType<typeof buildActionItems>[number]["kind"], documentNumber: string, page: () => React.ReactNode): string {
  const item = buildActionItems(harness.state!.erp, "2026-08-09T10:00:00.000Z").find((candidate) => candidate.kind === kind && candidate.documentNumber === documentNumber);
  if (!item) throw new Error(`Missing ${kind} action for ${documentNumber}.`);
  harness.query = new URL(item.href, "https://demo.invalid").searchParams.toString();
  return renderToStaticMarkup(createElement(page));
}

describe("Task 11 action destinations", () => {
  beforeEach(() => { harness.state = destinationState(); harness.query = ""; });

  it("opens the exact low-stock product stock card", () => {
    const item = buildActionItems(harness.state!.erp, "2026-08-09T10:00:00.000Z").find((candidate) => candidate.kind === "low_stock" && candidate.documentNumber === "SKU-ROUTER-01");
    expect(item?.href).toBe("/inventory/movements?productId=product-router");
    const html = openAction("low_stock", "SKU-ROUTER-01", StockMovementsPage);
    expect(html).toContain("Router Bisnis");
    expect(html).not.toContain("Barcode Scanner");
  });

  it("opens the exact draft Goods Receipt in its PO preparation panel", () => {
    const html = openAction("pending_receipt", "GR-2026-0042", GoodsReceiptsPage);
    expect(html).toContain("GR-2026-0042");
    expect(html).toContain("ready for approval");
  });

  it("opens only the advertised payable invoice", () => {
    const html = openAction("due_payable", "SINV-2026-0042", PayablesPage);
    expect(html).toContain("SINV-2026-0042");
    expect(html).not.toContain("SINV-2026-0043");
  });

  it("opens only the advertised receivable invoice", () => {
    const html = openAction("due_receivable", "CINV-2026-0042", ReceivablesPage);
    expect(html).toContain("CINV-2026-0042");
    expect(html).not.toContain("CINV-2026-0043");
  });

  it("opens only the advertised Stock Adjustment approval", () => {
    const html = openAction("stock_adjustment_approval", "SA-2026-0042", StockAdjustmentsPage);
    expect(html).toContain("SA-2026-0042");
    expect(html).not.toContain("SA-2026-0043");
  });

  it("opens the advertised Supplier Follow-up approval handoff", () => {
    const html = openAction("supplier_follow_up", "PO-2026-0001", SupplierFollowUpPage);
    expect(html).toContain("Supplier Agent approval handoff");
    expect(html).toContain("PO-2026-0001");
  });
});
