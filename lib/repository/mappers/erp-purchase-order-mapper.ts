import type { PurchaseOrder, QuantityLine } from "../../erp/types";
import {
  arrayValue, enumText, expectedTenant, MapperError, nullableStrictDate, nullableStrictInstant, nullableStrictText,
  positiveInteger, positiveNumeric, record, strictInstant, strictText,
} from "./mapper-utils";

const entity = "ERP purchase order";
const lineEntity = "ERP purchase order line";
const purchaseOrderStatuses = ["draft", "pending_approval", "sent", "confirmed", "partially_received", "fully_received", "completed", "rejected", "cancelled"] as const;

export interface ErpPurchaseOrderHeaderRow {
  tenant_id: string;
  id: string;
  order_number: string;
  supplier_id: string;
  purchase_request_id: string | null;
  supplier_quotation_id: string | null;
  warehouse_id: string;
  status: PurchaseOrder["status"];
  confirmation_due_at: string | null;
  promised_delivery_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ErpPurchaseOrderLineRow {
  tenant_id: string;
  purchase_order_id: string;
  line_number: number | string;
  product_id: string;
  quantity: number | string;
  unit_price: number | string;
}

export interface ErpPurchaseOrderRows {
  header: ErpPurchaseOrderHeaderRow;
  lines: ErpPurchaseOrderLineRow[];
}

function parseLine(input: unknown, expectedTenantId: string, purchaseOrderId: string) {
  const row = record(input, lineEntity);
  expectedTenant(row, expectedTenantId, lineEntity);
  if (strictText(row, "purchase_order_id", lineEntity) !== purchaseOrderId) throw new MapperError(lineEntity, "purchase_order_id does not match the header");
  return {
    lineNumber: positiveInteger(row, "line_number", lineEntity),
    line: {
      productId: strictText(row, "product_id", lineEntity),
      quantity: positiveNumeric(row, "quantity", lineEntity, 4),
      unitPrice: positiveNumeric(row, "unit_price", lineEntity, 2),
    } satisfies QuantityLine,
  };
}

export function toErpPurchaseOrderRows(value: PurchaseOrder, tenantId: string): ErpPurchaseOrderRows {
  const rows: ErpPurchaseOrderRows = {
    header: {
      tenant_id: tenantId,
      id: value.id,
      order_number: value.orderNumber,
      supplier_id: value.supplierId,
      purchase_request_id: value.purchaseRequestId,
      supplier_quotation_id: value.supplierQuotationId,
      warehouse_id: value.warehouseId,
      status: value.status,
      confirmation_due_at: value.confirmationDueAt,
      promised_delivery_date: value.promisedDeliveryDate,
      created_at: value.createdAt,
      updated_at: value.updatedAt,
    },
    lines: value.lines.map((line, index) => ({
      tenant_id: tenantId,
      purchase_order_id: value.id,
      line_number: index + 1,
      product_id: line.productId,
      quantity: line.quantity,
      unit_price: line.unitPrice,
    })),
  };
  fromErpPurchaseOrderRows(rows, tenantId);
  return rows;
}

export function fromErpPurchaseOrderRows(input: unknown, expectedTenantId: string): PurchaseOrder {
  const aggregate = record(input, entity);
  const header = record(aggregate.header, entity);
  expectedTenant(header, expectedTenantId, entity);
  const id = strictText(header, "id", entity);
  const parsedLines = arrayValue(aggregate, "lines", entity).map((line) => parseLine(line, expectedTenantId, id));
  if (parsedLines.length === 0) throw new MapperError(entity, "lines must not be empty");
  if (new Set(parsedLines.map(({ lineNumber }) => lineNumber)).size !== parsedLines.length) throw new MapperError(entity, "line_number must be unique");
  if (new Set(parsedLines.map(({ line }) => line.productId)).size !== parsedLines.length) throw new MapperError(entity, "line products must be unique");
  parsedLines.sort((left, right) => left.lineNumber - right.lineNumber);

  return {
    id,
    orderNumber: strictText(header, "order_number", entity),
    supplierId: strictText(header, "supplier_id", entity),
    purchaseRequestId: nullableStrictText(header, "purchase_request_id", entity),
    supplierQuotationId: nullableStrictText(header, "supplier_quotation_id", entity),
    warehouseId: strictText(header, "warehouse_id", entity),
    status: enumText(header, "status", purchaseOrderStatuses, entity),
    lines: parsedLines.map(({ line }) => line),
    confirmationDueAt: nullableStrictInstant(header, "confirmation_due_at", entity),
    promisedDeliveryDate: nullableStrictDate(header, "promised_delivery_date", entity),
    createdAt: strictInstant(header, "created_at", entity),
    updatedAt: strictInstant(header, "updated_at", entity),
  };
}
