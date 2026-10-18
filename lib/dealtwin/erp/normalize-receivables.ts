import { isoDate } from "../domain/date";
import { rupiah } from "../domain/money";
import type { Result } from "../domain/result";
import type { DeliveryOrder, ErpState, Payment, SalesOrder, TradeInvoice } from "../../erp/types";
import { createFinancialSourceReference, type FinancialSourceReference, type NormalizedReceipt } from "./adapter-types";

function failure(code: string, message: string): Result<readonly NormalizedReceipt[]> { return { ok: false, error: { code, message } }; }
function hasDuplicates(values: readonly string[]): boolean { return new Set(values).size !== values.length; }
function safePositive(value: number): boolean { return Number.isSafeInteger(value) && value > 0; }
function salesSource(order: SalesOrder, revision: string): FinancialSourceReference {
  return createFinancialSourceReference("sales_order", order.id, revision, { id: order.id, customerId: order.customerId, warehouseId: order.warehouseId, status: order.status, lines: order.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice, deliveredQuantity: line.deliveredQuantity })) });
}
function deliverySource(delivery: DeliveryOrder, revision: string): FinancialSourceReference {
  return createFinancialSourceReference("delivery_order", delivery.id, revision, { id: delivery.id, salesOrderId: delivery.salesOrderId, status: delivery.status, lines: delivery.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice })) });
}
function invoiceSource(invoice: TradeInvoice, revision: string): FinancialSourceReference {
  return createFinancialSourceReference("customer_invoice", invoice.id, revision, { id: invoice.id, salesOrderId: invoice.salesOrderId, customerId: invoice.customerId, sourceDocumentIds: [...invoice.sourceDocumentIds].sort(), status: invoice.status, totalAmount: invoice.totalAmount, dueDate: invoice.dueDate });
}
function paymentSource(payment: Payment, revision: string): FinancialSourceReference {
  return createFinancialSourceReference("payment", payment.id, revision, { id: payment.id, invoiceId: payment.invoiceId, direction: payment.direction, amount: payment.amount, paymentDate: payment.paymentDate, status: payment.status });
}

export function normalizeReceivables(state: ErpState): Result<readonly NormalizedReceipt[]> {
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) return failure("INVALID_FINANCIAL_STATE", "ERP revision is invalid.");
  if (hasDuplicates(state.salesOrders.map((row) => row.id)) || hasDuplicates(state.deliveryOrders.map((row) => row.id))
    || hasDuplicates(state.customerInvoices.map((row) => row.id)) || hasDuplicates(state.payments.map((row) => row.id))) {
    return failure("DUPLICATE_FINANCIAL_SOURCE", "Financial source IDs must be unique.");
  }
  const revision = String(state.revision);
  const output: NormalizedReceipt[] = [];
  for (const invoice of [...state.customerInvoices].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!invoice.salesOrderId || !invoice.customerId || !safePositive(invoice.totalAmount)) return failure("INVALID_FINANCIAL_STATE", "Customer invoice authority is invalid.");
    try { isoDate(invoice.dueDate); } catch { return failure("INVALID_FINANCIAL_STATE", "Customer invoice expected date is invalid."); }
    const order = state.salesOrders.find((row) => row.id === invoice.salesOrderId);
    if (!order || order.customerId !== invoice.customerId) return failure("INVALID_FINANCIAL_STATE", "Customer invoice lineage is invalid.");
    if (hasDuplicates(invoice.sourceDocumentIds)) return failure("DUPLICATE_FINANCIAL_SOURCE", "Customer invoice source documents must be unique.");
    const deliveries: DeliveryOrder[] = [];
    for (const sourceId of [...invoice.sourceDocumentIds].sort()) {
      const delivery = state.deliveryOrders.find((row) => row.id === sourceId && row.salesOrderId === order.id && row.status === "posted");
      if (!delivery) return failure("INVALID_FINANCIAL_STATE", "Customer invoice delivery lineage is invalid.");
      deliveries.push(delivery);
    }
    const payments = state.payments.filter((row) => row.invoiceId === invoice.id && row.direction === "receivable").sort((a, b) => a.id.localeCompare(b.id));
    if (payments.some((row) => !safePositive(row.amount) || row.customerId !== invoice.customerId)) return failure("INVALID_FINANCIAL_STATE", "Receivable payment evidence is invalid.");
    if (invoice.status === "cancelled") continue;
    const paid = payments.filter((row) => row.status === "posted").reduce((sum, row) => sum + BigInt(row.amount), 0n);
    const remaining = BigInt(invoice.totalAmount) - paid;
    if (remaining < 0n || (invoice.status === "paid" && remaining !== 0n) || (invoice.status !== "paid" && remaining === 0n)) {
      return failure("INVALID_FINANCIAL_STATE", "Customer invoice balance and status disagree.");
    }
    if (remaining === 0n) continue;
    output.push({
      economicEventId: `receivable:${order.id}`, customerId: invoice.customerId, salesOrderId: order.id,
      authority: "customer_invoice", expectedDate: isoDate(invoice.dueDate), sameDayOrder: 500, amountRupiah: rupiah(remaining),
      sourceChain: [salesSource(order, revision), ...deliveries.map((row) => deliverySource(row, revision)), invoiceSource(invoice, revision), ...payments.map((row) => paymentSource(row, revision))],
    });
  }
  return { ok: true, value: output.sort((left, right) => left.economicEventId.localeCompare(right.economicEventId)) };
}
