import type { PurchaseOrder, QuantityLine } from "../../erp/types";
import { arrayValue, enumText, MapperError, nullableText, numeric, record, text } from "./mapper-utils";

const purchaseOrderStatuses = ["draft", "pending_approval", "sent", "confirmed", "partially_received", "fully_received", "completed", "rejected", "cancelled"] as const;

export interface ErpQuantityLineRow {
  product_id: string;
  quantity: number | string;
  unit_price: number | string;
}

export interface ErpPurchaseOrderRow {
  tenant_id: string;
  id: string;
  order_number: string;
  supplier_id: string;
  purchase_request_id: string | null;
  supplier_quotation_id: string | null;
  warehouse_id: string;
  status: PurchaseOrder["status"];
  lines: ErpQuantityLineRow[];
  confirmation_due_at: string | null;
  promised_delivery_date: string | null;
  created_at: string;
  updated_at: string;
}

function toLine(value: QuantityLine): ErpQuantityLineRow {
  return { product_id: value.productId, quantity: value.quantity, unit_price: value.unitPrice };
}

function fromLine(input: unknown): QuantityLine {
  const row = record(input, "ERP purchase order line");
  return {
    productId: text(row, "product_id", "ERP purchase order line"),
    quantity: numeric(row, "quantity", "ERP purchase order line"),
    unitPrice: numeric(row, "unit_price", "ERP purchase order line"),
  };
}

export function toErpPurchaseOrderRow(value: PurchaseOrder, tenantId: string): ErpPurchaseOrderRow {
  if (!tenantId.trim()) throw new MapperError("ERP purchase order", "tenant_id must be text");
  return {
    tenant_id: tenantId,
    id: value.id,
    order_number: value.orderNumber,
    supplier_id: value.supplierId,
    purchase_request_id: value.purchaseRequestId,
    supplier_quotation_id: value.supplierQuotationId,
    warehouse_id: value.warehouseId,
    status: value.status,
    lines: value.lines.map(toLine),
    confirmation_due_at: value.confirmationDueAt,
    promised_delivery_date: value.promisedDeliveryDate,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

export function fromErpPurchaseOrderRow(input: unknown): PurchaseOrder {
  const row = record(input, "ERP purchase order");
  text(row, "tenant_id", "ERP purchase order");
  return {
    id: text(row, "id", "ERP purchase order"),
    orderNumber: text(row, "order_number", "ERP purchase order"),
    supplierId: text(row, "supplier_id", "ERP purchase order"),
    purchaseRequestId: nullableText(row, "purchase_request_id", "ERP purchase order"),
    supplierQuotationId: nullableText(row, "supplier_quotation_id", "ERP purchase order"),
    warehouseId: text(row, "warehouse_id", "ERP purchase order"),
    status: enumText(row, "status", purchaseOrderStatuses, "ERP purchase order"),
    lines: arrayValue(row, "lines", "ERP purchase order").map(fromLine),
    confirmationDueAt: nullableText(row, "confirmation_due_at", "ERP purchase order"),
    promisedDeliveryDate: nullableText(row, "promised_delivery_date", "ERP purchase order"),
    createdAt: text(row, "created_at", "ERP purchase order"),
    updatedAt: text(row, "updated_at", "ERP purchase order"),
  };
}
