import type { StockMovement } from "../../erp/types";
import { enumText, MapperError, nullableText, numeric, record, text } from "./mapper-utils";

const movementTypes = ["opening", "receipt", "delivery", "adjustment"] as const;
const movementDirections = ["in", "out", "adjustment"] as const;
const sourceTypes = ["seed", "goods_receipt", "delivery_order", "adjustment"] as const;
const actorRoles = ["admin", "procurement", "warehouse", "sales", "finance", "approver", "system"] as const;

export interface ErpStockMovementRow {
  tenant_id: string;
  id: string;
  type: StockMovement["type"] | null;
  product_id: string;
  warehouse_id: string;
  quantity: number | string;
  direction: StockMovement["direction"];
  source_type: StockMovement["sourceType"];
  source_id: string;
  actor_role: StockMovement["actorRole"];
  actor_id: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export function toErpStockMovementRow(value: StockMovement, tenantId: string): ErpStockMovementRow {
  if (!tenantId.trim()) throw new MapperError("ERP stock movement", "tenant_id must be text");
  return {
    tenant_id: tenantId,
    id: value.id,
    type: value.type ?? null,
    product_id: value.productId,
    warehouse_id: value.warehouseId,
    quantity: value.quantity,
    direction: value.direction,
    source_type: value.sourceType,
    source_id: value.sourceId,
    actor_role: value.actorRole,
    actor_id: value.actorId,
    reason: value.reason,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

export function fromErpStockMovementRow(input: unknown): StockMovement {
  const row = record(input, "ERP stock movement");
  text(row, "tenant_id", "ERP stock movement");
  const type = row.type === null ? undefined : enumText(row, "type", movementTypes, "ERP stock movement");
  return {
    id: text(row, "id", "ERP stock movement"),
    ...(type ? { type } : {}),
    productId: text(row, "product_id", "ERP stock movement"),
    warehouseId: text(row, "warehouse_id", "ERP stock movement"),
    quantity: numeric(row, "quantity", "ERP stock movement"),
    direction: enumText(row, "direction", movementDirections, "ERP stock movement"),
    sourceType: enumText(row, "source_type", sourceTypes, "ERP stock movement"),
    sourceId: text(row, "source_id", "ERP stock movement"),
    actorRole: enumText(row, "actor_role", actorRoles, "ERP stock movement"),
    actorId: text(row, "actor_id", "ERP stock movement"),
    reason: nullableText(row, "reason", "ERP stock movement"),
    createdAt: text(row, "created_at", "ERP stock movement"),
    updatedAt: text(row, "updated_at", "ERP stock movement"),
  };
}
