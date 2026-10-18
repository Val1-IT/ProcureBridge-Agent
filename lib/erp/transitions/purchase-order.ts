import type { PurchaseOrderStatus } from "../types";

export const purchaseOrderTransitions: Readonly<Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]>> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["sent", "rejected", "cancelled"],
  sent: ["confirmed", "cancelled"],
  confirmed: ["partially_received", "fully_received", "cancelled"],
  partially_received: ["fully_received"],
  fully_received: ["completed"],
  completed: [],
  rejected: [],
  cancelled: [],
};

export function canTransitionPurchaseOrder(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  return purchaseOrderTransitions[from].includes(to);
}
