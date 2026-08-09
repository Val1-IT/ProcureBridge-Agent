import { authorize } from "./permissions";
import { selectSupplierFollowUpQueue, selectSupplierQuotationComparison, type SupplierFollowUpReason } from "./selectors";
import type { ErpRole, ErpState, PurchaseOrder, PurchaseOrderStatus, QuantityLine } from "./types";

export type PurchaseOrderPrimaryAction = "submit" | "approve" | "confirm" | "prepare_receipt";
export type PurchaseOrderCommandAction = Exclude<PurchaseOrderPrimaryAction, "prepare_receipt">;
export type PurchaseOrderNextAction = PurchaseOrderPrimaryAction | "await_approval" | "await_confirmation" | "follow_up" | "complete" | "none";

export interface PurchaseOrderRow {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  totalAmount: number;
  approvalStatus: "draft" | "pending" | "approved" | "rejected" | "cancelled";
  expectedDate: string | null;
  receivedQuantity: number;
  orderedQuantity: number;
  receivedPercent: number;
  nextAction: PurchaseOrderNextAction;
  overdue: boolean;
  needsFollowUp: boolean;
  detailHref: string;
}

export interface PurchaseOrderFilters {
  status?: PurchaseOrderStatus | "all";
  supplierId?: string | "all";
  overdue?: "all" | "overdue" | "follow_up" | "on_track";
}

export interface PurchaseRequestRow {
  id: string;
  requestNumber: string;
  status: string;
  requesterRole: ErpRole;
  totalAmount: number;
  lineCount: number;
  rfqNumber: string | null;
  rfqStatus: string | null;
  quotationCount: number;
  selectedQuotationNumber: string | null;
  selectedSupplierName: string | null;
  linkedPurchaseOrderNumber: string | null;
  quotationComparison: Array<{ id: string; rank: number; supplierName: string; quotationNumber: string; totalAmount: number; validUntil: string; selected: boolean }>;
}

export interface ReceiptPreparationRow {
  purchaseOrderId: string;
  orderNumber: string;
  supplierName: string;
  status: "confirmed" | "partially_received";
  orderedQuantity: number;
  receivedQuantity: number;
  outstandingQuantity: number;
  lines: ReceiptPreparationLine[];
  prepareHref: string;
  postingEnabled: true;
  disabledReason: null;
}

export interface ReceiptPreparationLine {
  productId: string;
  orderedQuantity: number;
  receivedQuantity: number;
  outstandingQuantity: number;
}

export type SupplierFollowUpReasonCode = "CONFIRMATION_OVERDUE" | "DELIVERY_OVERDUE" | "PARTIAL_RECEIPT_OUTSTANDING" | "APPROVED_FOLLOW_UP_DUE";

export interface SupplierFollowUpRow {
  id: string;
  purchaseOrderId: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  totalAmount: number;
  priority: "high" | "medium";
  reasonCode: SupplierFollowUpReasonCode;
  reason: string;
  dueAt: string | null;
  approvalHref: string;
  startCallHref: null;
}

const followUpCopy: Readonly<Record<SupplierFollowUpReason, { code: SupplierFollowUpReasonCode; priority: "high" | "medium"; reason: string }>> = {
  confirmation_overdue: { code: "CONFIRMATION_OVERDUE", priority: "high", reason: "Supplier belum mengonfirmasi PO melewati batas konfirmasi." },
  delivery_overdue: { code: "DELIVERY_OVERDUE", priority: "high", reason: "Tanggal pengiriman yang dijanjikan sudah terlewati." },
  partial_receipt_outstanding: { code: "PARTIAL_RECEIPT_OUTSTANDING", priority: "medium", reason: "Penerimaan masih parsial dan kuantitas PO belum terpenuhi." },
  approved_follow_up_due: { code: "APPROVED_FOLLOW_UP_DUE", priority: "medium", reason: "Tindak lanjut yang telah disetujui sudah jatuh tempo." },
};

export function buildPurchaseOrderRows(state: ErpState, role: ErpRole, now: string): PurchaseOrderRow[] {
  const followUpByOrder = new Map(selectSupplierFollowUpQueue(state, now).map((item) => [item.purchaseOrder.id, item.reasons]));
  return state.purchaseOrders.flatMap((purchaseOrder) => {
    const supplier = state.suppliers.find((item) => item.id === purchaseOrder.supplierId);
    if (!supplier) return [];
    const orderedQuantity = sumQuantities(purchaseOrder.lines);
    const receivedQuantity = receivedForOrder(state, purchaseOrder.id);
    const reasons = followUpByOrder.get(purchaseOrder.id) ?? [];
    return [{
      id: purchaseOrder.id,
      orderNumber: purchaseOrder.orderNumber,
      supplierId: supplier.id,
      supplierName: supplier.name,
      status: purchaseOrder.status,
      totalAmount: total(purchaseOrder.lines),
      approvalStatus: approvalStatus(purchaseOrder.status),
      expectedDate: purchaseOrder.promisedDeliveryDate ?? purchaseOrder.confirmationDueAt,
      receivedQuantity,
      orderedQuantity,
      receivedPercent: orderedQuantity > 0 ? Math.min(100, Math.round((receivedQuantity / orderedQuantity) * 100)) : 0,
      nextAction: nextOperationalAction(purchaseOrder, role, reasons),
      overdue: reasons.some((reason) => reason === "confirmation_overdue" || reason === "delivery_overdue"),
      needsFollowUp: reasons.length > 0,
      detailHref: `/purchasing/orders/${purchaseOrder.id}`,
    }];
  }).sort((left, right) => left.orderNumber.localeCompare(right.orderNumber));
}

export function executePurchaseOrderAction(state: ErpState, role: ErpRole, action: PurchaseOrderCommandAction, purchaseOrderId: string, now: string): ErpCommandResult<PurchaseOrder> {
  if (action === "submit") return submitPurchaseOrder(state, role, purchaseOrderId, now);
  if (action === "approve") return approvePurchaseOrder(state, role, purchaseOrderId, now);
  return confirmPurchaseOrder(state, role, purchaseOrderId, now);
}

export function filterPurchaseOrderRows(rows: readonly PurchaseOrderRow[], filters: PurchaseOrderFilters): PurchaseOrderRow[] {
  return rows.filter((row) => {
    if (filters.status && filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.supplierId && filters.supplierId !== "all" && row.supplierId !== filters.supplierId) return false;
    if (filters.overdue === "overdue" && !row.overdue) return false;
    if (filters.overdue === "follow_up" && !row.needsFollowUp) return false;
    if (filters.overdue === "on_track" && row.needsFollowUp) return false;
    return true;
  });
}

export function buildPurchaseRequestRows(state: ErpState): PurchaseRequestRow[] {
  return state.purchaseRequests.map((request) => {
    const rfq = state.requestForQuotations.find((item) => item.purchaseRequestId === request.id) ?? null;
    const quotations = rfq ? state.supplierQuotations.filter((item) => item.requestForQuotationId === rfq.id) : [];
    const selected = rfq?.selectedQuotationId ? state.supplierQuotations.find((item) => item.id === rfq.selectedQuotationId) ?? null : null;
    const selectedSupplier = selected ? state.suppliers.find((item) => item.id === selected.supplierId) ?? null : null;
    const linkedOrder = state.purchaseOrders.find((item) => item.purchaseRequestId === request.id) ?? null;
    const comparison = rfq ? selectSupplierQuotationComparison(state, rfq.id) : [];
    return {
      id: request.id,
      requestNumber: request.requestNumber,
      status: request.status,
      requesterRole: request.requesterRole,
      totalAmount: total(request.lines),
      lineCount: request.lines.length,
      rfqNumber: rfq?.rfqNumber ?? null,
      rfqStatus: rfq?.status ?? null,
      quotationCount: quotations.length,
      selectedQuotationNumber: selected?.quotationNumber ?? null,
      selectedSupplierName: selectedSupplier?.name ?? null,
      linkedPurchaseOrderNumber: linkedOrder?.orderNumber ?? null,
      quotationComparison: comparison.map((item) => ({
        id: item.quotation.id,
        rank: item.rank,
        supplierName: item.supplier.name,
        quotationNumber: item.quotation.quotationNumber,
        totalAmount: item.totalAmount,
        validUntil: item.quotation.validUntil,
        selected: item.quotation.status === "selected",
      })),
    };
  }).sort((left, right) => left.requestNumber.localeCompare(right.requestNumber));
}

export function buildPurchaseOrderDetailModel(state: ErpState, role: ErpRole, purchaseOrderId: string, now: string) {
  const purchaseOrder = state.purchaseOrders.find((item) => item.id === purchaseOrderId);
  if (!purchaseOrder) return null;
  const supplier = state.suppliers.find((item) => item.id === purchaseOrder.supplierId);
  if (!supplier) return null;
  const row = buildPurchaseOrderRows(state, role, now).find((item) => item.id === purchaseOrderId);
  if (!row) return null;
  const quotation = purchaseOrder.supplierQuotationId ? state.supplierQuotations.find((item) => item.id === purchaseOrder.supplierQuotationId) ?? null : null;
  const rfq = quotation ? state.requestForQuotations.find((item) => item.id === quotation.requestForQuotationId) ?? null : null;
  const quotationSupplier = quotation ? state.suppliers.find((item) => item.id === quotation.supplierId) ?? null : null;
  const comparison = rfq ? selectSupplierQuotationComparison(state, rfq.id) : [];
  const links: { supplier: string; request?: string; receipts: string; followUp: string } = {
    supplier: `/suppliers?supplierId=${supplier.id}`,
    ...(purchaseOrder.purchaseRequestId ? { request: `/purchasing/requests?purchaseRequestId=${purchaseOrder.purchaseRequestId}` } : {}),
    receipts: `/purchasing/receipts?purchaseOrderId=${purchaseOrder.id}&mode=prepare`,
    followUp: `/purchasing/follow-up?purchaseOrderId=${purchaseOrder.id}`,
  };
  return {
    purchaseOrder,
    supplier,
    row,
    links,
    allowedActions: allowedActions(purchaseOrder.status, role),
    lines: purchaseOrder.lines.map((line) => {
      const quantities = receiptLineQuantities(state, purchaseOrder.id, line);
      return { ...line, product: state.products.find((item) => item.id === line.productId) ?? null, receivedQuantity: quantities.receivedQuantity, outstandingQuantity: quantities.outstandingQuantity, lineTotal: line.quantity * line.unitPrice };
    }),
    totalAmount: total(purchaseOrder.lines),
    receipts: state.goodsReceipts.filter((item) => item.purchaseOrderId === purchaseOrder.id),
    calls: state.supplierCalls.filter((item) => item.purchaseOrderId === purchaseOrder.id),
    approvals: state.auditLogs.filter((item) => item.entityId === purchaseOrder.id && ["purchase_order.submitted", "purchase_order.approved", "purchase_order.rejected"].includes(item.action)),
    activity: state.auditLogs.filter((item) => item.entityId === purchaseOrder.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    quotation: quotation && rfq && quotationSupplier ? {
      rfqNumber: rfq.rfqNumber,
      quotationNumber: quotation.quotationNumber,
      supplierName: quotationSupplier.name,
      comparisonRank: comparison.find((item) => item.quotation.id === quotation.id)?.rank ?? null,
      totalAmount: total(quotation.lines),
    } : null,
  };
}

export function buildReceiptPreparationRows(state: ErpState): ReceiptPreparationRow[] {
  return state.purchaseOrders.flatMap((purchaseOrder) => {
    if (purchaseOrder.status !== "confirmed" && purchaseOrder.status !== "partially_received") return [];
    const supplier = state.suppliers.find((item) => item.id === purchaseOrder.supplierId);
    if (!supplier) return [];
    const lines = purchaseOrder.lines.map((line) => receiptLineQuantities(state, purchaseOrder.id, line));
    const orderedQuantity = lines.reduce((sum, line) => sum + line.orderedQuantity, 0);
    const receivedQuantity = lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
    const outstandingQuantity = lines.reduce((sum, line) => sum + line.outstandingQuantity, 0);
    return [{
      purchaseOrderId: purchaseOrder.id,
      orderNumber: purchaseOrder.orderNumber,
      supplierName: supplier.name,
      status: purchaseOrder.status,
      orderedQuantity,
      receivedQuantity,
      outstandingQuantity,
      lines,
      prepareHref: `/purchasing/receipts?purchaseOrderId=${purchaseOrder.id}&mode=prepare`,
      postingEnabled: true as const,
      disabledReason: null,
    }];
  }).sort((left, right) => left.orderNumber.localeCompare(right.orderNumber));
}

export function selectReceiptPreparationFromSearchParams(rows: readonly ReceiptPreparationRow[], searchParams: Pick<URLSearchParams, "get">): ReceiptPreparationRow | null {
  if (searchParams.get("mode") !== "prepare") return null;
  const purchaseOrderId = searchParams.get("purchaseOrderId");
  return rows.find((row) => row.purchaseOrderId === purchaseOrderId) ?? null;
}

export function buildSupplierFollowUpRows(state: ErpState, now: string): SupplierFollowUpRow[] {
  return selectSupplierFollowUpQueue(state, now).flatMap((item) => item.reasons.map((reason, index) => {
    const copy = followUpCopy[reason];
    return {
      id: `${item.purchaseOrder.id}:${copy.code}:${index}`,
      purchaseOrderId: item.purchaseOrder.id,
      orderNumber: item.purchaseOrder.orderNumber,
      supplierId: item.supplier.id,
      supplierName: item.supplier.name,
      totalAmount: total(item.purchaseOrder.lines),
      priority: copy.priority,
      reasonCode: copy.code,
      reason: copy.reason,
      dueAt: item.dueAt,
      approvalHref: `/purchasing/follow-up?purchaseOrderId=${item.purchaseOrder.id}&mode=approval`,
      startCallHref: null,
    };
  })).sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.orderNumber.localeCompare(right.orderNumber));
}

function allowedActions(status: PurchaseOrderStatus, role: ErpRole): PurchaseOrderPrimaryAction[] {
  if (status === "draft" && authorize(role, "purchase.write")) return ["submit"];
  if (status === "pending_approval" && authorize(role, "purchase.approve")) return ["approve"];
  if (status === "sent" && authorize(role, "purchase.write")) return ["confirm"];
  if ((status === "confirmed" || status === "partially_received") && authorize(role, "stock.receive")) return ["prepare_receipt"];
  return [];
}

function nextOperationalAction(purchaseOrder: PurchaseOrder, role: ErpRole, reasons: readonly SupplierFollowUpReason[]): PurchaseOrderNextAction {
  if (purchaseOrder.status === "confirmed" || purchaseOrder.status === "partially_received") return "prepare_receipt";
  if (reasons.length > 0) return "follow_up";
  if (purchaseOrder.status === "draft") return authorize(role, "purchase.write") ? "submit" : "await_approval";
  if (purchaseOrder.status === "pending_approval") return authorize(role, "purchase.approve") ? "approve" : "await_approval";
  if (purchaseOrder.status === "sent") return authorize(role, "purchase.write") ? "confirm" : "await_confirmation";
  if (purchaseOrder.status === "fully_received") return "complete";
  return "none";
}

function approvalStatus(status: PurchaseOrderStatus): PurchaseOrderRow["approvalStatus"] {
  if (status === "draft") return "draft";
  if (status === "pending_approval") return "pending";
  if (status === "rejected") return "rejected";
  if (status === "cancelled") return "cancelled";
  return "approved";
}

function receivedForOrder(state: ErpState, purchaseOrderId: string): number {
  return state.goodsReceipts.filter((item) => item.purchaseOrderId === purchaseOrderId && ["approved", "posted"].includes(item.status)).reduce((sum, receipt) => sum + sumQuantities(receipt.lines), 0);
}

function receivedForProduct(state: ErpState, purchaseOrderId: string, productId: string): number {
  return state.goodsReceipts.filter((item) => item.purchaseOrderId === purchaseOrderId && ["approved", "posted"].includes(item.status)).flatMap((item) => item.lines).filter((line) => line.productId === productId).reduce((sum, line) => sum + line.quantity, 0);
}

function receiptLineQuantities(state: ErpState, purchaseOrderId: string, line: QuantityLine): ReceiptPreparationLine {
  const receivedQuantity = receivedForProduct(state, purchaseOrderId, line.productId);
  return { productId: line.productId, orderedQuantity: line.quantity, receivedQuantity, outstandingQuantity: Math.max(0, line.quantity - receivedQuantity) };
}

function sumQuantities(lines: readonly QuantityLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

function total(lines: readonly QuantityLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}

function priorityRank(priority: SupplierFollowUpRow["priority"]): number {
  return priority === "high" ? 0 : 1;
}
import { approvePurchaseOrder, confirmPurchaseOrder, submitPurchaseOrder } from "./commands/purchasing";
import type { ErpCommandResult } from "./errors";
