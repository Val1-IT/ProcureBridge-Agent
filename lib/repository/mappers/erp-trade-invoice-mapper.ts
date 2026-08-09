import type { QuantityLine, TradeInvoice } from "../../erp/types";
import { arrayValue, enumText, MapperError, nullableText, numeric, record, text } from "./mapper-utils";

const invoiceStatuses = ["unpaid", "partially_paid", "paid", "cancelled"] as const;

export interface ErpTradeInvoiceLineRow {
  product_id: string;
  quantity: number | string;
  unit_price: number | string;
}

export interface ErpTradeInvoiceRow {
  tenant_id: string;
  id: string;
  invoice_number: string;
  purchase_order_id: string | null;
  sales_order_id: string | null;
  supplier_id: string | null;
  customer_id: string | null;
  source_document_ids: string[];
  status: TradeInvoice["status"];
  lines: ErpTradeInvoiceLineRow[];
  total_amount: number | string;
  due_date: string;
  created_at: string;
  updated_at: string;
}

function toLine(value: QuantityLine): ErpTradeInvoiceLineRow {
  return { product_id: value.productId, quantity: value.quantity, unit_price: value.unitPrice };
}

function fromLine(input: unknown): QuantityLine {
  const row = record(input, "ERP trade invoice line");
  return {
    productId: text(row, "product_id", "ERP trade invoice line"),
    quantity: numeric(row, "quantity", "ERP trade invoice line"),
    unitPrice: numeric(row, "unit_price", "ERP trade invoice line"),
  };
}

export function toErpTradeInvoiceRow(value: TradeInvoice, tenantId: string): ErpTradeInvoiceRow {
  if (!tenantId.trim()) throw new MapperError("ERP trade invoice", "tenant_id must be text");
  return {
    tenant_id: tenantId,
    id: value.id,
    invoice_number: value.invoiceNumber,
    purchase_order_id: value.purchaseOrderId,
    sales_order_id: value.salesOrderId,
    supplier_id: value.supplierId,
    customer_id: value.customerId,
    source_document_ids: [...value.sourceDocumentIds],
    status: value.status,
    lines: value.lines.map(toLine),
    total_amount: value.totalAmount,
    due_date: value.dueDate,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

export function fromErpTradeInvoiceRow(input: unknown): TradeInvoice {
  const row = record(input, "ERP trade invoice");
  text(row, "tenant_id", "ERP trade invoice");
  const sourceDocumentIds = arrayValue(row, "source_document_ids", "ERP trade invoice").map((value) => {
    if (typeof value !== "string" || !value.trim()) throw new MapperError("ERP trade invoice", "source_document_ids must contain text");
    return value;
  });
  return {
    id: text(row, "id", "ERP trade invoice"),
    invoiceNumber: text(row, "invoice_number", "ERP trade invoice"),
    purchaseOrderId: nullableText(row, "purchase_order_id", "ERP trade invoice"),
    salesOrderId: nullableText(row, "sales_order_id", "ERP trade invoice"),
    supplierId: nullableText(row, "supplier_id", "ERP trade invoice"),
    customerId: nullableText(row, "customer_id", "ERP trade invoice"),
    sourceDocumentIds,
    status: enumText(row, "status", invoiceStatuses, "ERP trade invoice"),
    lines: arrayValue(row, "lines", "ERP trade invoice").map(fromLine),
    totalAmount: numeric(row, "total_amount", "ERP trade invoice"),
    dueDate: text(row, "due_date", "ERP trade invoice"),
    createdAt: text(row, "created_at", "ERP trade invoice"),
    updatedAt: text(row, "updated_at", "ERP trade invoice"),
  };
}
