import type { ErpState, InvoiceStatus, TradeInvoice } from "./types";

export interface FinanceInvoiceRow {
  id: string;
  invoiceNumber: string;
  counterpartyId: string;
  counterpartyName: string;
  sourceDocumentIds: string[];
  sourceDocuments: string[];
  dueDate: string;
  originalTotal: number;
  paidAmount: number;
  remainingBalance: number;
  status: InvoiceStatus;
  statusLabel: string;
}

function paidAmount(state: ErpState, invoiceId: string, direction: "payable" | "receivable"): number {
  return state.payments
    .filter((payment) => payment.invoiceId === invoiceId && payment.direction === direction && payment.status === "posted")
    .reduce((sum, payment) => sum + payment.amount, 0);
}

function balance(state: ErpState, invoice: TradeInvoice | undefined, direction: "payable" | "receivable"): number {
  return invoice ? Math.max(0, invoice.totalAmount - paidAmount(state, invoice.id, direction)) : 0;
}

export function selectPayableBalance(state: ErpState, invoiceId: string): number {
  return balance(state, state.supplierInvoices.find((invoice) => invoice.id === invoiceId), "payable");
}

export function selectReceivableBalance(state: ErpState, invoiceId: string): number {
  return balance(state, state.customerInvoices.find((invoice) => invoice.id === invoiceId), "receivable");
}

export function selectPayableRows(state: ErpState): FinanceInvoiceRow[] {
  return state.supplierInvoices.map((invoice) => {
    const paid = paidAmount(state, invoice.id, "payable");
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      counterpartyId: invoice.supplierId ?? "",
      counterpartyName: state.suppliers.find((supplier) => supplier.id === invoice.supplierId)?.name ?? invoice.supplierId ?? "Unknown supplier",
      sourceDocumentIds: [...invoice.sourceDocumentIds],
      sourceDocuments: invoice.sourceDocumentIds.map((id) => state.goodsReceipts.find((receipt) => receipt.id === id)?.receiptNumber ?? id),
      dueDate: invoice.dueDate,
      originalTotal: invoice.totalAmount,
      paidAmount: paid,
      remainingBalance: Math.max(0, invoice.totalAmount - paid),
      status: invoice.status,
      statusLabel: invoice.status.replaceAll("_", " "),
    };
  });
}

export function selectReceivableRows(state: ErpState): FinanceInvoiceRow[] {
  return state.customerInvoices.map((invoice) => {
    const paid = paidAmount(state, invoice.id, "receivable");
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      counterpartyId: invoice.customerId ?? "",
      counterpartyName: state.customers.find((customer) => customer.id === invoice.customerId)?.name ?? invoice.customerId ?? "Unknown customer",
      sourceDocumentIds: [...invoice.sourceDocumentIds],
      sourceDocuments: invoice.sourceDocumentIds.map((id) => state.deliveryOrders.find((delivery) => delivery.id === id)?.deliveryNumber ?? id),
      dueDate: invoice.dueDate,
      originalTotal: invoice.totalAmount,
      paidAmount: paid,
      remainingBalance: Math.max(0, invoice.totalAmount - paid),
      status: invoice.status,
      statusLabel: invoice.status.replaceAll("_", " "),
    };
  });
}
