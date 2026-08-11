import { nextDocumentNumber } from "../document-numbers";
import type { ErpCommandResult } from "../errors";
import { authorize, type ErpPermission } from "../permissions";
import { selectPhysicalStock } from "../selectors";
import { isPositiveWholeQuantity } from "../quantity";
import type { ErpRole, ErpState, GoodsReceipt, PurchaseOrder, QuantityLine, StockAdjustment, StockMovement } from "../types";
import { appendErpAudit, commitErpState, isErpRole, rejectErpCommand } from "./shared";

export interface GoodsReceiptInput {
  purchaseOrderId: string;
  lines: ReadonlyArray<{ productId: string; quantity: number }>;
}

export interface StockAdjustmentInput {
  productId: string;
  /** Signed delta: positive adds physical stock; negative removes it. */
  quantityDelta: number;
  reason: string;
}

function invalid<T>(state: ErpState, message: string, details?: Record<string, string | number>): ErpCommandResult<T> {
  return rejectErpCommand(state, { code: "INVALID_INPUT", message, ...(details ? { details } : {}) });
}

function requirePermission<T>(state: ErpState, role: ErpRole, permission: ErpPermission, message: string): ErpCommandResult<T> | null {
  if (!isErpRole(role)) return invalid(state, "Active role is invalid.");
  if (!authorize(role, permission)) return rejectErpCommand(state, { code: "FORBIDDEN", message });
  return null;
}

function hasValidNow(now: string): boolean {
  return !Number.isNaN(new Date(now).getTime());
}

function activeWarehouse<T>(state: ErpState): { id: string } | ErpCommandResult<T> {
  const active = state.warehouses.filter((warehouse) => warehouse.active);
  return active.length === 1
    ? active[0]
    : rejectErpCommand(state, { code: "INVALID_STATE", message: "Exactly one active warehouse is required." });
}

function eligiblePurchaseOrder<T>(state: ErpState, purchaseOrderId: string): PurchaseOrder | ErpCommandResult<T> {
  const purchaseOrder = state.purchaseOrders.find((order) => order.id === purchaseOrderId);
  if (!purchaseOrder) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Purchase order was not found." });
  if (purchaseOrder.status !== "confirmed" && purchaseOrder.status !== "partially_received") {
    return rejectErpCommand(state, { code: "INVALID_STATE", message: "Goods receipts require a confirmed or partially received purchase order." });
  }
  return purchaseOrder;
}

function isApprovedReceipt(receipt: GoodsReceipt): boolean {
  return receipt.status === "approved" || receipt.status === "posted";
}

function approvedQuantity(state: ErpState, purchaseOrderId: string, productId: string): number {
  return state.goodsReceipts
    .filter((receipt) => receipt.purchaseOrderId === purchaseOrderId && isApprovedReceipt(receipt))
    .flatMap((receipt) => receipt.lines)
    .filter((line) => line.productId === productId)
    .reduce((sum, line) => sum + line.quantity, 0);
}

function validateReceiptLines<T>(state: ErpState, purchaseOrder: PurchaseOrder, lines: ReadonlyArray<{ productId: string; quantity: number }>): ErpCommandResult<T> | null {
  if (lines.length === 0) return invalid(state, "Goods receipts require at least one line.");
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.productId)) return invalid(state, "Goods receipt products must be unique.", { productId: line.productId });
    const product = state.products.find((item) => item.id === line.productId && item.active);
    const orderLine = purchaseOrder.lines.find((item) => item.productId === line.productId);
    if (!product || !orderLine) return invalid(state, "Goods receipt product does not belong to the purchase order.", { productId: line.productId });
    if (!isPositiveWholeQuantity(line.quantity)) return invalid(state, "Goods receipt quantity must be a positive whole number.", { productId: line.productId });
    const outstanding = orderLine.quantity - approvedQuantity(state, purchaseOrder.id, line.productId);
    if (line.quantity > outstanding) return invalid(state, "Goods receipt quantity exceeds the outstanding purchase order quantity.", { productId: line.productId, outstandingQuantity: outstanding });
    seen.add(line.productId);
  }
  return null;
}

function receiptLineCopies(purchaseOrder: PurchaseOrder, lines: ReadonlyArray<{ productId: string; quantity: number }>): QuantityLine[] {
  return lines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitPrice: purchaseOrder.lines.find((orderLine) => orderLine.productId === line.productId)!.unitPrice,
  }));
}

export function createGoodsReceipt(state: ErpState, role: ErpRole, input: GoodsReceiptInput, now: string): ErpCommandResult<GoodsReceipt> {
  const authorization = requirePermission<GoodsReceipt>(state, role, "stock.receive", "You do not have permission to receive inventory.");
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const warehouse = activeWarehouse<GoodsReceipt>(state);
  if ("ok" in warehouse) return warehouse;
  const purchaseOrder = eligiblePurchaseOrder<GoodsReceipt>(state, input.purchaseOrderId);
  if ("ok" in purchaseOrder) return purchaseOrder;
  if (purchaseOrder.warehouseId !== warehouse.id) return invalid(state, "Purchase order warehouse must match the active warehouse.");
  const lineError = validateReceiptLines<GoodsReceipt>(state, purchaseOrder, input.lines);
  if (lineError) return lineError;
  const receiptNumber = nextDocumentNumber("GR", now, state.goodsReceipts.map((receipt) => receipt.receiptNumber));
  const receipt: GoodsReceipt = {
    id: `goods-receipt-${receiptNumber.toLowerCase()}`,
    receiptNumber,
    purchaseOrderId: purchaseOrder.id,
    warehouseId: warehouse.id,
    status: "draft",
    lines: receiptLineCopies(purchaseOrder, input.lines),
    createdAt: now,
    updatedAt: now,
  };
  const next = appendErpAudit({ ...state, goodsReceipts: [...state.goodsReceipts, receipt] }, {
    entityType: "goods_receipt", entityId: receipt.id, action: "goods_receipt.created", actorRole: role, actorId: `role:${role}`,
    detail: { receiptNumber, purchaseOrderId: purchaseOrder.id, lineCount: receipt.lines.length },
  }, now);
  return commitErpState(state, next, receipt);
}

export function approveGoodsReceipt(state: ErpState, role: ErpRole, goodsReceiptId: string, now: string): ErpCommandResult<GoodsReceipt> {
  const authorization = requirePermission<GoodsReceipt>(state, role, "stock.receive", "You do not have permission to approve goods receipts.");
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const warehouse = activeWarehouse<GoodsReceipt>(state);
  if ("ok" in warehouse) return warehouse;
  const receipt = state.goodsReceipts.find((item) => item.id === goodsReceiptId);
  if (!receipt) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Goods receipt was not found." });
  if (receipt.status !== "draft") return rejectErpCommand(state, { code: "INVALID_STATE", message: "Only a draft goods receipt can be approved." });
  const purchaseOrder = eligiblePurchaseOrder<GoodsReceipt>(state, receipt.purchaseOrderId);
  if ("ok" in purchaseOrder) return purchaseOrder;
  if (receipt.warehouseId !== warehouse.id || purchaseOrder.warehouseId !== warehouse.id) return invalid(state, "Goods receipt and purchase order must use the active warehouse.");
  const lineError = validateReceiptLines<GoodsReceipt>(state, purchaseOrder, receipt.lines);
  if (lineError) return lineError;

  const approvedReceipt: GoodsReceipt = { ...receipt, status: "approved", updatedAt: now };
  const movements: StockMovement[] = receipt.lines.map((line) => ({
    id: `stock-movement-${receipt.id}-${line.productId}`,
    type: "receipt",
    productId: line.productId,
    warehouseId: receipt.warehouseId,
    quantity: line.quantity,
    direction: "in",
    sourceType: "goods_receipt",
    sourceId: receipt.id,
    actorRole: role,
    actorId: `role:${role}`,
    reason: `Approved ${receipt.receiptNumber}`,
    createdAt: now,
    updatedAt: now,
  }));
  const allReceived = purchaseOrder.lines.every((line) => approvedQuantity(state, purchaseOrder.id, line.productId) + (receipt.lines.find((item) => item.productId === line.productId)?.quantity ?? 0) === line.quantity);
  const updatedPurchaseOrder: PurchaseOrder = { ...purchaseOrder, status: allReceived ? "fully_received" : "partially_received", updatedAt: now };
  const staged: ErpState = {
    ...state,
    goodsReceipts: state.goodsReceipts.map((item) => item.id === receipt.id ? approvedReceipt : item),
    purchaseOrders: state.purchaseOrders.map((item) => item.id === purchaseOrder.id ? updatedPurchaseOrder : item),
    stockMovements: [...state.stockMovements, ...movements],
  };
  const next = appendErpAudit(staged, {
    entityType: "goods_receipt", entityId: receipt.id, action: "goods_receipt.approved", actorRole: role, actorId: `role:${role}`,
    detail: { receiptNumber: receipt.receiptNumber, purchaseOrderId: purchaseOrder.id, purchaseOrderStatus: updatedPurchaseOrder.status, movementCount: movements.length },
  }, now);
  return commitErpState(state, next, approvedReceipt);
}

export function proposeStockAdjustment(state: ErpState, role: ErpRole, input: StockAdjustmentInput, now: string): ErpCommandResult<StockAdjustment> {
  const authorization = requirePermission<StockAdjustment>(state, role, "stock.adjust", "You do not have permission to propose stock adjustments.");
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const warehouse = activeWarehouse<StockAdjustment>(state);
  if ("ok" in warehouse) return warehouse;
  if (!state.products.some((product) => product.id === input.productId && product.active)) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Adjustment product was not found or is inactive." });
  if (!Number.isFinite(input.quantityDelta) || !Number.isInteger(input.quantityDelta) || input.quantityDelta === 0) return invalid(state, "Adjustment quantity delta must be a non-zero signed whole number.");
  const reason = input.reason.trim();
  if (!reason) return invalid(state, "Adjustment reason is required.");
  const adjustmentNumber = nextDocumentNumber("SA", now, state.stockAdjustments.map((item) => item.adjustmentNumber));
  const adjustment: StockAdjustment = {
    id: `stock-adjustment-${adjustmentNumber.toLowerCase()}`,
    adjustmentNumber,
    productId: input.productId,
    warehouseId: warehouse.id,
    quantityDelta: input.quantityDelta,
    reason,
    status: "pending",
    proposedByRole: role,
    approvedByRole: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const next = appendErpAudit({ ...state, stockAdjustments: [...state.stockAdjustments, adjustment] }, {
    entityType: "stock_adjustment", entityId: adjustment.id, action: "stock_adjustment.proposed", actorRole: role, actorId: `role:${role}`,
    detail: { adjustmentNumber, productId: adjustment.productId, quantityDelta: adjustment.quantityDelta, reason },
  }, now);
  return commitErpState(state, next, adjustment);
}

export function approveStockAdjustment(state: ErpState, role: ErpRole, stockAdjustmentId: string, now: string): ErpCommandResult<StockAdjustment> {
  const authorization = requirePermission<StockAdjustment>(state, role, "stock.adjust.approve", "You do not have permission to approve stock adjustments.");
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const warehouse = activeWarehouse<StockAdjustment>(state);
  if ("ok" in warehouse) return warehouse;
  const adjustment = state.stockAdjustments.find((item) => item.id === stockAdjustmentId);
  if (!adjustment) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Stock adjustment was not found." });
  if (adjustment.status !== "pending") return rejectErpCommand(state, { code: "INVALID_STATE", message: "Only a pending stock adjustment can be approved." });
  if (adjustment.proposedByRole === role) return rejectErpCommand(state, { code: "FORBIDDEN", message: "The proposing role cannot approve its own stock adjustment." });
  if (adjustment.warehouseId !== warehouse.id || !state.products.some((product) => product.id === adjustment.productId && product.active)) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Stock adjustment references are no longer valid." });
  const resultingStock = selectPhysicalStock(state, adjustment.productId) + adjustment.quantityDelta;
  if (resultingStock < 0) return rejectErpCommand(state, { code: "INSUFFICIENT_STOCK", message: "Stock adjustment would make physical stock negative.", details: { availableQuantity: selectPhysicalStock(state, adjustment.productId), quantityDelta: adjustment.quantityDelta } });
  const approved: StockAdjustment = { ...adjustment, status: "approved", approvedByRole: role, approvedAt: now, updatedAt: now };
  const movement: StockMovement = {
    id: `stock-movement-${adjustment.id}`,
    type: "adjustment",
    productId: adjustment.productId,
    warehouseId: adjustment.warehouseId,
    quantity: adjustment.quantityDelta,
    direction: "adjustment",
    sourceType: "adjustment",
    sourceId: adjustment.id,
    actorRole: role,
    actorId: `role:${role}`,
    reason: adjustment.reason,
    createdAt: now,
    updatedAt: now,
  };
  const staged = { ...state, stockAdjustments: state.stockAdjustments.map((item) => item.id === approved.id ? approved : item), stockMovements: [...state.stockMovements, movement] };
  const next = appendErpAudit(staged, {
    entityType: "stock_adjustment", entityId: approved.id, action: "stock_adjustment.approved", actorRole: role, actorId: `role:${role}`,
    detail: { adjustmentNumber: approved.adjustmentNumber, productId: approved.productId, quantityDelta: approved.quantityDelta, reason: approved.reason, approvedByRole: role, resultingStock },
  }, now);
  return commitErpState(state, next, approved);
}
