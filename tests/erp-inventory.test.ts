import { describe, expect, it } from "vitest";
import {
  approveGoodsReceipt,
  approveStockAdjustment,
  createGoodsReceipt,
  proposeStockAdjustment,
} from "../lib/erp/commands/inventory";
import { createErpSeedState } from "../lib/erp/seed";
import {
  selectPhysicalStock,
  selectStockCard,
  selectStockOverview,
} from "../lib/erp/selectors";
import type { ErpState, GoodsReceipt } from "../lib/erp/types";

const fixedNow = "2026-08-09T10:00:00.000Z";

function confirmedState(): ErpState {
  const state = createErpSeedState();
  state.purchaseOrders[0] = { ...state.purchaseOrders[0], status: "confirmed" };
  return state;
}

function draftReceipt(state: ErpState, overrides: Partial<GoodsReceipt> = {}): GoodsReceipt {
  return {
    id: "goods-receipt-gr-2026-0001",
    receiptNumber: "GR-2026-0001",
    purchaseOrderId: state.purchaseOrders[0].id,
    warehouseId: "warehouse-jakarta",
    status: "draft",
    lines: [{ productId: "product-router", quantity: 10, unitPrice: 1_050_000 }],
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides,
  };
}

describe("inventory receipt commands", () => {
  it("creates a validated draft without changing physical stock", () => {
    const state = confirmedState();
    const beforeStock = selectPhysicalStock(state, "product-router");

    const result = createGoodsReceipt(state, "warehouse", {
      purchaseOrderId: state.purchaseOrders[0].id,
      lines: [{ productId: "product-router", quantity: 10 }],
    }, fixedNow);

    expect(result).toMatchObject({ ok: true, value: { status: "draft", receiptNumber: "GR-2026-0001" } });
    expect(result.state.revision).toBe(state.revision + 1);
    expect(selectPhysicalStock(result.state, "product-router")).toBe(beforeStock);
    expect(result.state.stockMovements).toHaveLength(state.stockMovements.length);
  });

  it("approves a partial receipt atomically with signed movements and one revision", () => {
    const state = confirmedState();
    const receipt = draftReceipt(state);
    state.goodsReceipts = [receipt];

    const result = approveGoodsReceipt(state, "warehouse", receipt.id, fixedNow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("approved");
    expect(result.state.purchaseOrders[0].status).toBe("partially_received");
    expect(selectPhysicalStock(result.state, "product-router")).toBe(40);
    expect(result.state.stockMovements.at(-1)).toMatchObject({
      direction: "in",
      quantity: 10,
      sourceType: "goods_receipt",
      sourceId: receipt.id,
      actorRole: "warehouse",
    });
    expect(result.state.auditLogs.at(-1)?.action).toBe("goods_receipt.approved");
    expect(result.state.revision).toBe(state.revision + 1);
  });

  it("marks the purchase order fully received when all outstanding quantities arrive", () => {
    const state = confirmedState();
    const receipt = draftReceipt(state, { lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_050_000 }] });
    state.goodsReceipts = [receipt];

    const result = approveGoodsReceipt(state, "warehouse", receipt.id, fixedNow);

    expect(result).toMatchObject({ ok: true, value: { status: "approved" } });
    expect(result.state.purchaseOrders[0].status).toBe("fully_received");
  });

  it.each([
    ["unconfirmed PO", (state: ErpState, receipt: GoodsReceipt) => ({ ...state, goodsReceipts: [receipt], purchaseOrders: state.purchaseOrders.map((order) => ({ ...order, status: "sent" as const })) }), "INVALID_STATE"],
    ["wrong product", (state: ErpState, receipt: GoodsReceipt) => ({ ...state, goodsReceipts: [{ ...receipt, lines: [{ productId: "product-paper", quantity: 1, unitPrice: 11_000 }] }] }), "INVALID_INPUT"],
    ["zero quantity", (state: ErpState, receipt: GoodsReceipt) => ({ ...state, goodsReceipts: [{ ...receipt, lines: [{ ...receipt.lines[0], quantity: 0 }] }] }), "INVALID_INPUT"],
    ["quantity over outstanding", (state: ErpState, receipt: GoodsReceipt) => ({ ...state, goodsReceipts: [{ ...receipt, lines: [{ ...receipt.lines[0], quantity: 41 }] }] }), "INVALID_INPUT"],
  ])("rejects %s without partial mutation", (_label, mutate, code) => {
    const base = confirmedState();
    const receipt = draftReceipt(base);
    base.goodsReceipts = [receipt];
    const state = mutate(base, receipt);

    const result = approveGoodsReceipt(state, "warehouse", receipt.id, fixedNow);

    expect(result).toMatchObject({ ok: false, state, error: { code } });
    expect(result.state).toBe(state);
    expect(result.state.auditLogs).toHaveLength(state.auditLogs.length);
    expect(result.state.stockMovements).toHaveLength(state.stockMovements.length);
  });

  it("rejects duplicate receipt products and a missing active warehouse fail closed", () => {
    const duplicateState = confirmedState();
    const duplicate = draftReceipt(duplicateState, { lines: [
      { productId: "product-router", quantity: 5, unitPrice: 1_050_000 },
      { productId: "product-router", quantity: 5, unitPrice: 1_050_000 },
    ] });
    duplicateState.goodsReceipts = [duplicate];
    const noWarehouse = { ...duplicateState, warehouses: duplicateState.warehouses.map((warehouse) => ({ ...warehouse, active: false })) };

    expect(approveGoodsReceipt(duplicateState, "warehouse", duplicate.id, fixedNow)).toMatchObject({ ok: false, state: duplicateState, error: { code: "INVALID_INPUT" } });
    expect(approveGoodsReceipt(noWarehouse, "warehouse", duplicate.id, fixedNow)).toMatchObject({ ok: false, state: noWarehouse, error: { code: "INVALID_STATE" } });
  });

  it("rejects unauthorized and invalid-time receipt actions without mutation", () => {
    const state = confirmedState();
    state.goodsReceipts = [draftReceipt(state)];

    expect(createGoodsReceipt(state, "sales", { purchaseOrderId: state.purchaseOrders[0].id, lines: [{ productId: "product-router", quantity: 1 }] }, fixedNow)).toMatchObject({ ok: false, state, error: { code: "FORBIDDEN" } });
    expect(approveGoodsReceipt(state, "sales", state.goodsReceipts[0].id, fixedNow)).toMatchObject({ ok: false, state, error: { code: "FORBIDDEN" } });
    expect(approveGoodsReceipt(state, "warehouse", state.goodsReceipts[0].id, "invalid")).toMatchObject({ ok: false, state, error: { code: "INVALID_INPUT" } });
  });

  it("allows only Warehouse or Admin to create and approve receipts", () => {
    const state = confirmedState();
    state.goodsReceipts = [draftReceipt(state)];

    expect(createGoodsReceipt(state, "approver", { purchaseOrderId: state.purchaseOrders[0].id, lines: [{ productId: "product-router", quantity: 1 }] }, fixedNow)).toMatchObject({ ok: false, state, error: { code: "FORBIDDEN" } });
    expect(approveGoodsReceipt(state, "approver", state.goodsReceipts[0].id, fixedNow)).toMatchObject({ ok: false, state, error: { code: "FORBIDDEN" } });
    expect(createGoodsReceipt(state, "admin", { purchaseOrderId: state.purchaseOrders[0].id, lines: [{ productId: "product-router", quantity: 1 }] }, fixedNow)).toMatchObject({ ok: true, value: { status: "draft" } });
    expect(approveGoodsReceipt(state, "admin", state.goodsReceipts[0].id, fixedNow)).toMatchObject({ ok: true, value: { status: "approved" } });
  });
});

describe("controlled signed stock adjustments", () => {
  it("proposes a signed adjustment without changing physical stock", () => {
    const state = createErpSeedState();

    const result = proposeStockAdjustment(state, "warehouse", {
      productId: "product-router",
      quantityDelta: -4,
      reason: "Damaged units found during cycle count",
    }, fixedNow);

    expect(result).toMatchObject({ ok: true, value: { status: "pending", quantityDelta: -4, proposedByRole: "warehouse", approvedByRole: null } });
    expect(selectPhysicalStock(result.state, "product-router")).toBe(30);
    expect(result.state.stockMovements).toHaveLength(state.stockMovements.length);
  });

  it("approves a signed adjustment with explicit reason and separate approver", () => {
    const state = createErpSeedState();
    const proposed = proposeStockAdjustment(state, "warehouse", { productId: "product-router", quantityDelta: -4, reason: "Damaged units found during cycle count" }, fixedNow);
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const approved = approveStockAdjustment(proposed.state, "approver", proposed.value.id, "2026-08-09T11:00:00.000Z");

    expect(approved).toMatchObject({ ok: true, value: { status: "approved", approvedByRole: "approver", quantityDelta: -4 } });
    expect(selectPhysicalStock(approved.state, "product-router")).toBe(26);
    expect(approved.state.stockMovements.at(-1)).toMatchObject({ direction: "adjustment", quantity: -4, reason: "Damaged units found during cycle count", actorRole: "approver" });
    expect(approved.state.auditLogs.at(-1)?.detail).toMatchObject({ quantityDelta: -4, approvedByRole: "approver" });
  });

  it("blocks self-approval, wrong permissions, zero deltas, and negative resulting stock atomically", () => {
    const state = createErpSeedState();
    const zero = proposeStockAdjustment(state, "warehouse", { productId: "product-router", quantityDelta: 0, reason: "Count" }, fixedNow);
    const proposed = proposeStockAdjustment(state, "warehouse", { productId: "product-router", quantityDelta: -31, reason: "Cycle count variance" }, fixedNow);
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    expect(zero).toMatchObject({ ok: false, state, error: { code: "INVALID_INPUT" } });
    expect(approveStockAdjustment(proposed.state, "warehouse", proposed.value.id, fixedNow)).toMatchObject({ ok: false, state: proposed.state, error: { code: "FORBIDDEN" } });
    expect(approveStockAdjustment(proposed.state, "sales", proposed.value.id, fixedNow)).toMatchObject({ ok: false, state: proposed.state, error: { code: "FORBIDDEN" } });
    const negative = approveStockAdjustment(proposed.state, "approver", proposed.value.id, fixedNow);
    expect(negative).toMatchObject({ ok: false, state: proposed.state, error: { code: "INSUFFICIENT_STOCK" } });
    expect(negative.state).toBe(proposed.state);
  });
});

describe("inventory selectors", () => {
  it("derives overview quantities and a running stock card from source records", () => {
    const state = createErpSeedState();
    const receipt = draftReceipt(state, { status: "approved" });
    state.purchaseOrders[0] = { ...state.purchaseOrders[0], status: "partially_received" };
    state.goodsReceipts = [receipt];
    state.stockMovements.push({ id: "movement-receipt", productId: "product-router", warehouseId: "warehouse-jakarta", quantity: 10, direction: "in", sourceType: "goods_receipt", sourceId: receipt.id, actorRole: "warehouse", actorId: "role:warehouse", reason: null, createdAt: fixedNow, updatedAt: fixedNow });

    expect(selectStockOverview(state).find((row) => row.product.id === "product-router")).toMatchObject({ physical: 40, reserved: 12, available: 28, incoming: 30 });
    expect(selectStockCard(state, "product-router").map((row) => ({ source: row.sourceLabel, signed: row.signedQuantity, balance: row.resultingBalance, actor: row.actorLabel }))).toEqual([
      { source: "Opening balance", signed: 30, balance: 30, actor: "System" },
      { source: "GR-2026-0001", signed: 10, balance: 40, actor: "Warehouse" },
    ]);
  });

  it("orders stock-card balances by parsed instant and stable movement ID", () => {
    const state = createErpSeedState();
    state.stockAdjustments.push({
      id: "offset-adjustment", adjustmentNumber: "SA-2026-0001", productId: "product-router", warehouseId: "warehouse-jakarta", quantityDelta: 5,
      reason: "Earlier instant with offset", status: "approved", proposedByRole: "warehouse", approvedByRole: "approver", approvedAt: "2026-08-09T01:00:00+02:00", createdAt: "2026-08-09T00:30:00+02:00", updatedAt: "2026-08-09T01:00:00+02:00",
    });
    state.stockMovements.push({
      id: "offset-adjustment-movement", productId: "product-router", warehouseId: "warehouse-jakarta", quantity: 5, direction: "adjustment", sourceType: "adjustment", sourceId: "offset-adjustment",
      actorRole: "approver", actorId: "role:approver", reason: "Earlier instant with offset", createdAt: "2026-08-09T01:00:00+02:00", updatedAt: "2026-08-09T01:00:00+02:00",
    });

    expect(selectStockCard(state, "product-router").map((row) => ({ id: row.movement.id, balance: row.resultingBalance }))).toEqual([
      { id: "offset-adjustment-movement", balance: 5 },
      { id: "stock-router-opening", balance: 35 },
    ]);
  });
});
