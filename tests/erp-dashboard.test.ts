import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ActionCenterPage from "../app/actions/page";
import ApprovalInboxPage from "../app/approvals/page";
import AuditPage from "../app/audit/page";
import DashboardPage from "../app/dashboard/page";
import { createSeedState } from "../lib/demo/seed";
import type { DemoState } from "../lib/domain/types";
import { buildActionItems, buildApprovalItems, buildDashboardMetrics, buildUnifiedAuditEntries, filterUnifiedAuditEntries } from "../lib/erp/dashboard";
import { proposeStockAdjustment } from "../lib/erp/commands/inventory";
import { createPurchaseOrder, submitPurchaseOrder } from "../lib/erp/commands/purchasing";
import { saveSupplierCallApproval } from "../lib/erp/commands/supplier-calls";
import { approveSupplierResult, completeSupplierCallSimulation, recordSupplierCallStarted } from "../lib/erp/commands/supplier-results";
import { buildErpNavigation } from "../lib/erp/navigation";
import type { ErpCommandResult } from "../lib/erp/errors";
import type { ErpState } from "../lib/erp/types";

const harness = vi.hoisted(() => ({ state: null as DemoState | null }));
vi.mock("@/components/demo-store-provider", () => ({ useDemoStore: () => { if (!harness.state) throw new Error("Test DemoState was not configured."); return { state: harness.state }; } }));

function run<T>(state: ErpState, command: (current: ErpState) => ErpCommandResult<T>): ErpCommandResult<T> {
  const result = command(state);
  if (result.ok && result.state.revision !== state.revision + 1) throw new Error("Command did not advance exactly one revision.");
  return result;
}
function expectSuccess<T>(result: ErpCommandResult<T>): Extract<ErpCommandResult<T>, { ok: true }> { if (!result.ok) throw new Error(result.error.message); return result; }

function stateWithAllApprovalKinds(): DemoState {
  const demo = createSeedState();
  let erp = demo.erp;
  const created = expectSuccess(run(erp, (state) => createPurchaseOrder(state, "procurement", { supplierId: "supplier-kertas", lines: [{ productId: "product-paper", quantity: 100, unitPrice: 11_000 }], confirmationDueAt: "2026-08-12T00:00:00.000Z" }, "2026-08-09T00:30:00.000Z")));
  erp = created.state;
  erp = expectSuccess(run(erp, (state) => submitPurchaseOrder(state, "procurement", created.value.id, "2026-08-09T00:40:00.000Z"))).state;
  erp = expectSuccess(run(erp, (state) => proposeStockAdjustment(state, "warehouse", { productId: "product-scanner", quantityDelta: -1, reason: "Cycle count variance" }, "2026-08-09T00:50:00.000Z"))).state;
  erp = expectSuccess(run(erp, (state) => saveSupplierCallApproval(state, "approver", { supplierCallId: "supplier-call-dashboard", supplierId: "supplier-utama", purchaseOrderId: "po-router-replenishment", scenario: "delivery_commitment", objective: "Confirm the approved delivery date.", permittedProductIds: ["product-router"], maximumDeliveryDate: "2026-08-20", partialDeliveryAllowed: true, maximumUnitPriceIncreasePercent: 0, language: "Bahasa Indonesia", approvedBy: "Nadia Pratama" }, "2026-08-09T01:00:00.000Z"))).state;
  erp = expectSuccess(run(erp, (state) => recordSupplierCallStarted(state, "approver", "supplier-call-dashboard", { callId: "supplier-call-dashboard", providerCallId: "supplier_mock_dashboard", provider: "mock", status: "connecting" }, "2026-08-09", "2026-08-09T03:00:00.000Z"))).state;
  erp = expectSuccess(run(erp, (state) => completeSupplierCallSimulation(state, "approver", "supplier-call-dashboard", "2026-08-09T04:00:00.000Z"))).state;
  return { ...demo, erp, updatedAt: "2026-08-09T04:00:00.000Z" };
}

describe("ERP dashboard models", () => {
  it("derives operational metrics from source transactions without storing counters", () => {
    const state = createSeedState().erp;
    expect(buildDashboardMetrics(state, "2026-08-09T10:00:00.000Z")).toEqual({ pendingPurchaseOrderApprovals: 0, unconfirmedPurchaseOrders: 1, overduePurchaseOrders: 1, lowStockProducts: 0, pendingGoodsReceipts: 0, blockedSalesOrders: 1, openPayables: 0, openReceivables: 0, supplierFollowUps: 1 });
    expect(Object.hasOwn(state, "dashboardMetrics")).toBe(false);
  });
  it("creates role-owned actionable work with stable entity links and urgency", () => {
    const items = buildActionItems(createSeedState().erp, "2026-08-09T10:00:00.000Z");
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "unconfirmed_purchase_order", ownerRole: "procurement", urgency: "high", href: "/purchasing/orders/po-router-replenishment" }),
      expect.objectContaining({ kind: "blocked_sales_order", ownerRole: "sales", href: "/sales/orders/so-router-shortage" }),
      expect.objectContaining({ kind: "supplier_follow_up", ownerRole: "procurement", href: "/purchasing/follow-up?purchaseOrderId=po-router-replenishment" }),
    ]));
    expect(items.every((item) => item.id.length > 0 && item.href.startsWith("/") && item.documentNumber.length > 0)).toBe(true);
  });
  it("groups purchase-order, stock-adjustment, and Supplier Agent result approvals", () => {
    const approvals = buildApprovalItems(stateWithAllApprovalKinds().erp, "2026-08-09T10:00:00.000Z");
    expect(approvals.map((item) => item.kind)).toEqual(["purchase_order_approval", "stock_adjustment_approval", "supplier_result_approval"]);
    expect(approvals).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: expect.stringMatching(/^\/purchasing\/orders\//), ownerRole: "approver" }),
      expect.objectContaining({ href: expect.stringMatching(/^\/inventory\/adjustments\?/), ownerRole: "approver" }),
      expect.objectContaining({ href: "/supplier-calls/supplier-call-dashboard/result", ownerRole: "approver" }),
    ]));
  });
});

describe("unified audit filtering", () => {
  it("filters ERP events by actor, module, action, date, and document number", () => {
    const demo = stateWithAllApprovalKinds();
    const entries = buildUnifiedAuditEntries(demo.erp, demo.auditLogs);
    expect(filterUnifiedAuditEntries(entries, { actor: "procurement", module: "purchasing", action: "submitted", date: "2026-08-09", documentNumber: "PO-2026-0002" })).toEqual([expect.objectContaining({ source: "erp", action: "purchase_order.submitted", documentNumber: "PO-2026-0002" })]);
  });
  it("classifies approved Supplier Agent results under the Supplier Agent module", () => {
    const demo = stateWithAllApprovalKinds();
    const resultId = demo.erp.supplierResults.find((result) => result.status === "pending")?.id;
    if (!resultId) throw new Error("Expected pending Supplier Agent result.");
    const approved = expectSuccess(run(demo.erp, (state) => approveSupplierResult(state, "approver", resultId, "2026-08-09T04:05:00.000Z")));

    expect(filterUnifiedAuditEntries(buildUnifiedAuditEntries(approved.state, demo.auditLogs), { module: "supplier_agent", action: "supplier_result.approved" })).toEqual([
      expect.objectContaining({ source: "erp", module: "supplier_agent", action: "supplier_result.approved" }),
    ]);
  });
  it("keeps recovery-era audit events available under the Legacy Recovery module", () => {
    const demo = createSeedState();
    expect(filterUnifiedAuditEntries(buildUnifiedAuditEntries(demo.erp, demo.auditLogs), { module: "legacy_recovery" })).toEqual([expect.objectContaining({ source: "legacy_recovery", action: "demo.seeded", documentNumber: "procurebridge-demo" })]);
  });
});

describe("Task 11 control surfaces", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-09T10:00:00.000Z")); harness.state = stateWithAllApprovalKinds(); });
  afterEach(() => { vi.useRealTimers(); harness.state = null; });
  it("renders the ERP Dashboard as Demo Data with operational cards and stable work links", () => {
    const html = renderToStaticMarkup(createElement(DashboardPage));
    expect(html).toContain("ERP Dashboard"); expect(html).toContain("Demo Data"); expect(html).toContain("Purchase Orders waiting approval"); expect(html).toContain('href="/actions"'); expect(html).not.toContain("Recovery command center");
  });
  it("renders Action Center grouped by owner role and urgency without notification fiction", () => {
    const html = renderToStaticMarkup(createElement(ActionCenterPage));
    expect(html).toContain("Action Center"); expect(html).toContain("Procurement"); expect(html).toContain("Approver"); expect(html).toContain("High urgency"); expect(html).not.toContain("notification");
  });
  it("renders Approval Inbox groups and routes decisions to existing command-backed pages", () => {
    const html = renderToStaticMarkup(createElement(ApprovalInboxPage));
    expect(html).toContain("Approval Inbox"); expect(html).toContain("Purchase Orders"); expect(html).toContain("Stock Adjustments"); expect(html).toContain("Supplier Agent Results"); expect(html).toContain('href="/supplier-calls/supplier-call-dashboard/result"');
  });
  it("renders ERP and Legacy Recovery audit entries with every required filter", () => {
    const html = renderToStaticMarkup(createElement(AuditPage));
    expect(html).toContain("Unified ERP Audit Log"); expect(html).toContain("Legacy Recovery"); for (const label of ["Document number", "Actor", "Module", "Action", "Date"]) expect(html).toContain(label);
  });
  it("adds Action Center to the approved Overview navigation", () => { expect(buildErpNavigation("admin")[0].items.map((item) => item.href)).toEqual(["/dashboard", "/actions"]); });
});
