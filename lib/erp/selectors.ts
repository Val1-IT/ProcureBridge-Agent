import type { ErpState } from "./types";

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
