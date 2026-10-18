import type { ErpState } from "../erp/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function exactPostedTotals(
  documents: unknown[],
  parentField: "purchaseOrderId" | "salesOrderId",
  parentId: unknown,
  postedStatus: "approved" | "posted",
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const document of documents) {
    if (!isRecord(document) || document[parentField] !== parentId || document.status !== postedStatus || !Array.isArray(document.lines)) continue;
    for (const line of document.lines) {
      if (!isRecord(line) || typeof line.productId !== "string" || typeof line.quantity !== "number") continue;
      totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
    }
  }
  return totals;
}

function executionStatus(
  order: Record<string, unknown>,
  totals: Map<string, number>,
  partialStatus: "partially_received" | "partially_delivered",
  fullStatus: "fully_received" | "fully_delivered",
): string | null {
  if (!Array.isArray(order.lines) || ![...totals.values()].some((quantity) => quantity > 0)) return null;
  const fullyExecuted = order.lines.length > 0 && order.lines.every((line) => isRecord(line)
    && typeof line.productId === "string"
    && typeof line.quantity === "number"
    && totals.get(line.productId) === line.quantity);
  return fullyExecuted ? fullStatus : partialStatus;
}

export function normalizeLegacyExecutedParentStatuses(value: unknown): ErpState | null {
  if (!isRecord(value) || !Array.isArray(value.purchaseOrders) || !Array.isArray(value.goodsReceipts)
    || !Array.isArray(value.salesOrders) || !Array.isArray(value.deliveryOrders)) return null;

  const purchaseOrders = value.purchaseOrders.map((candidate) => {
    if (!isRecord(candidate) || candidate.status !== "cancelled") return candidate;
    const status = executionStatus(candidate, exactPostedTotals(value.goodsReceipts as unknown[], "purchaseOrderId", candidate.id, "approved"), "partially_received", "fully_received");
    return status ? { ...candidate, status } : candidate;
  });
  const salesOrders = value.salesOrders.map((candidate) => {
    if (!isRecord(candidate) || candidate.status !== "cancelled") return candidate;
    const status = executionStatus(candidate, exactPostedTotals(value.deliveryOrders as unknown[], "salesOrderId", candidate.id, "posted"), "partially_delivered", "fully_delivered");
    return status ? { ...candidate, status } : candidate;
  });

  return { ...value, purchaseOrders, salesOrders } as unknown as ErpState;
}
