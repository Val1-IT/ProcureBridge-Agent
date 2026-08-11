import { authorize } from "./permissions";
import { canTransitionPurchaseOrder } from "./transitions/purchase-order";
import { canTransitionSalesOrder } from "./transitions/sales-order";
import type { ErpRole, ErpState } from "./types";

export function purchaseOrderHasReceiptExecution(state: ErpState, purchaseOrderId: string): boolean {
  return state.goodsReceipts.some((receipt) => receipt.purchaseOrderId === purchaseOrderId && ["approved", "posted"].includes(receipt.status));
}

export function salesOrderHasDeliveryExecution(state: ErpState, salesOrderId: string): boolean {
  return state.deliveryOrders.some((delivery) => delivery.salesOrderId === salesOrderId && delivery.status === "posted");
}

export function canCancelPurchaseOrder(state: ErpState, role: ErpRole, purchaseOrderId: string): boolean {
  const purchaseOrder = state.purchaseOrders.find((order) => order.id === purchaseOrderId);
  return Boolean(
    purchaseOrder
    && authorize(role, "purchase.write")
    && canTransitionPurchaseOrder(purchaseOrder.status, "cancelled")
    && !purchaseOrderHasReceiptExecution(state, purchaseOrder.id),
  );
}

export function canCancelSalesOrder(state: ErpState, role: ErpRole, salesOrderId: string): boolean {
  const salesOrder = state.salesOrders.find((order) => order.id === salesOrderId);
  return Boolean(
    salesOrder
    && authorize(role, "sales.write")
    && canTransitionSalesOrder(salesOrder.status, "cancelled")
    && !salesOrderHasDeliveryExecution(state, salesOrder.id),
  );
}
