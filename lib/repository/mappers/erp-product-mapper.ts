import type { Product } from "../../erp/types";
import { bool, MapperError, numeric, record, text } from "./mapper-utils";

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

function tenantId(value: string, entity: string) {
  if (!value.trim()) throw new MapperError(entity, "tenant_id must be text");
  return value;
}

export function toErpProductRow(value: Product, tenant: string): ErpProductRow {
  return {
    tenant_id: tenantId(tenant, "ERP product"),
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
}

export function fromErpProductRow(input: unknown): Product {
  const row = record(input, "ERP product");
  text(row, "tenant_id", "ERP product");
  return {
    id: text(row, "id", "ERP product"),
    sku: text(row, "sku", "ERP product"),
    name: text(row, "name", "ERP product"),
    unit: text(row, "unit", "ERP product"),
    salePrice: numeric(row, "sale_price", "ERP product"),
    purchasePrice: numeric(row, "purchase_price", "ERP product"),
    reorderPoint: numeric(row, "reorder_point", "ERP product"),
    active: bool(row, "active", "ERP product"),
    createdAt: text(row, "created_at", "ERP product"),
    updatedAt: text(row, "updated_at", "ERP product"),
  };
}
