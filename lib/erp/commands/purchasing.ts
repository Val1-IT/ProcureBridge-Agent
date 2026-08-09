import { nextDocumentNumber } from "../document-numbers";
import type { ErpCommandResult } from "../errors";
import { authorize } from "../permissions";
import { canTransitionPurchaseOrder } from "../transitions/purchase-order";
import type { ErpRole, ErpState, PurchaseOrder, PurchaseOrderStatus, PurchaseRequest, QuantityLine } from "../types";
import { appendErpAudit, commitErpState, isErpRole, rejectErpCommand } from "./shared";

export interface PurchaseRequestInput {
  lines: readonly QuantityLine[];
}

export interface PurchaseOrderInput {
  supplierId: string;
  purchaseRequestId?: string | null;
  warehouseId?: string;
  lines: readonly QuantityLine[];
  confirmationDueAt?: string | null;
  promisedDeliveryDate?: string | null;
}

function invalid<T>(state: ErpState, message: string, details?: Record<string, string | number>): ErpCommandResult<T> {
  return rejectErpCommand(state, { code: "INVALID_INPUT", message, ...(details ? { details } : {}) });
}

function requirePurchasePermission<T>(state: ErpState, role: ErpRole, permission: "purchase.write" | "purchase.approve"): ErpCommandResult<T> | null {
  if (!isErpRole(role)) return invalid(state, "Active role is invalid.");
  if (!authorize(role, permission)) return rejectErpCommand(state, { code: "FORBIDDEN", message: "You do not have permission to manage purchase documents." });
  return null;
}

function hasValidDate(value: string | null | undefined): boolean {
  return value == null || !Number.isNaN(new Date(value).getTime());
}

function validateLines<T>(state: ErpState, lines: readonly QuantityLine[]): ErpCommandResult<T> | null {
  if (lines.length === 0) return invalid(state, "Purchase documents require at least one line.");
  const productIds = new Set<string>();
  for (const line of lines) {
    if (!state.products.some((product) => product.id === line.productId && product.active)) return invalid(state, "Purchase line product was not found or is inactive.", { productId: line.productId });
    if (productIds.has(line.productId)) return invalid(state, "Purchase document lines must use each product once.", { productId: line.productId });
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) return invalid(state, "Purchase line quantity must be positive.", { productId: line.productId });
    if (!Number.isFinite(line.unitPrice) || line.unitPrice <= 0) return invalid(state, "Purchase line unit price must be positive.", { productId: line.productId });
    productIds.add(line.productId);
  }
  return null;
}

function lineCopies(lines: readonly QuantityLine[]): QuantityLine[] {
  return lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice }));
}

function documentId(prefix: string, number: string): string {
  return `${prefix}-${number.toLowerCase()}`;
}

function findPurchaseOrder<T>(state: ErpState, purchaseOrderId: string): PurchaseOrder | ErpCommandResult<T> {
  return state.purchaseOrders.find((order) => order.id === purchaseOrderId)
    ?? rejectErpCommand(state, { code: "NOT_FOUND", message: "Purchase order was not found." });
}

function transition<T>(
  state: ErpState,
  role: ErpRole,
  purchaseOrderId: string,
  targetStatus: PurchaseOrderStatus,
  action: string,
  now: string,
  permission: "purchase.write" | "purchase.approve",
): ErpCommandResult<PurchaseOrder> {
  const authorization = requirePurchasePermission<PurchaseOrder>(state, role, permission);
  if (authorization) return authorization;
  const found = findPurchaseOrder<PurchaseOrder>(state, purchaseOrderId);
  if ("ok" in found) return found;
  if (!canTransitionPurchaseOrder(found.status, targetStatus)) {
    return rejectErpCommand(state, { code: "INVALID_STATE", message: `Purchase order cannot move from ${found.status} to ${targetStatus}.` });
  }
  const purchaseOrder = { ...found, status: targetStatus, updatedAt: now };
  const next = appendErpAudit({ ...state, purchaseOrders: state.purchaseOrders.map((order) => order.id === purchaseOrder.id ? purchaseOrder : order) }, {
    entityType: "purchase_order", entityId: purchaseOrder.id, action, actorRole: role, actorId: `role:${role}`,
    detail: { orderNumber: purchaseOrder.orderNumber, previousStatus: found.status, nextStatus: targetStatus },
  }, now);
  return commitErpState(state, next, purchaseOrder);
}

export function createPurchaseRequest(state: ErpState, role: ErpRole, input: PurchaseRequestInput, now: string): ErpCommandResult<PurchaseRequest> {
  const authorization = requirePurchasePermission<PurchaseRequest>(state, role, "purchase.write");
  if (authorization) return authorization;
  const lineError = validateLines<PurchaseRequest>(state, input.lines);
  if (lineError) return lineError;
  const requestNumber = nextDocumentNumber("PR", now, state.purchaseRequests.map((request) => request.requestNumber));
  const request: PurchaseRequest = {
    id: documentId("purchase-request", requestNumber), requestNumber, requesterRole: role, status: "draft", lines: lineCopies(input.lines), createdAt: now, updatedAt: now,
  };
  const next = appendErpAudit({ ...state, purchaseRequests: [...state.purchaseRequests, request] }, {
    entityType: "purchase_request", entityId: request.id, action: "purchase_request.created", actorRole: role, actorId: `role:${role}`,
    detail: { requestNumber: request.requestNumber, lineCount: request.lines.length },
  }, now);
  return commitErpState(state, next, request);
}

export function createPurchaseOrder(state: ErpState, role: ErpRole, input: PurchaseOrderInput, now: string): ErpCommandResult<PurchaseOrder> {
  const authorization = requirePurchasePermission<PurchaseOrder>(state, role, "purchase.write");
  if (authorization) return authorization;
  const supplier = state.suppliers.find((item) => item.id === input.supplierId && item.active);
  if (!supplier) return invalid(state, "Purchase order supplier was not found or is inactive.", { supplierId: input.supplierId });
  const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.active);
  if (activeWarehouses.length !== 1) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Exactly one active warehouse is required." });
  const warehouse = activeWarehouses[0];
  if (input.warehouseId && input.warehouseId !== warehouse.id) return invalid(state, "Purchase order warehouse must be the active warehouse.", { warehouseId: input.warehouseId });
  if (input.purchaseRequestId && !state.purchaseRequests.some((request) => request.id === input.purchaseRequestId)) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Purchase request was not found." });
  if (!hasValidDate(input.confirmationDueAt) || !hasValidDate(input.promisedDeliveryDate)) return invalid(state, "Purchase order dates are invalid.");
  const lineError = validateLines<PurchaseOrder>(state, input.lines);
  if (lineError) return lineError;
  const orderNumber = nextDocumentNumber("PO", now, state.purchaseOrders.map((order) => order.orderNumber));
  const purchaseOrder: PurchaseOrder = {
    id: documentId("purchase-order", orderNumber), orderNumber, supplierId: supplier.id, purchaseRequestId: input.purchaseRequestId ?? null, warehouseId: warehouse.id,
    status: "draft", lines: lineCopies(input.lines), confirmationDueAt: input.confirmationDueAt ?? null, promisedDeliveryDate: input.promisedDeliveryDate ?? null,
    createdAt: now, updatedAt: now,
  };
  const next = appendErpAudit({ ...state, purchaseOrders: [...state.purchaseOrders, purchaseOrder] }, {
    entityType: "purchase_order", entityId: purchaseOrder.id, action: "purchase_order.created", actorRole: role, actorId: `role:${role}`,
    detail: { orderNumber: purchaseOrder.orderNumber, supplierId: purchaseOrder.supplierId, lineCount: purchaseOrder.lines.length },
  }, now);
  return commitErpState(state, next, purchaseOrder);
}

export function submitPurchaseOrder(state: ErpState, role: ErpRole, purchaseOrderId: string, now: string): ErpCommandResult<PurchaseOrder> {
  return transition(state, role, purchaseOrderId, "pending_approval", "purchase_order.submitted", now, "purchase.write");
}

export function approvePurchaseOrder(state: ErpState, role: ErpRole, purchaseOrderId: string, now: string): ErpCommandResult<PurchaseOrder> {
  return transition(state, role, purchaseOrderId, "sent", "purchase_order.approved", now, "purchase.approve");
}

export function sendPurchaseOrder(state: ErpState, role: ErpRole, purchaseOrderId: string, now: string): ErpCommandResult<PurchaseOrder> {
  const authorization = requirePurchasePermission<PurchaseOrder>(state, role, "purchase.write");
  if (authorization) return authorization;
  const found = findPurchaseOrder<PurchaseOrder>(state, purchaseOrderId);
  if ("ok" in found) return found;
  if (found.status !== "sent") return rejectErpCommand(state, { code: "INVALID_STATE", message: "Only an approved purchase order can be sent." });
  const purchaseOrder = { ...found, updatedAt: now };
  const next = appendErpAudit({ ...state, purchaseOrders: state.purchaseOrders.map((order) => order.id === purchaseOrder.id ? purchaseOrder : order) }, {
    entityType: "purchase_order", entityId: purchaseOrder.id, action: "purchase_order.sent", actorRole: role, actorId: `role:${role}`,
    detail: { orderNumber: purchaseOrder.orderNumber, status: purchaseOrder.status },
  }, now);
  return commitErpState(state, next, purchaseOrder);
}

export function confirmPurchaseOrder(state: ErpState, role: ErpRole, purchaseOrderId: string, now: string): ErpCommandResult<PurchaseOrder> {
  return transition(state, role, purchaseOrderId, "confirmed", "purchase_order.confirmed", now, "purchase.write");
}

export function cancelPurchaseOrder(state: ErpState, role: ErpRole, purchaseOrderId: string, now: string): ErpCommandResult<PurchaseOrder> {
  return transition(state, role, purchaseOrderId, "cancelled", "purchase_order.cancelled", now, "purchase.write");
}
