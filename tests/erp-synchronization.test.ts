import { expect, it } from "vitest";
import { createCustomerInvoice, recordSupplierInvoice } from "../lib/erp/commands/finance";
import { approveGoodsReceipt, createGoodsReceipt } from "../lib/erp/commands/inventory";
import { confirmPurchaseOrder } from "../lib/erp/commands/purchasing";
import { completeDelivery, confirmSalesOrder, createDeliveryOrder } from "../lib/erp/commands/sales";
import { saveSupplierCallApproval } from "../lib/erp/commands/supplier-calls";
import { approveSupplierResult, completeSupplierCallSimulation, recordSupplierCallStarted } from "../lib/erp/commands/supplier-results";
import { buildActionItems, buildDashboardMetrics } from "../lib/erp/dashboard";
import type { ErpCommandResult } from "../lib/erp/errors";
import { createErpSeedState } from "../lib/erp/seed";
import type { ErpState } from "../lib/erp/types";

function apply<T>(state: ErpState, command: (current: ErpState) => ErpCommandResult<T>): { state: ErpState; value: T } { const result = command(state); if (!result.ok) throw new Error(result.error.message); expect(result.state.revision).toBe(state.revision + 1); return { state: result.state, value: result.value }; }
function runPrimaryDemoCommands(initial: ErpState): ErpState {
  let state = initial;
  state = apply(state, (current) => saveSupplierCallApproval(current, "approver", { supplierCallId: "supplier-call-primary", supplierId: "supplier-utama", purchaseOrderId: "po-router-replenishment", scenario: "delivery_commitment", objective: "Confirm the delivery date without changing quantity or price.", permittedProductIds: ["product-router"], maximumDeliveryDate: "2026-08-20", partialDeliveryAllowed: true, maximumUnitPriceIncreasePercent: 0, language: "Bahasa Indonesia", approvedBy: "Nadia Pratama" }, "2026-08-09T01:00:00.000Z")).state;
  state = apply(state, (current) => recordSupplierCallStarted(current, "approver", "supplier-call-primary", { callId: "supplier-call-primary", providerCallId: "supplier_mock_primary", provider: "mock", status: "connecting" }, "2026-08-09", "2026-08-09T03:00:00.000Z")).state;
  state = apply(state, (current) => completeSupplierCallSimulation(current, "approver", "supplier-call-primary", "2026-08-09T04:00:00.000Z")).state;
  const resultId = state.supplierResults.find((result) => result.status === "pending")?.id;
  if (!resultId) throw new Error("Primary flow did not produce a pending Supplier Agent result.");
  state = apply(state, (current) => approveSupplierResult(current, "approver", resultId, "2026-08-09T04:05:00.000Z")).state;
  state = apply(state, (current) => confirmPurchaseOrder(current, "procurement", "po-router-replenishment", "2026-08-09T04:10:00.000Z")).state;
  const receipt = apply(state, (current) => createGoodsReceipt(current, "warehouse", { purchaseOrderId: "po-router-replenishment", lines: [{ productId: "product-router", quantity: 40 }] }, "2026-08-09T05:00:00.000Z")); state = receipt.state;
  state = apply(state, (current) => approveGoodsReceipt(current, "warehouse", receipt.value.id, "2026-08-09T05:05:00.000Z")).state;
  state = apply(state, (current) => confirmSalesOrder(current, "sales", "so-router-shortage", "2026-08-09T06:00:00.000Z")).state;
  const delivery = apply(state, (current) => createDeliveryOrder(current, "warehouse", { salesOrderId: "so-router-shortage", lines: [{ productId: "product-router", quantity: 35 }] }, "2026-08-09T07:00:00.000Z")); state = delivery.state;
  state = apply(state, (current) => completeDelivery(current, "warehouse", delivery.value.id, "2026-08-09T07:05:00.000Z")).state;
  state = apply(state, (current) => recordSupplierInvoice(current, "finance", { purchaseOrderId: "po-router-replenishment", sourceDocumentIds: [receipt.value.id], dueDate: "2026-08-16" }, "2026-08-09T08:00:00.000Z")).state;
  state = apply(state, (current) => createCustomerInvoice(current, "finance", { salesOrderId: "so-router-shortage", sourceDocumentIds: [delivery.value.id], dueDate: "2026-08-16" }, "2026-08-09T08:05:00.000Z")).state;
  return state;
}

it("updates dashboard and action items after the primary workflow through real commands", () => {
  const finalState = runPrimaryDemoCommands(createErpSeedState()); const metrics = buildDashboardMetrics(finalState, "2026-08-09T10:00:00.000Z");
  expect(metrics.overduePurchaseOrders).toBe(0); expect(metrics.lowStockProducts).toBe(0); expect(metrics.openPayables).toBe(1); expect(metrics.openReceivables).toBe(1);
  expect(buildActionItems(finalState, "2026-08-09T10:00:00.000Z").some((item) => item.kind === "supplier_follow_up")).toBe(false);
  expect(finalState.purchaseOrders[0]).toMatchObject({ status: "completed", promisedDeliveryDate: "2026-08-20" }); expect(finalState.salesOrders[0].status).toBe("invoiced");
  expect(finalState.auditLogs.map((event) => event.action)).toEqual(expect.arrayContaining(["supplier_result.approved", "goods_receipt.approved", "delivery_order.completed", "supplier_invoice.recorded", "customer_invoice.created"]));
});
