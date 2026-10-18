import { describe, expect, it } from "vitest";
import { normalizeInventory } from "../../../lib/dealtwin/erp/normalize-inventory";
import { createErpSeedState } from "../../../lib/erp/seed";

describe("warehouse-scoped inventory normalization", () => {
  it("separates physical, reserved, and available stock without inventing cash", () => {
    const state = createErpSeedState();
    state.warehouses.push({ ...state.warehouses[0], id: "warehouse-b", code: "WH-B", name: "Warehouse B" });
    state.stockMovements = [
      { ...state.stockMovements[0], id: "stock-a", productId: "product-router", warehouseId: "warehouse-jakarta", quantity: 10 },
      { ...state.stockMovements[0], id: "stock-b", productId: "product-router", warehouseId: "warehouse-b", quantity: 7 },
    ];
    state.salesOrders = [
      { ...state.salesOrders[0], id: "so-a", warehouseId: "warehouse-jakarta", status: "confirmed", lines: [{ productId: "product-router", quantity: 6, deliveredQuantity: 1, unitPrice: 1 }] },
      { ...state.salesOrders[0], id: "so-b", warehouseId: "warehouse-b", status: "partially_delivered", lines: [{ productId: "product-router", quantity: 5, deliveredQuantity: 2, unitPrice: 1 }] },
      { ...state.salesOrders[0], id: "so-cancelled", warehouseId: "warehouse-jakarta", status: "cancelled", lines: [{ productId: "product-router", quantity: 100, deliveredQuantity: 0, unitPrice: 1 }] },
    ];

    const result = normalizeInventory(state);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.value.find((row) => row.productId === "product-router" && row.warehouseId === "warehouse-jakarta")).toMatchObject({
      physicalQuantity: 10, reservedQuantity: 5, availableQuantity: 5,
    });
    expect(result.value.find((row) => row.productId === "product-router" && row.warehouseId === "warehouse-b")).toMatchObject({
      physicalQuantity: 7, reservedQuantity: 3, availableQuantity: 4,
    });
    expect(result.value.find((row) => row.productId === "product-router" && row.warehouseId === "warehouse-jakarta")?.dependencies.map((item) => item.key)).toContain("erp.stock:product-router:warehouse-jakarta");
    expect(result.value.find((row) => row.productId === "product-router" && row.warehouseId === "warehouse-b")?.dependencies.map((item) => item.key)).toContain("erp.stock:product-router:warehouse-b");
    expect(JSON.stringify(result.value)).not.toContain("purchasePrice");
  });

  it("fails closed for unsafe stock or reservation quantities", () => {
    const state = createErpSeedState();
    state.stockMovements[0].quantity = Number.MAX_SAFE_INTEGER + 1;
    expect(normalizeInventory(state)).toMatchObject({ ok: false, error: { code: "INVALID_INVENTORY_STATE" } });
  });

  it("rejects duplicate product or warehouse identities", () => {
    const duplicateProduct = createErpSeedState();
    duplicateProduct.products.push({ ...duplicateProduct.products[0] });
    expect(normalizeInventory(duplicateProduct)).toMatchObject({ ok: false, error: { code: "INVALID_INVENTORY_STATE" } });
    const duplicateWarehouse = createErpSeedState();
    duplicateWarehouse.warehouses.push({ ...duplicateWarehouse.warehouses[0] });
    expect(normalizeInventory(duplicateWarehouse)).toMatchObject({ ok: false, error: { code: "INVALID_INVENTORY_STATE" } });
  });

  it("rejects unknown movement directions and non-positive in/out quantities", () => {
    const sideways = createErpSeedState();
    sideways.stockMovements[0].direction = "transfer" as "in";
    expect(normalizeInventory(sideways)).toMatchObject({ ok: false, error: { code: "INVALID_INVENTORY_STATE" } });
    const negativeIn = createErpSeedState();
    negativeIn.stockMovements[0].direction = "in";
    negativeIn.stockMovements[0].quantity = -3;
    expect(normalizeInventory(negativeIn)).toMatchObject({ ok: false, error: { code: "INVALID_INVENTORY_STATE" } });
  });

  it("preserves signed non-zero adjustment quantities and rejects zero adjustments", () => {
    const state = createErpSeedState();
    state.stockMovements = [
      { ...state.stockMovements[0], id: "stock-open", direction: "in", quantity: 10 },
      { ...state.stockMovements[0], id: "stock-adjust", type: "adjustment", direction: "adjustment", quantity: -4, sourceType: "adjustment", sourceId: "adj-a" },
    ];
    state.salesOrders = [];
    const result = normalizeInventory(state);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.value.find((row) => row.productId === "product-router" && row.warehouseId === "warehouse-jakarta"))
      .toMatchObject({ physicalQuantity: 6, reservedQuantity: 0, availableQuantity: 6 });
    const zero = createErpSeedState();
    zero.stockMovements[0].direction = "adjustment";
    zero.stockMovements[0].quantity = 0;
    expect(normalizeInventory(zero)).toMatchObject({ ok: false, error: { code: "INVALID_INVENTORY_STATE" } });
  });

  it("fails closed for a reserved Sales Order line that points at an unknown product", () => {
    const state = createErpSeedState();
    state.salesOrders = [{
      ...state.salesOrders[0],
      status: "confirmed",
      lines: [{ productId: "product-does-not-exist", quantity: 2, deliveredQuantity: 0, unitPrice: 1 }],
    }];
    expect(normalizeInventory(state)).toMatchObject({ ok: false, error: { code: "INVALID_INVENTORY_STATE" } });
  });

  it("rejects duplicate product lines on one Sales Order instead of summing them ambiguously", () => {
    const state = createErpSeedState();
    state.salesOrders = [{
      ...state.salesOrders[0],
      status: "confirmed",
      lines: [
        { productId: "product-router", quantity: 2, deliveredQuantity: 0, unitPrice: 1 },
        { productId: "product-router", quantity: 3, deliveredQuantity: 0, unitPrice: 1 },
      ],
    }];
    expect(normalizeInventory(state)).toMatchObject({ ok: false, error: { code: "INVALID_INVENTORY_STATE" } });
  });

  it("fails closed when reserved or physical aggregation overflows a safe integer", () => {
    const state = createErpSeedState();
    state.stockMovements = [
      { ...state.stockMovements[0], id: "stock-a", quantity: Number.MAX_SAFE_INTEGER },
      { ...state.stockMovements[0], id: "stock-b", quantity: Number.MAX_SAFE_INTEGER },
    ];
    expect(normalizeInventory(state)).toMatchObject({ ok: false, error: { code: "INVALID_INVENTORY_STATE" } });
  });
});
