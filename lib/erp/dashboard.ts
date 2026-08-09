import type { AuditLog } from "../domain/types";
import { selectPayableBalance, selectReceivableBalance } from "./selectors-finance";
import { selectAvailableStock, selectSalesShortage, selectSupplierFollowUpQueue } from "./selectors";
import type { ErpAuditEvent, ErpRole, ErpState } from "./types";

export interface DashboardMetrics { pendingPurchaseOrderApprovals: number; unconfirmedPurchaseOrders: number; overduePurchaseOrders: number; lowStockProducts: number; pendingGoodsReceipts: number; blockedSalesOrders: number; openPayables: number; openReceivables: number; supplierFollowUps: number; }
export type ActionUrgency = "high" | "medium" | "low";
export type ActionKind = "purchase_order_approval" | "stock_adjustment_approval" | "supplier_result_approval" | "unconfirmed_purchase_order" | "overdue_purchase_order" | "low_stock" | "blocked_sales_order" | "pending_receipt" | "due_payable" | "due_receivable" | "supplier_follow_up";
export interface ActionItem { id: string; kind: ActionKind; ownerRole: ErpRole; urgency: ActionUrgency; title: string; detail: string; documentNumber: string; href: string; dueAt: string | null; }
export type ApprovalItem = ActionItem & { kind: "purchase_order_approval" | "stock_adjustment_approval" | "supplier_result_approval"; ownerRole: "approver"; };
export interface UnifiedAuditEntry { id: string; source: "erp" | "legacy_recovery"; module: "purchasing" | "inventory" | "sales" | "finance" | "supplier_agent" | "control" | "legacy_recovery"; action: string; actor: string; entityType: string; entityId: string; documentNumber: string; detail: unknown; createdAt: string; }
export interface AuditFilters { actor?: string; module?: string; action?: string; date?: string; documentNumber?: string; }

function time(value: string | null): number | null { if (!value) return null; const parsed = new Date(value).getTime(); return Number.isNaN(parsed) ? null : parsed; }
function isPurchaseOrderOverdue(order: ErpState["purchaseOrders"][number], nowTime: number): boolean { const due = order.status === "sent" ? time(order.confirmationDueAt) : ["confirmed", "partially_received"].includes(order.status) ? time(order.promisedDeliveryDate) : null; return due !== null && due < nowTime; }
function openInvoiceCount(invoices: ErpState["supplierInvoices"] | ErpState["customerInvoices"]): number { return invoices.filter((invoice) => invoice.status === "unpaid" || invoice.status === "partially_paid").length; }

export function buildDashboardMetrics(state: ErpState, now: string): DashboardMetrics {
  const nowTime = time(now) ?? Number.POSITIVE_INFINITY;
  return {
    pendingPurchaseOrderApprovals: state.purchaseOrders.filter((order) => order.status === "pending_approval").length,
    unconfirmedPurchaseOrders: state.purchaseOrders.filter((order) => order.status === "sent").length,
    overduePurchaseOrders: state.purchaseOrders.filter((order) => isPurchaseOrderOverdue(order, nowTime)).length,
    lowStockProducts: state.products.filter((product) => product.active && selectAvailableStock(state, product.id) <= product.reorderPoint).length,
    pendingGoodsReceipts: state.goodsReceipts.filter((receipt) => receipt.status === "draft").length,
    blockedSalesOrders: state.salesOrders.filter((order) => order.status === "draft" && selectSalesShortage(state, order.id).length > 0).length,
    openPayables: openInvoiceCount(state.supplierInvoices), openReceivables: openInvoiceCount(state.customerInvoices), supplierFollowUps: selectSupplierFollowUpQueue(state, now).length,
  };
}

function approvalItems(state: ErpState): ApprovalItem[] {
  const purchaseOrders: ApprovalItem[] = state.purchaseOrders.filter((order) => order.status === "pending_approval").map((order) => ({ id: `purchase-order-approval:${order.id}`, kind: "purchase_order_approval", ownerRole: "approver", urgency: "high", title: "Purchase Order approval", detail: "Review commercial scope before the order can be sent.", documentNumber: order.orderNumber, href: `/purchasing/orders/${order.id}`, dueAt: order.confirmationDueAt }));
  const adjustments: ApprovalItem[] = state.stockAdjustments.filter((adjustment) => adjustment.status === "pending").map((adjustment) => ({ id: `stock-adjustment-approval:${adjustment.id}`, kind: "stock_adjustment_approval", ownerRole: "approver", urgency: "high", title: "Stock Adjustment approval", detail: adjustment.reason, documentNumber: adjustment.adjustmentNumber, href: `/inventory/adjustments?adjustmentId=${adjustment.id}`, dueAt: adjustment.createdAt }));
  const results: ApprovalItem[] = state.supplierResults.filter((result) => result.status === "pending" || result.status === "human_review").map((result) => { const order = state.purchaseOrders.find((item) => item.id === result.purchaseOrderId); return { id: `supplier-result-approval:${result.id}`, kind: "supplier_result_approval", ownerRole: "approver", urgency: result.status === "human_review" ? "high" : "medium", title: "Supplier Agent result approval", detail: result.summary, documentNumber: order?.orderNumber ?? result.id, href: `/supplier-calls/${result.supplierCallId}/result`, dueAt: result.createdAt }; });
  return [...purchaseOrders, ...adjustments, ...results];
}
export function buildApprovalItems(state: ErpState, now: string): ApprovalItem[] { void now; return approvalItems(state); }
function invoiceUrgency(dueDate: string, nowTime: number): ActionUrgency { const due = time(`${dueDate}T23:59:59.999Z`); if (due === null || due < nowTime) return "high"; return due - nowTime <= 3 * 86_400_000 ? "medium" : "low"; }
function invoiceIsDueSoon(dueDate: string, nowTime: number): boolean { const due = time(`${dueDate}T23:59:59.999Z`); return due !== null && due - nowTime <= 7 * 86_400_000; }

export function buildActionItems(state: ErpState, now: string): ActionItem[] {
  const nowTime = time(now) ?? Number.POSITIVE_INFINITY; const items: ActionItem[] = [...approvalItems(state)];
  for (const order of state.purchaseOrders) {
    if (order.status === "sent") items.push({ id: `unconfirmed-purchase-order:${order.id}`, kind: "unconfirmed_purchase_order", ownerRole: "procurement", urgency: isPurchaseOrderOverdue(order, nowTime) ? "high" : "medium", title: "Supplier confirmation required", detail: "Purchase Order is sent but not confirmed.", documentNumber: order.orderNumber, href: `/purchasing/orders/${order.id}`, dueAt: order.confirmationDueAt });
    if (isPurchaseOrderOverdue(order, nowTime)) items.push({ id: `overdue-purchase-order:${order.id}`, kind: "overdue_purchase_order", ownerRole: "procurement", urgency: "high", title: "Purchase Order overdue", detail: "The current supplier milestone is overdue.", documentNumber: order.orderNumber, href: `/purchasing/orders/${order.id}`, dueAt: order.status === "sent" ? order.confirmationDueAt : order.promisedDeliveryDate });
  }
  for (const product of state.products.filter((item) => item.active && selectAvailableStock(state, item.id) <= item.reorderPoint)) items.push({ id: `low-stock:${product.id}`, kind: "low_stock", ownerRole: "warehouse", urgency: selectAvailableStock(state, product.id) <= 0 ? "high" : "medium", title: "Low stock", detail: `${product.name} is at or below its reorder point.`, documentNumber: product.sku, href: `/inventory/movements?productId=${product.id}`, dueAt: null });
  for (const order of state.salesOrders.filter((item) => item.status === "draft" && selectSalesShortage(state, item.id).length > 0)) items.push({ id: `blocked-sales-order:${order.id}`, kind: "blocked_sales_order", ownerRole: "sales", urgency: "high", title: "Sales Order blocked by stock", detail: "Available stock cannot cover every order line.", documentNumber: order.orderNumber, href: `/sales/orders/${order.id}`, dueAt: null });
  for (const receipt of state.goodsReceipts.filter((item) => item.status === "draft")) items.push({ id: `pending-receipt:${receipt.id}`, kind: "pending_receipt", ownerRole: "warehouse", urgency: "medium", title: "Goods Receipt awaiting review", detail: "Approve only after quantity and condition checks.", documentNumber: receipt.receiptNumber, href: `/purchasing/receipts?purchaseOrderId=${receipt.purchaseOrderId}&mode=prepare&goodsReceiptId=${receipt.id}`, dueAt: receipt.createdAt });
  for (const invoice of state.supplierInvoices.filter((item) => item.status !== "cancelled" && selectPayableBalance(state, item.id) > 0 && invoiceIsDueSoon(item.dueDate, nowTime))) items.push({ id: `due-payable:${invoice.id}`, kind: "due_payable", ownerRole: "finance", urgency: invoiceUrgency(invoice.dueDate, nowTime), title: "Payable due", detail: "Supplier invoice has an open balance approaching its due date.", documentNumber: invoice.invoiceNumber, href: `/finance/payables?invoiceId=${invoice.id}`, dueAt: invoice.dueDate });
  for (const invoice of state.customerInvoices.filter((item) => item.status !== "cancelled" && selectReceivableBalance(state, item.id) > 0 && invoiceIsDueSoon(item.dueDate, nowTime))) items.push({ id: `due-receivable:${invoice.id}`, kind: "due_receivable", ownerRole: "finance", urgency: invoiceUrgency(invoice.dueDate, nowTime), title: "Receivable due", detail: "Customer invoice has an open balance approaching its due date.", documentNumber: invoice.invoiceNumber, href: `/finance/receivables?invoiceId=${invoice.id}`, dueAt: invoice.dueDate });
  for (const item of selectSupplierFollowUpQueue(state, now)) items.push({ id: `supplier-follow-up:${item.purchaseOrder.id}`, kind: "supplier_follow_up", ownerRole: "procurement", urgency: item.reasons.some((reason) => reason === "confirmation_overdue" || reason === "delivery_overdue") ? "high" : "medium", title: "Supplier follow-up", detail: item.reasons.join(", ").replaceAll("_", " "), documentNumber: item.purchaseOrder.orderNumber, href: `/purchasing/follow-up?purchaseOrderId=${item.purchaseOrder.id}&mode=approval`, dueAt: item.dueAt });
  const urgencyOrder: Record<ActionUrgency, number> = { high: 0, medium: 1, low: 2 }; return items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || a.ownerRole.localeCompare(b.ownerRole) || a.id.localeCompare(b.id));
}

function moduleForEntity(entityType: string): UnifiedAuditEntry["module"] { if (["purchase_request", "request_for_quotation", "supplier_quotation", "purchase_order", "goods_receipt"].includes(entityType)) return "purchasing"; if (["stock_adjustment", "stock_movement"].includes(entityType)) return "inventory"; if (["sales_order", "delivery_order"].includes(entityType)) return "sales"; if (["trade_invoice", "payment"].includes(entityType)) return "finance"; if (["supplier_call", "supplier_call_result", "supplier_follow_up", "follow_up", "dispute"].includes(entityType)) return "supplier_agent"; return "control"; }
function eventPurchaseOrderId(state: ErpState, event: ErpAuditEvent): string | null {
  const detailedId = event.detail.purchaseOrderId;
  if (typeof detailedId === "string" && detailedId) return detailedId;
  if (event.entityType === "supplier_call") return state.supplierCalls.find((item) => item.id === event.entityId)?.purchaseOrderId ?? state.supplierApprovals.find((item) => item.supplierCallId === event.entityId)?.purchaseOrderId ?? null;
  if (event.entityType === "supplier_call_result") return state.supplierResults.find((item) => item.id === event.entityId)?.purchaseOrderId ?? null;
  if (event.entityType === "supplier_follow_up" || event.entityType === "follow_up") return state.followUps.find((item) => item.id === event.entityId)?.purchaseOrderId ?? null;
  if (event.entityType === "dispute") return state.disputes.find((item) => item.id === event.entityId)?.purchaseOrderId ?? null;
  return null;
}
function detailDocumentNumber(state: ErpState, event: ErpAuditEvent): string {
  for (const key of ["orderNumber", "requestNumber", "rfqNumber", "quotationNumber", "receiptNumber", "adjustmentNumber", "deliveryNumber", "invoiceNumber", "paymentNumber"]) { const value = event.detail[key]; if (typeof value === "string" && value) return value; }
  const purchaseOrderId = eventPurchaseOrderId(state, event);
  if (purchaseOrderId) return state.purchaseOrders.find((item) => item.id === purchaseOrderId)?.orderNumber ?? purchaseOrderId;
  return event.entityId;
}
export function buildUnifiedAuditEntries(state: ErpState, legacyLogs: readonly AuditLog[]): UnifiedAuditEntry[] { const erp = state.auditLogs.map((event): UnifiedAuditEntry => ({ id: `erp:${event.id}`, source: "erp", module: moduleForEntity(event.entityType), action: event.action, actor: `${event.actorRole} ${event.actorId}`, entityType: event.entityType, entityId: event.entityId, documentNumber: detailDocumentNumber(state, event), detail: event.detail, createdAt: event.createdAt })); const legacy = legacyLogs.map((event): UnifiedAuditEntry => ({ id: `legacy:${event.id}`, source: "legacy_recovery", module: "legacy_recovery", action: event.action, actor: `${event.actorType} ${event.actorId}`, entityType: event.entityType, entityId: event.entityId, documentNumber: event.entityId, detail: { before: event.beforeData, after: event.afterData, requestId: event.apiRequestId ?? null }, createdAt: event.createdAt })); return [...erp, ...legacy].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)); }
export function filterUnifiedAuditEntries(entries: readonly UnifiedAuditEntry[], filters: AuditFilters): UnifiedAuditEntry[] { const includes = (value: string, query: string | undefined) => !query?.trim() || value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()); return entries.filter((entry) => includes(entry.actor, filters.actor) && (!filters.module || filters.module === "all" || entry.module === filters.module) && includes(entry.action, filters.action) && (!filters.date || entry.createdAt.slice(0, 10) === filters.date) && includes(entry.documentNumber, filters.documentNumber)); }
