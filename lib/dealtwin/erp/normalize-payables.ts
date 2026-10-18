import { addCalendarDays, isoDate } from "../domain/date";
import { rupiah } from "../domain/money";
import type { Result } from "../domain/result";
import type { ErpState, GoodsReceipt, Payment, PurchaseOrder, TradeInvoice } from "../../erp/types";
import { createFinancialSourceReference, type FinancialSourceReference, type NormalizedObligation } from "./adapter-types";

function failure(code: string, message: string): Result<readonly NormalizedObligation[]> {
  return { ok: false, error: { code, message } };
}
function hasDuplicates(values: readonly string[]): boolean { return new Set(values).size !== values.length; }
function safePositive(value: number): boolean { return Number.isSafeInteger(value) && value > 0; }
function total(lines: readonly { quantity: number; unitPrice: number }[]): bigint | null {
  if (lines.length === 0 || lines.some((line) => !safePositive(line.quantity) || !safePositive(line.unitPrice))) return null;
  return lines.reduce((sum, line) => sum + BigInt(line.quantity) * BigInt(line.unitPrice), 0n);
}
function poSource(po: PurchaseOrder, revision: string): FinancialSourceReference {
  return createFinancialSourceReference("purchase_order", po.id, revision, {
    id: po.id, supplierId: po.supplierId, warehouseId: po.warehouseId, status: po.status,
    promisedDeliveryDate: po.promisedDeliveryDate, lines: po.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice })),
  });
}
function receiptSource(receipt: GoodsReceipt, revision: string): FinancialSourceReference {
  return createFinancialSourceReference("goods_receipt", receipt.id, revision, {
    id: receipt.id, purchaseOrderId: receipt.purchaseOrderId, status: receipt.status,
    lines: receipt.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice })),
  });
}
function invoiceSource(invoice: TradeInvoice, revision: string): FinancialSourceReference {
  return createFinancialSourceReference("supplier_invoice", invoice.id, revision, {
    id: invoice.id, purchaseOrderId: invoice.purchaseOrderId, supplierId: invoice.supplierId, sourceDocumentIds: [...invoice.sourceDocumentIds].sort(),
    status: invoice.status, totalAmount: invoice.totalAmount, dueDate: invoice.dueDate,
  });
}
function paymentSource(payment: Payment, revision: string): FinancialSourceReference {
  return createFinancialSourceReference("payment", payment.id, revision, {
    id: payment.id, invoiceId: payment.invoiceId, direction: payment.direction, amount: payment.amount, paymentDate: payment.paymentDate, status: payment.status,
  });
}

export function normalizePayables(state: ErpState): Result<readonly NormalizedObligation[]> {
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) return failure("INVALID_FINANCIAL_STATE", "ERP revision is invalid.");
  if (hasDuplicates(state.purchaseOrders.map((row) => row.id)) || hasDuplicates(state.goodsReceipts.map((row) => row.id))
    || hasDuplicates(state.supplierInvoices.map((row) => row.id)) || hasDuplicates(state.payments.map((row) => row.id))) {
    return failure("DUPLICATE_FINANCIAL_SOURCE", "Financial source IDs must be unique.");
  }
  const revision = String(state.revision);
  const output: NormalizedObligation[] = [];
  const invoicePoIds = new Set<string>();

  for (const invoice of [...state.supplierInvoices].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!invoice.purchaseOrderId || !invoice.supplierId || !safePositive(invoice.totalAmount)) return failure("INVALID_FINANCIAL_STATE", "Supplier invoice authority is invalid.");
    try { isoDate(invoice.dueDate); } catch { return failure("INVALID_FINANCIAL_STATE", "Supplier invoice due date is invalid."); }
    const po = state.purchaseOrders.find((row) => row.id === invoice.purchaseOrderId);
    if (!po || po.supplierId !== invoice.supplierId) return failure("INVALID_FINANCIAL_STATE", "Supplier invoice lineage is invalid.");
    invoicePoIds.add(po.id);
    const receipts: GoodsReceipt[] = [];
    for (const sourceId of [...invoice.sourceDocumentIds].sort()) {
      const receipt = state.goodsReceipts.find((row) => row.id === sourceId && row.purchaseOrderId === po.id && (row.status === "approved" || row.status === "posted"));
      if (!receipt) return failure("INVALID_FINANCIAL_STATE", "Supplier invoice receipt lineage is invalid.");
      receipts.push(receipt);
    }
    if (hasDuplicates(invoice.sourceDocumentIds)) return failure("DUPLICATE_FINANCIAL_SOURCE", "Supplier invoice source documents must be unique.");
    const payments = state.payments.filter((row) => row.invoiceId === invoice.id && row.direction === "payable").sort((a, b) => a.id.localeCompare(b.id));
    if (payments.some((row) => !safePositive(row.amount) || row.supplierId !== invoice.supplierId)) return failure("INVALID_FINANCIAL_STATE", "Payable payment evidence is invalid.");
    if (invoice.status === "cancelled") continue;
    const paid = payments.filter((row) => row.status === "posted").reduce((sum, row) => sum + BigInt(row.amount), 0n);
    const remaining = BigInt(invoice.totalAmount) - paid;
    if (remaining < 0n || (invoice.status === "paid" && remaining !== 0n) || (invoice.status !== "paid" && remaining === 0n)) {
      return failure("INVALID_FINANCIAL_STATE", "Supplier invoice balance and status disagree.");
    }
    if (remaining === 0n) continue;
    output.push({
      economicEventId: `payable:${po.id}`, supplierId: invoice.supplierId, purchaseOrderId: po.id,
      authority: "supplier_invoice", dueDate: isoDate(invoice.dueDate), sameDayOrder: 300, amountRupiah: rupiah(remaining),
      sourceChain: [poSource(po, revision), ...receipts.map((row) => receiptSource(row, revision)), invoiceSource(invoice, revision), ...payments.map((row) => paymentSource(row, revision))],
    });
  }

  const payableStatuses = new Set(["confirmed", "partially_received", "fully_received", "completed"]);
  for (const po of [...state.purchaseOrders].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!payableStatuses.has(po.status) || invoicePoIds.has(po.id)) continue;
    const supplier = state.suppliers.find((row) => row.id === po.supplierId);
    const amount = total(po.lines);
    if (!supplier || !Number.isSafeInteger(supplier.paymentTermDays) || supplier.paymentTermDays < 0 || amount === null) {
      return failure("INVALID_FINANCIAL_STATE", "Confirmed purchase-order obligation is invalid.");
    }
    let baseDate;
    try { baseDate = isoDate(po.promisedDeliveryDate ?? po.createdAt.slice(0, 10)); } catch { return failure("INVALID_FINANCIAL_STATE", "Purchase-order obligation date is invalid."); }
    const receipts = state.goodsReceipts.filter((row) => row.purchaseOrderId === po.id && (row.status === "approved" || row.status === "posted")).sort((a, b) => a.id.localeCompare(b.id));
    output.push({
      economicEventId: `payable:${po.id}`, supplierId: po.supplierId, purchaseOrderId: po.id,
      authority: "purchase_order", dueDate: addCalendarDays(baseDate, supplier.paymentTermDays), sameDayOrder: 300, amountRupiah: rupiah(amount),
      sourceChain: [poSource(po, revision), ...receipts.map((row) => receiptSource(row, revision))],
    });
  }
  return { ok: true, value: output.sort((left, right) => left.economicEventId.localeCompare(right.economicEventId)) };
}
