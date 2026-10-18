import type { Result } from "../domain/result";
import type { ErpState } from "../../erp/types";
import type { SourceDependency } from "./adapter-types";
import { sha256Canonical } from "../domain/canonical-json";
import { erpSalesOrderKey, erpStockKey } from "./dependency-keys";

export interface InventoryPosition {
  readonly productId: string;
  readonly warehouseId: string;
  readonly physicalQuantity: number;
  readonly reservedQuantity: number;
  readonly availableQuantity: number;
  readonly dependencies: readonly SourceDependency[];
}

function canonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}
function uniqueIds(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}
function signedMovementQuantity(direction: string, quantity: number): number | null {
  if (!Number.isSafeInteger(quantity)) return null;
  if (direction === "in" || direction === "out") return quantity > 0 ? (direction === "in" ? quantity : -quantity) : null;
  if (direction === "adjustment") return quantity === 0 ? null : quantity;
  return null;
}

export function normalizeInventory(_state: ErpState): Result<readonly InventoryPosition[]> {
  const state = _state;
  const fail = (message: string): Result<readonly InventoryPosition[]> => ({ ok: false, error: { code: "INVALID_INVENTORY_STATE", message } });
  const productIds = state.products.map((row) => row.id);
  const warehouseIds = state.warehouses.map((row) => row.id);
  const movementIds = state.stockMovements.map((row) => row.id);
  const orderIds = state.salesOrders.map((row) => row.id);
  if (!productIds.every(canonicalText) || !warehouseIds.every(canonicalText) || !uniqueIds(productIds) || !uniqueIds(warehouseIds)
    || !uniqueIds(movementIds) || !uniqueIds(orderIds)) {
    return fail("Inventory identities must be canonical and unique.");
  }
  const productIdSet = new Set(productIds);
  const warehouseIdSet = new Set(warehouseIds);
  for (const movement of state.stockMovements) {
    if (!productIdSet.has(movement.productId) || !warehouseIdSet.has(movement.warehouseId)
      || signedMovementQuantity(movement.direction, movement.quantity) === null) {
      return fail("Stock movement evidence is invalid.");
    }
  }
  for (const order of state.salesOrders) {
    if (!warehouseIdSet.has(order.warehouseId) || !order.lines.every((line) => productIdSet.has(line.productId))) {
      return fail("Sales-order product or warehouse evidence is invalid.");
    }
    const lineProductIds = order.lines.map((line) => line.productId);
    if (!uniqueIds(lineProductIds) || order.lines.some((line) => !Number.isSafeInteger(line.quantity) || line.quantity <= 0
      || !Number.isSafeInteger(line.deliveredQuantity) || line.deliveredQuantity < 0 || line.deliveredQuantity > line.quantity)) {
      return fail("Sales-order reservation evidence is invalid.");
    }
  }
  const output: InventoryPosition[] = [];
  const products = [...state.products].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const warehouses = [...state.warehouses].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  for (const warehouse of warehouses) {
    for (const product of products) {
      const movements = state.stockMovements.filter((row) => row.productId === product.id && row.warehouseId === warehouse.id)
        .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
      const reservations = state.salesOrders.filter((row) => row.warehouseId === warehouse.id && (row.status === "confirmed" || row.status === "partially_delivered"))
        .flatMap((order) => order.lines.filter((line) => line.productId === product.id).map((line) => ({ order, line })))
        .sort((left, right) => left.order.id < right.order.id ? -1 : left.order.id > right.order.id ? 1 : 0);
      const physicalQuantity = movements.reduce((sum, movement) => sum + (signedMovementQuantity(movement.direction, movement.quantity) ?? 0), 0);
      const reservedQuantity = reservations.reduce((sum, item) => sum + item.line.quantity - item.line.deliveredQuantity, 0);
      const availableQuantity = physicalQuantity - reservedQuantity;
      if (!Number.isSafeInteger(physicalQuantity) || !Number.isSafeInteger(reservedQuantity) || !Number.isSafeInteger(availableQuantity)) {
        return fail("Inventory aggregation exceeded safe integer range.");
      }
      const dependencies: SourceDependency[] = [
        { key: erpStockKey(product.id, warehouse.id), contentHash: sha256Canonical({
          productId: product.id, warehouseId: warehouse.id, physicalQuantity, reservedQuantity, availableQuantity,
          movementIds: movements.map((row) => row.id), reservationOrderIds: reservations.map((row) => row.order.id),
        }) },
        ...reservations.map(({ order }) => ({ key: erpSalesOrderKey(order.id), contentHash: sha256Canonical({
          id: order.id, warehouseId: order.warehouseId, status: order.status,
          lines: [...order.lines].sort((left, right) => left.productId < right.productId ? -1 : left.productId > right.productId ? 1 : 0)
            .map((line) => ({ productId: line.productId, quantity: line.quantity, deliveredQuantity: line.deliveredQuantity })),
        }) })),
      ];
      output.push({ productId: product.id, warehouseId: warehouse.id, physicalQuantity, reservedQuantity, availableQuantity, dependencies });
    }
  }
  return { ok: true, value: output };
}
