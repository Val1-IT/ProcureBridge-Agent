import type { Product } from "../../erp/types";
import { bool, expectedTenant, nonNegativeNumeric, positiveNumeric, record, strictInstant, strictText } from "./mapper-utils";

export interface ErpProductRow {
  tenant_id: string;
  id: string;
  sku: string;
  name: string;
  unit: string;
  sale_price: number | string;
  purchase_price: number | string;
  reorder_point: number | string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function toErpProductRow(value: Product, tenantId: string): ErpProductRow {
  const row: ErpProductRow = {
    tenant_id: tenantId,
    id: value.id,
    sku: value.sku,
    name: value.name,
    unit: value.unit,
    sale_price: value.salePrice,
    purchase_price: value.purchasePrice,
    reorder_point: value.reorderPoint,
    active: value.active,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
  fromErpProductRow(row, tenantId);
  return row;
}

export function fromErpProductRow(input: unknown, expectedTenantId: string): Product {
  const row = record(input, "ERP product");
  expectedTenant(row, expectedTenantId, "ERP product");
  return {
    id: strictText(row, "id", "ERP product"),
    sku: strictText(row, "sku", "ERP product"),
    name: strictText(row, "name", "ERP product"),
    unit: strictText(row, "unit", "ERP product"),
    salePrice: positiveNumeric(row, "sale_price", "ERP product", 2),
    purchasePrice: positiveNumeric(row, "purchase_price", "ERP product", 2),
    reorderPoint: nonNegativeNumeric(row, "reorder_point", "ERP product", 4),
    active: bool(row, "active", "ERP product"),
    createdAt: strictInstant(row, "created_at", "ERP product"),
    updatedAt: strictInstant(row, "updated_at", "ERP product"),
  };
}
