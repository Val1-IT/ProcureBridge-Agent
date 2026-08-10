import type { StockMovement } from "../../erp/types";
import { enumText, expectedTenant, MapperError, nonZeroInteger, nullableStrictText, record, strictInstant, strictText } from "./mapper-utils";

const entity = "ERP stock movement";
const movementTypes = ["opening", "receipt", "delivery", "adjustment"] as const;
const movementDirections = ["in", "out", "adjustment"] as const;
const sourceTypes = ["seed", "goods_receipt", "delivery_order", "adjustment"] as const;
const actorRoles = ["admin", "procurement", "warehouse", "sales", "finance", "approver", "system"] as const;

export interface ErpStockMovementRow {
  tenant_id: string;
  id: string;
  type: NonNullable<StockMovement["type"]>;
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

function assertConvention(type: NonNullable<StockMovement["type"]>, sourceType: StockMovement["sourceType"], direction: StockMovement["direction"], quantity: number, actorRole: StockMovement["actorRole"]) {
  const valid = sourceType === "seed"
    ? type === "opening" && direction === "in" && quantity > 0 && actorRole === "system"
    : sourceType === "goods_receipt"
      ? type === "receipt" && direction === "in" && quantity > 0 && (actorRole === "warehouse" || actorRole === "admin")
      : sourceType === "delivery_order"
        ? type === "delivery" && direction === "out" && quantity > 0 && (actorRole === "warehouse" || actorRole === "admin")
        : type === "adjustment" && direction === "adjustment" && quantity !== 0 && (actorRole === "approver" || actorRole === "admin");
  if (!valid) throw new MapperError(entity, "source_type, type, direction, quantity, and actor_role are inconsistent");
}

export function toErpStockMovementRow(value: StockMovement, tenantId: string): ErpStockMovementRow {
  const row = {
    tenant_id: tenantId,
    id: value.id,
    type: value.type,
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
  fromErpStockMovementRow(row, tenantId);
  return row as ErpStockMovementRow;
}

export function fromErpStockMovementRow(input: unknown, expectedTenantId: string): StockMovement {
  const row = record(input, entity);
  expectedTenant(row, expectedTenantId, entity);
  const type = enumText(row, "type", movementTypes, entity);
  const quantity = nonZeroInteger(row, "quantity", entity);
  const direction = enumText(row, "direction", movementDirections, entity);
  const sourceType = enumText(row, "source_type", sourceTypes, entity);
  const actorRole = enumText(row, "actor_role", actorRoles, entity);
  assertConvention(type, sourceType, direction, quantity, actorRole);
  return {
    id: strictText(row, "id", entity),
    type,
    productId: strictText(row, "product_id", entity),
    warehouseId: strictText(row, "warehouse_id", entity),
    quantity,
    direction,
    sourceType,
    sourceId: strictText(row, "source_id", entity),
    actorRole,
    actorId: strictText(row, "actor_id", entity),
    reason: nullableStrictText(row, "reason", entity),
    createdAt: strictInstant(row, "created_at", entity),
    updatedAt: strictInstant(row, "updated_at", entity),
  };
}
