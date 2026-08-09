import type { ErpFollowUp, ErpState, PurchaseOrder, Supplier } from "./types";

export type SupplierFollowUpReason = "confirmation_overdue" | "delivery_overdue" | "partial_receipt_outstanding" | "approved_follow_up_due";

export interface SupplierFollowUpQueueItem {
  purchaseOrder: PurchaseOrder;
  supplier: Supplier;
  reasons: SupplierFollowUpReason[];
  dueAt: string | null;
}

export function selectPhysicalStock(state: ErpState, productId: string): number {
  return state.stockMovements.filter((movement) => movement.productId === productId).reduce((sum, movement) => sum + (movement.direction === "out" ? -movement.quantity : movement.quantity), 0);
}

export function selectAvailableStock(state: ErpState, productId: string): number {
  const physical = selectPhysicalStock(state, productId);
  const reserved = state.salesOrders.filter((order) => !["cancelled", "completed"].includes(order.status)).flatMap((order) => order.lines).filter((line) => line.productId === productId).reduce((sum, line) => sum + line.reservedQuantity - line.deliveredQuantity, 0);
  return physical - reserved;
}

export function selectIncomingStock(state: ErpState, productId: string): number {
  const openOrders = state.purchaseOrders.filter((order) => ["sent", "confirmed", "partially_received"].includes(order.status));
  const openOrderIds = new Set(openOrders.map((order) => order.id));
  return openOrders.flatMap((order) => order.lines).filter((line) => line.productId === productId).reduce((sum, line) => sum + line.quantity, 0)
    - state.goodsReceipts.filter((receipt) => receipt.status === "posted" && openOrderIds.has(receipt.purchaseOrderId)).flatMap((receipt) => receipt.lines).filter((line) => line.productId === productId).reduce((sum, line) => sum + line.quantity, 0);
}

export function selectSupplierFollowUpQueue(state: ErpState, now: string): SupplierFollowUpQueueItem[] {
  const nowTime = new Date(now).getTime();
  if (Number.isNaN(nowTime)) return [];
  const dueOpenFollowUps = new Map<string, ErpFollowUp[]>();
  for (const followUp of state.followUps) {
    if (followUp.status !== "open" || !followUp.purchaseOrderId || new Date(followUp.dueAt).getTime() > nowTime) continue;
    dueOpenFollowUps.set(followUp.purchaseOrderId, [...(dueOpenFollowUps.get(followUp.purchaseOrderId) ?? []), followUp]);
  }

  return state.purchaseOrders.flatMap((purchaseOrder) => {
    const supplier = state.suppliers.find((item) => item.id === purchaseOrder.supplierId);
    if (!supplier || ["completed", "rejected", "cancelled", "fully_received"].includes(purchaseOrder.status)) return [];
    const reasons: SupplierFollowUpReason[] = [];
    const dueDates: string[] = [];
    const confirmationDue = purchaseOrder.confirmationDueAt ? new Date(purchaseOrder.confirmationDueAt).getTime() : Number.NaN;
    if (purchaseOrder.status === "sent" && Number.isFinite(confirmationDue) && confirmationDue < nowTime) {
      reasons.push("confirmation_overdue");
      dueDates.push(purchaseOrder.confirmationDueAt!);
    }
    const deliveryDue = purchaseOrder.promisedDeliveryDate ? new Date(purchaseOrder.promisedDeliveryDate).getTime() : Number.NaN;
    if (["confirmed", "partially_received"].includes(purchaseOrder.status) && Number.isFinite(deliveryDue) && deliveryDue < nowTime) {
      reasons.push("delivery_overdue");
      dueDates.push(purchaseOrder.promisedDeliveryDate!);
    }
    if (purchaseOrder.status === "partially_received" && purchaseOrder.lines.some((line) => receivedQuantity(state, purchaseOrder.id, line.productId) < line.quantity)) {
      reasons.push("partial_receipt_outstanding");
    }
    const approvedDue = dueOpenFollowUps.get(purchaseOrder.id) ?? [];
    if (approvedDue.length > 0) {
      reasons.push("approved_follow_up_due");
      dueDates.push(...approvedDue.map((followUp) => followUp.dueAt));
    }
    if (reasons.length === 0) return [];
    return [{ purchaseOrder, supplier, reasons, dueAt: dueDates.sort()[0] ?? null }];
  }).sort((left, right) => left.purchaseOrder.orderNumber.localeCompare(right.purchaseOrder.orderNumber));
}

function receivedQuantity(state: ErpState, purchaseOrderId: string, productId: string): number {
  return state.goodsReceipts
    .filter((receipt) => receipt.purchaseOrderId === purchaseOrderId && receipt.status === "posted")
    .flatMap((receipt) => receipt.lines)
    .filter((line) => line.productId === productId)
    .reduce((sum, line) => sum + line.quantity, 0);
}
