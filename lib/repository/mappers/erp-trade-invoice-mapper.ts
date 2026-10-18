import type { QuantityLine, TradeInvoice } from "../../erp/types";
import {
  arrayValue, enumText, expectedTenant, MapperError, nullableStrictText, positiveDecimal, positiveInteger, record, strictDate, strictInstant, strictText,
} from "./mapper-utils";

const entity = "ERP trade invoice";
const sourceEntity = "ERP trade invoice source";
const lineEntity = "ERP trade invoice line";
const invoiceStatuses = ["unpaid", "partially_paid", "paid", "cancelled"] as const;
const numericPrecision = 18;
const quantityScale = 4;
const moneyScale = 2;
const quantityScaleFactor = BigInt(10) ** BigInt(quantityScale);

export interface ErpTradeInvoiceHeaderRow {
  tenant_id: string;
  id: string;
  invoice_number: string;
  purchase_order_id: string | null;
  sales_order_id: string | null;
  supplier_id: string | null;
  customer_id: string | null;
  status: TradeInvoice["status"];
  total_amount: number | string;
  due_date: string;
  created_at: string;
  updated_at: string;
}

export interface ErpTradeInvoiceSourceRow {
  tenant_id: string;
  trade_invoice_id: string;
  source_number: number | string;
  goods_receipt_id: string | null;
  delivery_order_id: string | null;
}

export interface ErpTradeInvoiceLineRow {
  tenant_id: string;
  trade_invoice_id: string;
  line_number: number | string;
  product_id: string;
  quantity: number | string;
  unit_price: number | string;
}

export interface ErpTradeInvoiceRows {
  header: ErpTradeInvoiceHeaderRow;
  sources: ErpTradeInvoiceSourceRow[];
  lines: ErpTradeInvoiceLineRow[];
}

function assertPartyParent(header: Record<string, unknown>) {
  const purchaseOrderId = nullableStrictText(header, "purchase_order_id", entity);
  const salesOrderId = nullableStrictText(header, "sales_order_id", entity);
  const supplierId = nullableStrictText(header, "supplier_id", entity);
  const customerId = nullableStrictText(header, "customer_id", entity);
  const supplierInvoice = purchaseOrderId !== null && supplierId !== null && salesOrderId === null && customerId === null;
  const customerInvoice = purchaseOrderId === null && supplierId === null && salesOrderId !== null && customerId !== null;
  if (!supplierInvoice && !customerInvoice) throw new MapperError(entity, "party and parent columns are inconsistent");
  return { purchaseOrderId, salesOrderId, supplierId, customerId, supplierInvoice };
}

function parseSource(input: unknown, expectedTenantId: string, invoiceId: string, supplierInvoice: boolean) {
  const row = record(input, sourceEntity);
  expectedTenant(row, expectedTenantId, sourceEntity);
  if (strictText(row, "trade_invoice_id", sourceEntity) !== invoiceId) throw new MapperError(sourceEntity, "trade_invoice_id does not match the header");
  const goodsReceiptId = nullableStrictText(row, "goods_receipt_id", sourceEntity);
  const deliveryOrderId = nullableStrictText(row, "delivery_order_id", sourceEntity);
  if (supplierInvoice ? goodsReceiptId === null || deliveryOrderId !== null : goodsReceiptId !== null || deliveryOrderId === null) throw new MapperError(sourceEntity, "source kind does not match the invoice parent");
  return { sourceNumber: positiveInteger(row, "source_number", sourceEntity), sourceDocumentId: goodsReceiptId ?? deliveryOrderId! };
}

function parseLine(input: unknown, expectedTenantId: string, invoiceId: string) {
  const row = record(input, lineEntity);
  expectedTenant(row, expectedTenantId, lineEntity);
  if (strictText(row, "trade_invoice_id", lineEntity) !== invoiceId) throw new MapperError(lineEntity, "trade_invoice_id does not match the header");
  const quantity = positiveDecimal(row, "quantity", lineEntity, quantityScale, numericPrecision);
  const unitPrice = positiveDecimal(row, "unit_price", lineEntity, moneyScale, numericPrecision);
  return {
    lineNumber: positiveInteger(row, "line_number", lineEntity),
    line: {
      productId: strictText(row, "product_id", lineEntity),
      quantity: quantity.value,
      unitPrice: unitPrice.value,
    } satisfies QuantityLine,
    quantityUnits: quantity.units,
    unitPriceUnits: unitPrice.units,
  };
}

export function toErpTradeInvoiceRows(value: TradeInvoice, tenantId: string): ErpTradeInvoiceRows {
  const supplierInvoice = value.purchaseOrderId !== null && value.supplierId !== null && value.salesOrderId === null && value.customerId === null;
  const rows: ErpTradeInvoiceRows = {
    header: {
      tenant_id: tenantId,
      id: value.id,
      invoice_number: value.invoiceNumber,
      purchase_order_id: value.purchaseOrderId,
      sales_order_id: value.salesOrderId,
      supplier_id: value.supplierId,
      customer_id: value.customerId,
      status: value.status,
      total_amount: value.totalAmount,
      due_date: value.dueDate,
      created_at: value.createdAt,
      updated_at: value.updatedAt,
    },
    sources: value.sourceDocumentIds.map((sourceDocumentId, index) => ({
      tenant_id: tenantId,
      trade_invoice_id: value.id,
      source_number: index + 1,
      goods_receipt_id: supplierInvoice ? sourceDocumentId : null,
      delivery_order_id: supplierInvoice ? null : sourceDocumentId,
    })),
    lines: value.lines.map((line, index) => ({
      tenant_id: tenantId,
      trade_invoice_id: value.id,
      line_number: index + 1,
      product_id: line.productId,
      quantity: line.quantity,
      unit_price: line.unitPrice,
    })),
  };
  fromErpTradeInvoiceRows(rows, tenantId);
  return rows;
}

export function fromErpTradeInvoiceRows(input: unknown, expectedTenantId: string): TradeInvoice {
  const aggregate = record(input, entity);
  const header = record(aggregate.header, entity);
  expectedTenant(header, expectedTenantId, entity);
  const id = strictText(header, "id", entity);
  const parties = assertPartyParent(header);
  const sources = arrayValue(aggregate, "sources", entity).map((source) => parseSource(source, expectedTenantId, id, parties.supplierInvoice));
  const lines = arrayValue(aggregate, "lines", entity).map((line) => parseLine(line, expectedTenantId, id));
  if (sources.length === 0) throw new MapperError(entity, "sources must not be empty");
  if (lines.length === 0) throw new MapperError(entity, "lines must not be empty");
  if (new Set(sources.map(({ sourceNumber }) => sourceNumber)).size !== sources.length || new Set(sources.map(({ sourceDocumentId }) => sourceDocumentId)).size !== sources.length) throw new MapperError(entity, "sources must be unique");
  if (new Set(lines.map(({ lineNumber }) => lineNumber)).size !== lines.length || new Set(lines.map(({ line }) => line.productId)).size !== lines.length) throw new MapperError(entity, "lines must be unique");
  sources.sort((left, right) => left.sourceNumber - right.sourceNumber);
  lines.sort((left, right) => left.lineNumber - right.lineNumber);
  const totalAmount = positiveDecimal(header, "total_amount", entity, moneyScale, numericPrecision);
  const calculatedTotalUnits = lines.reduce((sum, line) => sum + line.quantityUnits * line.unitPriceUnits, BigInt(0));
  if (calculatedTotalUnits !== totalAmount.units * quantityScaleFactor) throw new MapperError(entity, "total_amount does not equal the line total");

  return {
    id,
    invoiceNumber: strictText(header, "invoice_number", entity),
    purchaseOrderId: parties.purchaseOrderId,
    salesOrderId: parties.salesOrderId,
    supplierId: parties.supplierId,
    customerId: parties.customerId,
    sourceDocumentIds: sources.map(({ sourceDocumentId }) => sourceDocumentId),
    status: enumText(header, "status", invoiceStatuses, entity),
    lines: lines.map(({ line }) => line),
    totalAmount: totalAmount.value,
    dueDate: strictDate(header, "due_date", entity),
    createdAt: strictInstant(header, "created_at", entity),
    updatedAt: strictInstant(header, "updated_at", entity),
  };
}
