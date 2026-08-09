import type { SalesOrderStatus } from "../types";

export const salesOrderTransitions: Readonly<Record<SalesOrderStatus, readonly SalesOrderStatus[]>> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["partially_delivered", "fully_delivered", "cancelled"],
  partially_delivered: ["fully_delivered", "cancelled"],
  fully_delivered: ["invoiced"],
  invoiced: ["completed"],
  completed: [],
  cancelled: [],
};

export function canTransitionSalesOrder(from: SalesOrderStatus, to: SalesOrderStatus): boolean {
  return salesOrderTransitions[from].includes(to);
}
