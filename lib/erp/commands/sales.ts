import { nextDocumentNumber } from "../document-numbers";
import type { ErpCommandResult } from "../errors";
import { authorize } from "../permissions";
import { salesOrderHasDeliveryExecution } from "../order-cancellation";
import { selectPhysicalStock, selectSalesShortage } from "../selectors";
import { canTransitionSalesOrder } from "../transitions/sales-order";
import type { DeliveryOrder, ErpRole, ErpState, PurchaseRequest, QuantityLine, SalesOrder, SalesOrderLine, StockMovement } from "../types";
import { appendErpAudit, commitErpState, isErpRole, rejectErpCommand } from "./shared";

export interface SalesOrderInput {
  customerId: string;
  warehouseId?: string;
  lines: readonly QuantityLine[];
}

export interface DeliveryOrderInput {
  salesOrderId: string;
  lines: ReadonlyArray<{ productId: string; quantity: number }>;
}

function invalid<T>(state: ErpState, message: string, details?: Record<string, string | number>): ErpCommandResult<T> {
  return rejectErpCommand(state, { code: "INVALID_INPUT", message, ...(details ? { details } : {}) });
}

function requireSalesWrite<T>(state: ErpState, role: ErpRole): ErpCommandResult<T> | null {
  if (!isErpRole(role)) return invalid(state, "Active role is invalid.");
  return authorize(role, "sales.write") ? null : rejectErpCommand(state, { code: "FORBIDDEN", message: "You do not have permission to manage sales orders." });
}

function requireDeliveryDraft<T>(state: ErpState, role: ErpRole): ErpCommandResult<T> | null {
  if (!isErpRole(role)) return invalid(state, "Active role is invalid.");
  return authorize(role, "sales.write") || authorize(role, "stock.deliver")
    ? null
    : rejectErpCommand(state, { code: "FORBIDDEN", message: "You do not have permission to prepare deliveries." });
}

function requireDeliveryCompletion<T>(state: ErpState, role: ErpRole): ErpCommandResult<T> | null {
  if (!isErpRole(role)) return invalid(state, "Active role is invalid.");
  return authorize(role, "stock.deliver")
    ? null
    : rejectErpCommand(state, { code: "FORBIDDEN", message: "Warehouse or Admin role is required to complete delivery." });
}

function activeWarehouse<T>(state: ErpState, warehouseId?: string): { id: string } | ErpCommandResult<T> {
  const active = state.warehouses.filter((warehouse) => warehouse.active);
  if (active.length !== 1) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Exactly one active warehouse is required." });
  if (warehouseId && warehouseId !== active[0].id) return invalid(state, "Sales document warehouse must be the active warehouse.", { warehouseId });
  return active[0];
}

function hasValidNow(now: string): boolean {
  return !Number.isNaN(new Date(now).getTime());
}

function documentId(prefix: string, number: string): string {
  return `${prefix}-${number.toLowerCase()}`;
}

function findSalesOrder<T>(state: ErpState, salesOrderId: string): SalesOrder | ErpCommandResult<T> {
  return state.salesOrders.find((order) => order.id === salesOrderId)
    ?? rejectErpCommand(state, { code: "NOT_FOUND", message: "Sales order was not found." });
}

function validateSalesLines<T>(state: ErpState, lines: readonly QuantityLine[]): ErpCommandResult<T> | null {
  if (lines.length === 0) return invalid(state, "Sales orders require at least one line.");
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.productId)) return invalid(state, "Sales order products must be unique.", { productId: line.productId });
    if (!state.products.some((product) => product.id === line.productId && product.active)) return invalid(state, "Sales order product was not found or is inactive.", { productId: line.productId });
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) return invalid(state, "Sales order quantity must be a positive whole number.", { productId: line.productId });
    if (!Number.isFinite(line.unitPrice) || line.unitPrice <= 0) return invalid(state, "Sales order unit price must be positive.", { productId: line.productId });
    seen.add(line.productId);
  }
  return null;
}

function shortageError<T>(state: ErpState, productId: string, availableQuantity: number, requestedQuantity: number): ErpCommandResult<T> {
  return rejectErpCommand(state, {
    code: "INSUFFICIENT_STOCK",
    message: "Available stock is insufficient to confirm this Sales Order.",
    details: { productId, availableQuantity, requestedQuantity, shortage: requestedQuantity - availableQuantity },
  });
}

export function createSalesOrder(state: ErpState, role: ErpRole, input: SalesOrderInput, now: string): ErpCommandResult<SalesOrder> {
  const authorization = requireSalesWrite<SalesOrder>(state, role);
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const customer = state.customers.find((item) => item.id === input.customerId && item.active);
  if (!customer) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Sales order customer was not found or is inactive." });
  const warehouse = activeWarehouse<SalesOrder>(state, input.warehouseId);
  if ("ok" in warehouse) return warehouse;
  const lineError = validateSalesLines<SalesOrder>(state, input.lines);
  if (lineError) return lineError;
  const orderNumber = nextDocumentNumber("SO", now, state.salesOrders.map((order) => order.orderNumber));
  const order: SalesOrder = {
    id: documentId("sales-order", orderNumber), orderNumber, customerId: customer.id, warehouseId: warehouse.id, status: "draft",
    lines: input.lines.map((line): SalesOrderLine => ({ ...line, deliveredQuantity: 0 })), createdAt: now, updatedAt: now,
  };
  const next = appendErpAudit({ ...state, salesOrders: [...state.salesOrders, order] }, {
    entityType: "sales_order", entityId: order.id, action: "sales_order.created", actorRole: role, actorId: `role:${role}`,
    detail: { orderNumber, customerId: order.customerId, lineCount: order.lines.length },
  }, now);
  return commitErpState(state, next, order);
}

export function confirmSalesOrder(state: ErpState, role: ErpRole, salesOrderId: string, now: string): ErpCommandResult<SalesOrder> {
  const authorization = requireSalesWrite<SalesOrder>(state, role);
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const found = findSalesOrder<SalesOrder>(state, salesOrderId);
  if ("ok" in found) return found;
  if (!canTransitionSalesOrder(found.status, "confirmed")) return rejectErpCommand(state, { code: "INVALID_STATE", message: `Sales order cannot move from ${found.status} to confirmed.` });
  const shortages = selectSalesShortage(state, found.id);
  if (shortages.length > 0) {
    const shortage = shortages[0];
    return shortageError(state, shortage.productId, shortage.availableQuantity, shortage.requestedQuantity);
  }
  const confirmed: SalesOrder = { ...found, status: "confirmed", updatedAt: now };
  const next = appendErpAudit({ ...state, salesOrders: state.salesOrders.map((order) => order.id === confirmed.id ? confirmed : order) }, {
    entityType: "sales_order", entityId: confirmed.id, action: "sales_order.confirmed", actorRole: role, actorId: `role:${role}`,
    detail: { orderNumber: confirmed.orderNumber, previousStatus: found.status, nextStatus: confirmed.status },
  }, now);
  return commitErpState(state, next, confirmed);
}

export function cancelSalesOrder(state: ErpState, role: ErpRole, salesOrderId: string, now: string): ErpCommandResult<SalesOrder> {
  const authorization = requireSalesWrite<SalesOrder>(state, role);
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const found = findSalesOrder<SalesOrder>(state, salesOrderId);
  if ("ok" in found) return found;
  if (salesOrderHasDeliveryExecution(state, found.id)) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Sales Orders with posted deliveries cannot be cancelled." });
  if (!canTransitionSalesOrder(found.status, "cancelled")) return rejectErpCommand(state, { code: "INVALID_STATE", message: `Sales order cannot move from ${found.status} to cancelled.` });
  const cancelled: SalesOrder = { ...found, status: "cancelled", updatedAt: now };
  const staged = {
    ...state,
    salesOrders: state.salesOrders.map((order) => order.id === cancelled.id ? cancelled : order),
    deliveryOrders: state.deliveryOrders.map((delivery) => delivery.salesOrderId === cancelled.id && delivery.status === "draft" ? { ...delivery, status: "cancelled" as const, updatedAt: now } : delivery),
  };
  const next = appendErpAudit(staged, {
    entityType: "sales_order", entityId: cancelled.id, action: "sales_order.cancelled", actorRole: role, actorId: `role:${role}`,
    detail: { orderNumber: cancelled.orderNumber, previousStatus: found.status, releasedQuantity: found.lines.reduce((sum, line) => sum + line.quantity - line.deliveredQuantity, 0) },
  }, now);
  return commitErpState(state, next, cancelled);
}

export function createPurchaseRequestFromShortage(state: ErpState, role: ErpRole, salesOrderId: string, now: string): ErpCommandResult<PurchaseRequest> {
  const authorization = requireSalesWrite<PurchaseRequest>(state, role);
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const found = findSalesOrder<PurchaseRequest>(state, salesOrderId);
  if ("ok" in found) return found;
  if (found.status !== "draft") return rejectErpCommand(state, { code: "INVALID_STATE", message: "A shortage purchase request requires a draft Sales Order." });
  if (state.purchaseRequests.some((request) => request.sourceSalesOrderId === found.id && request.status !== "cancelled")) return rejectErpCommand(state, { code: "INVALID_STATE", message: "This Sales Order already has an active shortage purchase request." });
  const shortages = selectSalesShortage(state, found.id);
  if (shortages.length === 0) return rejectErpCommand(state, { code: "INVALID_STATE", message: "This Sales Order has no current stock shortage." });
  const requestNumber = nextDocumentNumber("PR", now, state.purchaseRequests.map((request) => request.requestNumber));
  const request: PurchaseRequest = {
    id: documentId("purchase-request", requestNumber), requestNumber, requesterRole: role, sourceSalesOrderId: found.id, status: "draft",
    lines: shortages.map((shortage) => ({ productId: shortage.productId, quantity: shortage.shortage, unitPrice: state.products.find((product) => product.id === shortage.productId)!.purchasePrice })),
    createdAt: now, updatedAt: now,
  };
  const next = appendErpAudit({ ...state, purchaseRequests: [...state.purchaseRequests, request] }, {
    entityType: "purchase_request", entityId: request.id, action: "purchase_request.created_from_sales_shortage", actorRole: role, actorId: `role:${role}`,
    detail: { requestNumber, sourceSalesOrderId: found.id, lineCount: request.lines.length },
  }, now);
  return commitErpState(state, next, request);
}

export function createDeliveryOrder(state: ErpState, role: ErpRole, input: DeliveryOrderInput, now: string): ErpCommandResult<DeliveryOrder> {
  const authorization = requireDeliveryDraft<DeliveryOrder>(state, role);
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const warehouse = activeWarehouse<DeliveryOrder>(state);
  if ("ok" in warehouse) return warehouse;
  const found = findSalesOrder<DeliveryOrder>(state, input.salesOrderId);
  if ("ok" in found) return found;
  if (found.status !== "confirmed" && found.status !== "partially_delivered") return rejectErpCommand(state, { code: "INVALID_STATE", message: "Delivery orders require a confirmed or partially delivered Sales Order." });
  if (found.warehouseId !== warehouse.id) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Sales Order warehouse must match the active warehouse." });
  if (input.lines.length === 0) return invalid(state, "Delivery orders require at least one line.");
  const seen = new Set<string>();
  const lines: QuantityLine[] = [];
  for (const inputLine of input.lines) {
    if (seen.has(inputLine.productId)) return invalid(state, "Delivery order products must be unique.", { productId: inputLine.productId });
    const orderLine = found.lines.find((line) => line.productId === inputLine.productId);
    if (!orderLine) return invalid(state, "Delivery product does not belong to the Sales Order.", { productId: inputLine.productId });
    if (!Number.isInteger(inputLine.quantity) || inputLine.quantity <= 0) return invalid(state, "Delivery quantity must be a positive whole number.", { productId: inputLine.productId });
    const remaining = orderLine.quantity - orderLine.deliveredQuantity;
    if (inputLine.quantity > remaining) return shortageError(state, inputLine.productId, remaining, inputLine.quantity);
    lines.push({ productId: inputLine.productId, quantity: inputLine.quantity, unitPrice: orderLine.unitPrice });
    seen.add(inputLine.productId);
  }
  const deliveryNumber = nextDocumentNumber("DO", now, state.deliveryOrders.map((delivery) => delivery.deliveryNumber));
  const delivery: DeliveryOrder = {
    id: documentId("delivery-order", deliveryNumber), deliveryNumber, salesOrderId: found.id, warehouseId: warehouse.id, status: "draft", lines, createdAt: now, updatedAt: now,
  };
  const next = appendErpAudit({ ...state, deliveryOrders: [...state.deliveryOrders, delivery] }, {
    entityType: "delivery_order", entityId: delivery.id, action: "delivery_order.created", actorRole: role, actorId: `role:${role}`,
    detail: { deliveryNumber, salesOrderId: found.id, lineCount: delivery.lines.length },
  }, now);
  return commitErpState(state, next, delivery);
}

export function completeDelivery(state: ErpState, role: ErpRole, deliveryOrderId: string, now: string): ErpCommandResult<DeliveryOrder> {
  const authorization = requireDeliveryCompletion<DeliveryOrder>(state, role);
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const warehouse = activeWarehouse<DeliveryOrder>(state);
  if ("ok" in warehouse) return warehouse;
  const delivery = state.deliveryOrders.find((item) => item.id === deliveryOrderId);
  if (!delivery) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Delivery order was not found." });
  if (delivery.status !== "draft") return rejectErpCommand(state, { code: "INVALID_STATE", message: "Only a draft Delivery Order can be completed." });
  const found = findSalesOrder<DeliveryOrder>(state, delivery.salesOrderId);
  if ("ok" in found) return found;
  if (found.status !== "confirmed" && found.status !== "partially_delivered") return rejectErpCommand(state, { code: "INVALID_STATE", message: "Delivery completion requires an active Sales Order reservation." });
  if (delivery.warehouseId !== warehouse.id || found.warehouseId !== warehouse.id) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Delivery and Sales Order must use the active warehouse." });
  const seen = new Set<string>();
  for (const line of delivery.lines) {
    if (seen.has(line.productId)) return invalid(state, "Delivery order products must be unique.", { productId: line.productId });
    const orderLine = found.lines.find((item) => item.productId === line.productId);
    if (!orderLine || line.unitPrice !== orderLine.unitPrice || !Number.isInteger(line.quantity) || line.quantity <= 0) return invalid(state, "Delivery line does not match the Sales Order.", { productId: line.productId });
    const remaining = orderLine.quantity - orderLine.deliveredQuantity;
    if (line.quantity > remaining) return shortageError(state, line.productId, remaining, line.quantity);
    const physical = selectPhysicalStock(state, line.productId);
    if (line.quantity > physical) return shortageError(state, line.productId, physical, line.quantity);
    seen.add(line.productId);
  }

  const completed: DeliveryOrder = { ...delivery, status: "posted", updatedAt: now };
  const deliveredByProduct = new Map(delivery.lines.map((line) => [line.productId, line.quantity]));
  const updatedLines = found.lines.map((line) => ({ ...line, deliveredQuantity: line.deliveredQuantity + (deliveredByProduct.get(line.productId) ?? 0) }));
  const updatedOrder: SalesOrder = { ...found, status: updatedLines.every((line) => line.deliveredQuantity === line.quantity) ? "fully_delivered" : "partially_delivered", lines: updatedLines, updatedAt: now };
  const movements: StockMovement[] = delivery.lines.map((line) => ({
    id: `stock-movement-${delivery.id}-${line.productId}`, type: "delivery", productId: line.productId, warehouseId: delivery.warehouseId, quantity: line.quantity,
    direction: "out", sourceType: "delivery_order", sourceId: delivery.id, actorRole: role, actorId: `role:${role}`, reason: `Completed ${delivery.deliveryNumber}`, createdAt: now, updatedAt: now,
  }));
  const staged = {
    ...state,
    deliveryOrders: state.deliveryOrders.map((item) => item.id === completed.id
      ? completed
      : updatedOrder.status === "fully_delivered" && item.salesOrderId === updatedOrder.id && item.status === "draft"
        ? { ...item, status: "cancelled" as const, updatedAt: now }
        : item),
    salesOrders: state.salesOrders.map((item) => item.id === updatedOrder.id ? updatedOrder : item),
    stockMovements: [...state.stockMovements, ...movements],
  };
  const next = appendErpAudit(staged, {
    entityType: "delivery_order", entityId: completed.id, action: "delivery_order.completed", actorRole: role, actorId: `role:${role}`,
    detail: { deliveryNumber: completed.deliveryNumber, salesOrderId: updatedOrder.id, salesOrderStatus: updatedOrder.status, movementCount: movements.length },
  }, now);
  return commitErpState(state, next, completed);
}
