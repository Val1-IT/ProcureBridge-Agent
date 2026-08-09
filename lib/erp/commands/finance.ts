import { nextDocumentNumber } from "../document-numbers";
import type { ErpCommandResult } from "../errors";
import { authorize } from "../permissions";
import { selectPayableBalance, selectReceivableBalance } from "../selectors-finance";
import type { DeliveryOrder, ErpRole, ErpState, GoodsReceipt, Payment, QuantityLine, TradeInvoice } from "../types";
import { appendErpAudit, commitErpState, isErpRole, rejectErpCommand } from "./shared";

export interface SupplierInvoiceInput {
  purchaseOrderId: string;
  sourceDocumentIds: readonly string[];
  dueDate: string;
}

export interface CustomerInvoiceInput {
  salesOrderId: string;
  sourceDocumentIds: readonly string[];
  dueDate: string;
}

export interface PaymentInput {
  invoiceId: string;
  direction: "payable" | "receivable";
  amount: number;
}

function invalid<T>(state: ErpState, message: string, details?: Record<string, string | number>): ErpCommandResult<T> {
  return rejectErpCommand(state, { code: "INVALID_INPUT", message, ...(details ? { details } : {}) });
}

function requireFinance<T>(state: ErpState, role: ErpRole): ErpCommandResult<T> | null {
  if (!isErpRole(role)) return invalid(state, "Active role is invalid.");
  return authorize(role, "finance.write") ? null : rejectErpCommand(state, { code: "FORBIDDEN", message: "Finance or Admin role is required for finance mutations." });
}

function hasValidNow(now: string): boolean {
  return !Number.isNaN(new Date(now).getTime());
}

function hasValidDueDate(dueDate: string, now: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return false;
  const parsed = new Date(`${dueDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dueDate) return false;
  return dueDate >= now.slice(0, 10);
}

function validateSourceIds<T>(state: ErpState, sourceDocumentIds: readonly string[]): ErpCommandResult<T> | null {
  if (sourceDocumentIds.length === 0) return invalid(state, "At least one source document is required.");
  if (new Set(sourceDocumentIds).size !== sourceDocumentIds.length) return invalid(state, "Source documents must be unique.");
  if (sourceDocumentIds.some((id) => !id.trim())) return invalid(state, "Source document identifiers are invalid.");
  return null;
}

function aggregateLines(documents: ReadonlyArray<{ lines: QuantityLine[] }>): QuantityLine[] {
  const aggregated = new Map<string, QuantityLine>();
  for (const document of documents) {
    for (const line of document.lines) {
      const current = aggregated.get(line.productId);
      aggregated.set(line.productId, current
        ? { ...current, quantity: current.quantity + line.quantity }
        : { productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice });
    }
  }
  return [...aggregated.values()];
}

function total(lines: readonly QuantityLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}

function alreadyInvoiced(invoices: readonly TradeInvoice[], sourceDocumentId: string): boolean {
  return invoices.some((invoice) => invoice.status !== "cancelled" && invoice.sourceDocumentIds.includes(sourceDocumentId));
}

function invoiceId(kind: "supplier" | "customer", invoiceNumber: string): string {
  return `${kind}-invoice-${invoiceNumber.toLowerCase()}`;
}

function hasExactReceiptEvidence(state: ErpState, receipt: GoodsReceipt, purchaseOrder: ErpState["purchaseOrders"][number]): boolean {
  if (receipt.lines.length === 0 || new Set(receipt.lines.map((line) => line.productId)).size !== receipt.lines.length) return false;
  return receipt.lines.every((line) => {
    const orderLine = purchaseOrder.lines.find((item) => item.productId === line.productId);
    if (!orderLine || !Number.isInteger(line.quantity) || line.quantity <= 0 || line.unitPrice !== orderLine.unitPrice) return false;
    const movements = state.stockMovements.filter((movement) => movement.sourceType === "goods_receipt" && movement.sourceId === receipt.id && movement.productId === line.productId);
    return movements.length === 1 && movements[0].type === "receipt" && movements[0].warehouseId === receipt.warehouseId && movements[0].direction === "in" && movements[0].quantity === line.quantity;
  }) && state.stockMovements.filter((movement) => movement.sourceType === "goods_receipt" && movement.sourceId === receipt.id).length === receipt.lines.length;
}

function hasExactDeliveryEvidence(state: ErpState, delivery: DeliveryOrder, salesOrder: ErpState["salesOrders"][number]): boolean {
  if (delivery.lines.length === 0 || new Set(delivery.lines.map((line) => line.productId)).size !== delivery.lines.length) return false;
  return delivery.lines.every((line) => {
    const orderLine = salesOrder.lines.find((item) => item.productId === line.productId);
    if (!orderLine || !Number.isInteger(line.quantity) || line.quantity <= 0 || line.unitPrice !== orderLine.unitPrice) return false;
    const movements = state.stockMovements.filter((movement) => movement.sourceType === "delivery_order" && movement.sourceId === delivery.id && movement.productId === line.productId);
    return movements.length === 1 && movements[0].type === "delivery" && movements[0].warehouseId === delivery.warehouseId && movements[0].direction === "out" && movements[0].quantity === line.quantity;
  }) && state.stockMovements.filter((movement) => movement.sourceType === "delivery_order" && movement.sourceId === delivery.id).length === delivery.lines.length;
}

export function recordSupplierInvoice(state: ErpState, role: ErpRole, input: SupplierInvoiceInput, now: string): ErpCommandResult<TradeInvoice> {
  const authorization = requireFinance<TradeInvoice>(state, role);
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  if (!hasValidDueDate(input.dueDate, now)) return invalid(state, "Invoice due date must be a valid date on or after the invoice date.");
  const sourceError = validateSourceIds<TradeInvoice>(state, input.sourceDocumentIds);
  if (sourceError) return sourceError;
  const purchaseOrder = state.purchaseOrders.find((order) => order.id === input.purchaseOrderId);
  if (!purchaseOrder) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Purchase order was not found." });
  if (!["partially_received", "fully_received"].includes(purchaseOrder.status)) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Supplier invoices require received purchase-order quantities." });
  const supplier = state.suppliers.find((item) => item.id === purchaseOrder.supplierId && item.active);
  if (!supplier) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Purchase order supplier is missing or inactive." });

  const receipts: GoodsReceipt[] = [];
  for (const sourceId of input.sourceDocumentIds) {
    const receipt = state.goodsReceipts.find((item) => item.id === sourceId);
    if (!receipt) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Goods receipt source was not found." });
    if (receipt.status !== "approved" || receipt.purchaseOrderId !== purchaseOrder.id || receipt.warehouseId !== purchaseOrder.warehouseId || !hasExactReceiptEvidence(state, receipt, purchaseOrder)) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Supplier invoice sources must be approved receipts with exact posting evidence for the selected purchase order." });
    if (alreadyInvoiced(state.supplierInvoices, receipt.id)) return rejectErpCommand(state, { code: "INVALID_STATE", message: "One or more receipt quantities have already been invoiced." });
    receipts.push(receipt);
  }
  const lines = aggregateLines(receipts);
  const totalAmount = total(lines);
  if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Supplier invoice total is invalid." });
  const invoiceNumber = nextDocumentNumber("SINV", now, state.supplierInvoices.map((invoice) => invoice.invoiceNumber));
  const invoice: TradeInvoice = {
    id: invoiceId("supplier", invoiceNumber), invoiceNumber, purchaseOrderId: purchaseOrder.id, salesOrderId: null,
    supplierId: supplier.id, customerId: null, sourceDocumentIds: [...input.sourceDocumentIds], status: "unpaid",
    lines, totalAmount, dueDate: input.dueDate, createdAt: now, updatedAt: now,
  };
  const coveredSources = new Set([...state.supplierInvoices.filter((item) => item.status !== "cancelled").flatMap((item) => item.sourceDocumentIds), ...invoice.sourceDocumentIds]);
  const allApprovedSourcesCovered = state.goodsReceipts.filter((receipt) => receipt.purchaseOrderId === purchaseOrder.id && receipt.status === "approved").every((receipt) => coveredSources.has(receipt.id));
  const updatedPurchaseOrder = purchaseOrder.status === "fully_received" && allApprovedSourcesCovered ? { ...purchaseOrder, status: "completed" as const, updatedAt: now } : purchaseOrder;
  const staged: ErpState = {
    ...state,
    supplierInvoices: [...state.supplierInvoices, invoice],
    purchaseOrders: state.purchaseOrders.map((order) => order.id === purchaseOrder.id ? updatedPurchaseOrder : order),
  };
  const next = appendErpAudit(staged, {
    entityType: "trade_invoice", entityId: invoice.id, action: "supplier_invoice.recorded", actorRole: role, actorId: `role:${role}`,
    detail: { invoiceNumber, purchaseOrderId: purchaseOrder.id, supplierId: supplier.id, sourceCount: invoice.sourceDocumentIds.length, totalAmount },
  }, now);
  return commitErpState(state, next, invoice);
}

export function createCustomerInvoice(state: ErpState, role: ErpRole, input: CustomerInvoiceInput, now: string): ErpCommandResult<TradeInvoice> {
  const authorization = requireFinance<TradeInvoice>(state, role);
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  if (!hasValidDueDate(input.dueDate, now)) return invalid(state, "Invoice due date must be a valid date on or after the invoice date.");
  const sourceError = validateSourceIds<TradeInvoice>(state, input.sourceDocumentIds);
  if (sourceError) return sourceError;
  const salesOrder = state.salesOrders.find((order) => order.id === input.salesOrderId);
  if (!salesOrder) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Sales order was not found." });
  if (!["partially_delivered", "fully_delivered"].includes(salesOrder.status)) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Customer invoices require delivered sales-order quantities." });
  const customer = state.customers.find((item) => item.id === salesOrder.customerId && item.active);
  if (!customer) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Sales order customer is missing or inactive." });

  const deliveries: DeliveryOrder[] = [];
  for (const sourceId of input.sourceDocumentIds) {
    const delivery = state.deliveryOrders.find((item) => item.id === sourceId);
    if (!delivery) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Delivery Order source was not found." });
    if (delivery.status !== "posted" || delivery.salesOrderId !== salesOrder.id || delivery.warehouseId !== salesOrder.warehouseId || !hasExactDeliveryEvidence(state, delivery, salesOrder)) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Customer invoice sources must be posted deliveries with exact movement evidence for the selected Sales Order." });
    if (alreadyInvoiced(state.customerInvoices, delivery.id)) return rejectErpCommand(state, { code: "INVALID_STATE", message: "One or more delivered quantities have already been invoiced." });
    deliveries.push(delivery);
  }
  const lines = aggregateLines(deliveries);
  const totalAmount = total(lines);
  if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Customer invoice total is invalid." });
  const invoiceNumber = nextDocumentNumber("CINV", now, state.customerInvoices.map((invoice) => invoice.invoiceNumber));
  const invoice: TradeInvoice = {
    id: invoiceId("customer", invoiceNumber), invoiceNumber, purchaseOrderId: null, salesOrderId: salesOrder.id,
    supplierId: null, customerId: customer.id, sourceDocumentIds: [...input.sourceDocumentIds], status: "unpaid",
    lines, totalAmount, dueDate: input.dueDate, createdAt: now, updatedAt: now,
  };
  const coveredSources = new Set([...state.customerInvoices.filter((item) => item.status !== "cancelled").flatMap((item) => item.sourceDocumentIds), ...invoice.sourceDocumentIds]);
  const allPostedSourcesCovered = state.deliveryOrders.filter((delivery) => delivery.salesOrderId === salesOrder.id && delivery.status === "posted").every((delivery) => coveredSources.has(delivery.id));
  const updatedSalesOrder = salesOrder.status === "fully_delivered" && allPostedSourcesCovered ? { ...salesOrder, status: "invoiced" as const, updatedAt: now } : salesOrder;
  const staged: ErpState = {
    ...state,
    customerInvoices: [...state.customerInvoices, invoice],
    salesOrders: state.salesOrders.map((order) => order.id === salesOrder.id ? updatedSalesOrder : order),
  };
  const next = appendErpAudit(staged, {
    entityType: "trade_invoice", entityId: invoice.id, action: "customer_invoice.created", actorRole: role, actorId: `role:${role}`,
    detail: { invoiceNumber, salesOrderId: salesOrder.id, customerId: customer.id, sourceCount: invoice.sourceDocumentIds.length, totalAmount },
  }, now);
  return commitErpState(state, next, invoice);
}

export function recordPayment(state: ErpState, role: ErpRole, input: PaymentInput, now: string): ErpCommandResult<Payment> {
  const authorization = requireFinance<Payment>(state, role);
  if (authorization) return authorization;
  if (!hasValidNow(now)) return invalid(state, "Command time is invalid.");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) return invalid(state, "Payment amount must be a positive whole amount.");
  if (input.direction !== "payable" && input.direction !== "receivable") return invalid(state, "Payment direction is invalid.");
  const expectedInvoices = input.direction === "payable" ? state.supplierInvoices : state.customerInvoices;
  const oppositeInvoices = input.direction === "payable" ? state.customerInvoices : state.supplierInvoices;
  const invoice = expectedInvoices.find((item) => item.id === input.invoiceId);
  if (!invoice && oppositeInvoices.some((item) => item.id === input.invoiceId)) return invalid(state, "Payment direction does not match the invoice.");
  if (!invoice) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Invoice was not found." });
  if (invoice.status === "cancelled") return rejectErpCommand(state, { code: "INVALID_STATE", message: "Cancelled invoices cannot receive payments." });
  const purchaseOrder = invoice.purchaseOrderId ? state.purchaseOrders.find((order) => order.id === invoice.purchaseOrderId) : null;
  const salesOrder = invoice.salesOrderId ? state.salesOrders.find((order) => order.id === invoice.salesOrderId) : null;
  if (input.direction === "payable" && (!invoice.supplierId || invoice.customerId !== null || !purchaseOrder || purchaseOrder.supplierId !== invoice.supplierId || !state.suppliers.some((supplier) => supplier.id === invoice.supplierId))) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Payable invoice counterparty references are invalid." });
  if (input.direction === "receivable" && (!invoice.customerId || invoice.supplierId !== null || !salesOrder || salesOrder.customerId !== invoice.customerId || !state.customers.some((customer) => customer.id === invoice.customerId))) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Receivable invoice counterparty references are invalid." });
  const relatedPayments = state.payments.filter((payment) => payment.invoiceId === invoice.id);
  if (relatedPayments.some((payment) => payment.direction !== input.direction || payment.supplierId !== invoice.supplierId || payment.customerId !== invoice.customerId || !Number.isSafeInteger(payment.amount) || payment.amount <= 0)) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Existing payment evidence does not match the invoice." });
  const calculatedTotal = total(invoice.lines);
  const postedAmount = relatedPayments.filter((payment) => payment.status === "posted").reduce((sum, payment) => sum + payment.amount, 0);
  const expectedStatus = postedAmount === 0 ? "unpaid" : postedAmount === invoice.totalAmount ? "paid" : postedAmount < invoice.totalAmount ? "partially_paid" : null;
  if (!Number.isSafeInteger(calculatedTotal) || calculatedTotal <= 0 || calculatedTotal !== invoice.totalAmount || expectedStatus === null || invoice.status !== expectedStatus) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Invoice total or payment status evidence is inconsistent." });
  const remaining = input.direction === "payable" ? selectPayableBalance(state, invoice.id) : selectReceivableBalance(state, invoice.id);
  if (remaining <= 0) return rejectErpCommand(state, { code: "INVALID_STATE", message: "This invoice is already fully paid." });
  if (input.amount > remaining) return invalid(state, "Payment amount cannot exceed the remaining invoice balance.", { remainingBalance: remaining });

  const paymentNumber = nextDocumentNumber("PMT", now, state.payments.map((payment) => payment.paymentNumber));
  const payment: Payment = {
    id: `payment-${paymentNumber.toLowerCase()}`, paymentNumber, invoiceId: invoice.id, direction: input.direction,
    supplierId: invoice.supplierId, customerId: invoice.customerId, amount: input.amount, paymentDate: now.slice(0, 10), status: "posted",
    createdAt: now, updatedAt: now,
  };
  const nextBalance = remaining - input.amount;
  const updatedInvoice: TradeInvoice = { ...invoice, status: nextBalance === 0 ? "paid" : "partially_paid", updatedAt: now };
  let salesOrders = state.salesOrders;
  if (input.direction === "receivable" && updatedInvoice.status === "paid" && updatedInvoice.salesOrderId) {
    const currentOrder = state.salesOrders.find((order) => order.id === updatedInvoice.salesOrderId);
    const otherInvoicesPaid = state.customerInvoices.filter((item) => item.salesOrderId === updatedInvoice.salesOrderId && item.id !== updatedInvoice.id && item.status !== "cancelled").every((item) => item.status === "paid");
    if (currentOrder?.status === "invoiced" && otherInvoicesPaid) salesOrders = state.salesOrders.map((order) => order.id === currentOrder.id ? { ...order, status: "completed", updatedAt: now } : order);
  }
  const staged: ErpState = {
    ...state,
    supplierInvoices: input.direction === "payable" ? state.supplierInvoices.map((item) => item.id === invoice.id ? updatedInvoice : item) : state.supplierInvoices,
    customerInvoices: input.direction === "receivable" ? state.customerInvoices.map((item) => item.id === invoice.id ? updatedInvoice : item) : state.customerInvoices,
    payments: [...state.payments, payment],
    salesOrders,
  };
  const next = appendErpAudit(staged, {
    entityType: "payment", entityId: payment.id, action: "payment.recorded", actorRole: role, actorId: `role:${role}`,
    detail: { paymentNumber, invoiceId: invoice.id, direction: input.direction, amount: payment.amount, remainingBalance: nextBalance, counterpartyId: invoice.supplierId ?? invoice.customerId },
  }, now);
  return commitErpState(state, next, payment);
}
