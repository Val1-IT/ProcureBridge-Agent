import { nextDocumentNumber } from "../document-numbers";
import type { ErpCommandResult } from "../errors";
import { authorize } from "../permissions";
import { selectSupplierQuotationComparison, type SupplierQuotationComparisonItem } from "../selectors";
import { canTransitionPurchaseOrder } from "../transitions/purchase-order";
import type { ErpFollowUp, ErpRole, ErpState, PurchaseOrder, PurchaseOrderStatus, PurchaseRequest, QuantityLine, RequestForQuotation, RfqLine, SupplierQuotation } from "../types";
import { appendErpAudit, commitErpState, isErpRole, rejectErpCommand } from "./shared";

export interface PurchaseRequestInput {
  lines: readonly QuantityLine[];
}

export interface PurchaseOrderInput {
  supplierId: string;
  purchaseRequestId?: string | null;
  supplierQuotationId?: string | null;
  warehouseId?: string;
  lines: readonly QuantityLine[];
  confirmationDueAt?: string | null;
  promisedDeliveryDate?: string | null;
}

export interface RequestForQuotationInput {
  purchaseRequestId?: string | null;
  warehouseId?: string;
  supplierIds: readonly string[];
  quoteDueAt?: string;
  lines: readonly RfqLine[];
}

export interface SupplierQuotationInput {
  requestForQuotationId: string;
  supplierId: string;
  validUntil: string;
  lines: readonly QuantityLine[];
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

function hasValidNow(now: string): boolean {
  return !Number.isNaN(new Date(now).getTime());
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

function rfqLineCopies(lines: readonly RfqLine[]): RfqLine[] {
  return lines.map((line) => ({ productId: line.productId, quantity: line.quantity }));
}

function validateRfqLines<T>(state: ErpState, lines: readonly RfqLine[]): ErpCommandResult<T> | null {
  if (lines.length === 0) return invalid(state, "Requests for quotation require at least one line.");
  const productIds = new Set<string>();
  for (const line of lines) {
    if (!state.products.some((product) => product.id === line.productId && product.active)) return invalid(state, "RFQ line product was not found or is inactive.", { productId: line.productId });
    if (productIds.has(line.productId)) return invalid(state, "RFQ lines must use each product once.", { productId: line.productId });
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) return invalid(state, "RFQ line quantity must be positive.", { productId: line.productId });
    productIds.add(line.productId);
  }
  return null;
}

function activeWarehouse<T>(state: ErpState, warehouseId?: string): { id: string } | ErpCommandResult<T> {
  const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.active);
  if (activeWarehouses.length !== 1) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Exactly one active warehouse is required." });
  if (warehouseId && warehouseId !== activeWarehouses[0].id) return invalid(state, "Purchase document warehouse must be the active warehouse.", { warehouseId });
  return activeWarehouses[0];
}

function documentId(prefix: string, number: string): string {
  return `${prefix}-${number.toLowerCase()}`;
}

function findPurchaseOrder<T>(state: ErpState, purchaseOrderId: string): PurchaseOrder | ErpCommandResult<T> {
  return state.purchaseOrders.find((order) => order.id === purchaseOrderId)
    ?? rejectErpCommand(state, { code: "NOT_FOUND", message: "Purchase order was not found." });
}

function transition(
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
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
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
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const lineError = validateLines<PurchaseRequest>(state, input.lines);
  if (lineError) return lineError;
  const requestNumber = nextDocumentNumber("PR", now, state.purchaseRequests.map((request) => request.requestNumber));
  const request: PurchaseRequest = {
    id: documentId("purchase-request", requestNumber), requestNumber, requesterRole: role, sourceSalesOrderId: null, status: "draft", lines: lineCopies(input.lines), createdAt: now, updatedAt: now,
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
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const supplier = state.suppliers.find((item) => item.id === input.supplierId && item.active);
  if (!supplier) return invalid(state, "Purchase order supplier was not found or is inactive.", { supplierId: input.supplierId });
  const warehouse = activeWarehouse<PurchaseOrder>(state, input.warehouseId);
  if ("ok" in warehouse) return warehouse;
  if (input.purchaseRequestId && !state.purchaseRequests.some((request) => request.id === input.purchaseRequestId)) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Purchase request was not found." });
  const quotation = input.supplierQuotationId ? state.supplierQuotations.find((item) => item.id === input.supplierQuotationId && item.status === "selected") : null;
  if (input.supplierQuotationId && !quotation) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Selected supplier quotation was not found." });
  const requestForQuotation = quotation ? state.requestForQuotations.find((item) => item.id === quotation.requestForQuotationId) : null;
  if (quotation && (!requestForQuotation || requestForQuotation.status !== "selected" || requestForQuotation.selectedQuotationId !== quotation.id)) return invalid(state, "Selected supplier quotation is not selected by its RFQ.");
  if (quotation && (input.purchaseRequestId ?? null) !== requestForQuotation!.purchaseRequestId) return invalid(state, "Purchase order request must match its selected quotation RFQ.");
  if (quotation && warehouse.id !== requestForQuotation!.warehouseId) return invalid(state, "Purchase order warehouse must match its selected quotation RFQ.");
  if (quotation && quotation.supplierId !== supplier.id) return invalid(state, "Purchase order supplier must match its selected quotation.");
  if (quotation && !sameLines(quotation.lines, input.lines)) return invalid(state, "Purchase order lines must match its selected quotation.");
  if (!hasValidDate(input.confirmationDueAt) || !hasValidDate(input.promisedDeliveryDate)) return invalid(state, "Purchase order dates are invalid.");
  const lineError = validateLines<PurchaseOrder>(state, input.lines);
  if (lineError) return lineError;
  const orderNumber = nextDocumentNumber("PO", now, state.purchaseOrders.map((order) => order.orderNumber));
  const purchaseOrder: PurchaseOrder = {
    id: documentId("purchase-order", orderNumber), orderNumber, supplierId: supplier.id, purchaseRequestId: input.purchaseRequestId ?? null, supplierQuotationId: quotation?.id ?? null, warehouseId: warehouse.id,
    status: "draft", lines: lineCopies(input.lines), confirmationDueAt: input.confirmationDueAt ?? null, promisedDeliveryDate: input.promisedDeliveryDate ?? null,
    createdAt: now, updatedAt: now,
  };
  const next = appendErpAudit({ ...state, purchaseOrders: [...state.purchaseOrders, purchaseOrder] }, {
    entityType: "purchase_order", entityId: purchaseOrder.id, action: "purchase_order.created", actorRole: role, actorId: `role:${role}`,
    detail: { orderNumber: purchaseOrder.orderNumber, supplierId: purchaseOrder.supplierId, lineCount: purchaseOrder.lines.length },
  }, now);
  return commitErpState(state, next, purchaseOrder);
}

export function createRequestForQuotation(state: ErpState, role: ErpRole, input: RequestForQuotationInput, now: string): ErpCommandResult<RequestForQuotation> {
  const authorization = requirePurchasePermission<RequestForQuotation>(state, role, "purchase.write");
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const warehouse = activeWarehouse<RequestForQuotation>(state, input.warehouseId);
  if ("ok" in warehouse) return warehouse;
  if (input.purchaseRequestId && !state.purchaseRequests.some((request) => request.id === input.purchaseRequestId)) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Purchase request was not found." });
  if (input.supplierIds.length === 0 || new Set(input.supplierIds).size !== input.supplierIds.length) return invalid(state, "RFQ suppliers must be present and unique.");
  if (!input.supplierIds.every((supplierId) => state.suppliers.some((supplier) => supplier.id === supplierId && supplier.active))) return invalid(state, "RFQ supplier was not found or is inactive.");
  const lineError = validateRfqLines<RequestForQuotation>(state, input.lines);
  if (lineError) return lineError;
  const quoteDueAt = input.quoteDueAt ?? now;
  if (!hasValidDate(quoteDueAt)) return invalid(state, "RFQ quote due date is invalid.");
  const rfqNumber = nextDocumentNumber("RFQ", now, state.requestForQuotations.map((request) => request.rfqNumber));
  const requestForQuotation: RequestForQuotation = {
    id: documentId("request-for-quotation", rfqNumber), rfqNumber, purchaseRequestId: input.purchaseRequestId ?? null, warehouseId: warehouse.id,
    requestedSupplierIds: [...input.supplierIds], selectedQuotationId: null, status: "open", quoteDueAt, lines: rfqLineCopies(input.lines), createdAt: now, updatedAt: now,
  };
  const next = appendErpAudit({ ...state, requestForQuotations: [...state.requestForQuotations, requestForQuotation] }, {
    entityType: "request_for_quotation", entityId: requestForQuotation.id, action: "request_for_quotation.created", actorRole: role, actorId: `role:${role}`,
    detail: { rfqNumber, supplierCount: requestForQuotation.requestedSupplierIds.length, lineCount: requestForQuotation.lines.length },
  }, now);
  return commitErpState(state, next, requestForQuotation);
}

export function createSupplierQuotation(state: ErpState, role: ErpRole, input: SupplierQuotationInput, now: string): ErpCommandResult<SupplierQuotation> {
  const authorization = requirePurchasePermission<SupplierQuotation>(state, role, "purchase.write");
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const requestForQuotation = state.requestForQuotations.find((item) => item.id === input.requestForQuotationId);
  if (!requestForQuotation) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Request for quotation was not found." });
  if (requestForQuotation.status !== "open") return rejectErpCommand(state, { code: "INVALID_STATE", message: "Supplier quotations can only be added to an open RFQ." });
  if (!requestForQuotation.requestedSupplierIds.includes(input.supplierId) || !state.suppliers.some((supplier) => supplier.id === input.supplierId && supplier.active)) return invalid(state, "Supplier is not an active RFQ participant.");
  if (state.supplierQuotations.some((quotation) => quotation.requestForQuotationId === requestForQuotation.id && quotation.supplierId === input.supplierId)) return invalid(state, "RFQ already has a quotation from this supplier.");
  if (!hasValidDate(input.validUntil) || new Date(input.validUntil).getTime() < new Date(now).getTime()) return invalid(state, "Supplier quotation validity date is invalid.");
  const lineError = validateLines<SupplierQuotation>(state, input.lines);
  if (lineError) return lineError;
  if (!sameRfqLines(requestForQuotation.lines, input.lines)) return invalid(state, "Supplier quotation lines must match the RFQ quantities.");
  const quotationNumber = nextDocumentNumber("SQ", now, state.supplierQuotations.map((quotation) => quotation.quotationNumber));
  const quotation: SupplierQuotation = { id: documentId("supplier-quotation", quotationNumber), quotationNumber, requestForQuotationId: requestForQuotation.id, supplierId: input.supplierId, status: "submitted", validUntil: input.validUntil, lines: lineCopies(input.lines), createdAt: now, updatedAt: now };
  const next = appendErpAudit({ ...state, supplierQuotations: [...state.supplierQuotations, quotation] }, {
    entityType: "supplier_quotation", entityId: quotation.id, action: "supplier_quotation.created", actorRole: role, actorId: `role:${role}`,
    detail: { quotationNumber, rfqNumber: requestForQuotation.rfqNumber, lineCount: quotation.lines.length },
  }, now);
  return commitErpState(state, next, quotation);
}

export function compareSupplierQuotations(state: ErpState, role: ErpRole, requestForQuotationId: string, now: string): ErpCommandResult<SupplierQuotationComparisonItem[]> {
  const authorization = requirePurchasePermission<SupplierQuotationComparisonItem[]>(state, role, "purchase.write");
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const requestForQuotation = state.requestForQuotations.find((item) => item.id === requestForQuotationId);
  if (!requestForQuotation) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Request for quotation was not found." });
  if (requestForQuotation.status !== "open") return rejectErpCommand(state, { code: "INVALID_STATE", message: "Only an open RFQ can be compared." });
  const comparison = selectSupplierQuotationComparison(state, requestForQuotationId);
  if (comparison.length < 2) return invalid(state, "At least two supplier quotations are required for comparison.");
  const compared = { ...requestForQuotation, status: "compared" as const, updatedAt: now };
  const next = appendErpAudit({ ...state, requestForQuotations: state.requestForQuotations.map((item) => item.id === compared.id ? compared : item) }, {
    entityType: "request_for_quotation", entityId: compared.id, action: "request_for_quotation.compared", actorRole: role, actorId: `role:${role}`,
    detail: { rfqNumber: compared.rfqNumber, quotationCount: comparison.length },
  }, now);
  return commitErpState(state, next, comparison);
}

export function selectSupplierQuotation(state: ErpState, role: ErpRole, quotationId: string, now: string): ErpCommandResult<SupplierQuotation> {
  const authorization = requirePurchasePermission<SupplierQuotation>(state, role, "purchase.approve");
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const quotation = state.supplierQuotations.find((item) => item.id === quotationId);
  if (!quotation) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Supplier quotation was not found." });
  const requestForQuotation = state.requestForQuotations.find((item) => item.id === quotation.requestForQuotationId);
  if (!requestForQuotation) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Request for quotation was not found." });
  if (requestForQuotation.status !== "compared" || quotation.status !== "submitted") return rejectErpCommand(state, { code: "INVALID_STATE", message: "Only a submitted quotation from a compared RFQ can be selected." });
  const selected = { ...quotation, status: "selected" as const, updatedAt: now };
  const selectedRfq = { ...requestForQuotation, status: "selected" as const, selectedQuotationId: selected.id, updatedAt: now };
  const next = appendErpAudit({
    ...state,
    requestForQuotations: state.requestForQuotations.map((item) => item.id === selectedRfq.id ? selectedRfq : item),
    supplierQuotations: state.supplierQuotations.map((item) => item.requestForQuotationId !== selectedRfq.id ? item : item.id === selected.id ? selected : { ...item, status: "rejected" as const, updatedAt: now }),
  }, {
    entityType: "supplier_quotation", entityId: selected.id, action: "supplier_quotation.selected", actorRole: role, actorId: `role:${role}`,
    detail: { quotationNumber: selected.quotationNumber, rfqNumber: selectedRfq.rfqNumber },
  }, now);
  return commitErpState(state, next, selected);
}

export function approveSupplierFollowUp(state: ErpState, role: ErpRole, followUpId: string, now: string): ErpCommandResult<ErpFollowUp> {
  const authorization = requirePurchasePermission<ErpFollowUp>(state, role, "purchase.approve");
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  const followUp = state.followUps.find((item) => item.id === followUpId);
  if (!followUp) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Supplier follow-up was not found." });
  if (followUp.status !== "open" || !followUp.purchaseOrderId || followUp.approvalStatus !== "pending") return rejectErpCommand(state, { code: "INVALID_STATE", message: "Only a pending open supplier follow-up can be approved." });
  const approved = { ...followUp, approvalStatus: "approved" as const, approvedBy: `role:${role}`, updatedAt: now };
  const next = appendErpAudit({ ...state, followUps: state.followUps.map((item) => item.id === approved.id ? approved : item) }, {
    entityType: "supplier_follow_up", entityId: approved.id, action: "supplier_follow_up.approved", actorRole: role, actorId: `role:${role}`,
    detail: { purchaseOrderId: approved.purchaseOrderId, dueAt: approved.dueAt },
  }, now);
  return commitErpState(state, next, approved);
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
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
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

function sameRfqLines(rfqLines: readonly RfqLine[], quotationLines: readonly QuantityLine[]): boolean {
  return rfqLines.length === quotationLines.length && rfqLines.every((rfqLine) => quotationLines.some((quotationLine) => quotationLine.productId === rfqLine.productId && quotationLine.quantity === rfqLine.quantity));
}

function sameLines(left: readonly QuantityLine[], right: readonly QuantityLine[]): boolean {
  return left.length === right.length && left.every((line) => right.some((candidate) => candidate.productId === line.productId && candidate.quantity === line.quantity && candidate.unitPrice === line.unitPrice));
}
