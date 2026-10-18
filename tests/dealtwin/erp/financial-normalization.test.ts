import { describe, expect, it } from "vitest";
import { isoDate } from "../../../lib/dealtwin/domain/date";
import { normalizeCash } from "../../../lib/dealtwin/erp/normalize-cash";
import { normalizePayables } from "../../../lib/dealtwin/erp/normalize-payables";
import { normalizeReceivables } from "../../../lib/dealtwin/erp/normalize-receivables";
import { createErpSeedState } from "../../../lib/erp/seed";
import type { ErpState, Payment, TradeInvoice } from "../../../lib/erp/types";

const at = "2026-09-12T08:00:00.000Z";

function financialState(): ErpState {
  const state = createErpSeedState();
  state.revision = 12;
  state.purchaseOrders = [{
    ...state.purchaseOrders[0], id: "po-a", orderNumber: "PO-A", status: "confirmed",
    promisedDeliveryDate: "2026-09-15", lines: [{ productId: "product-router", quantity: 1, unitPrice: 18_000_000 }],
  }];
  state.goodsReceipts = [{
    id: "receipt-a", receiptNumber: "GR-A", purchaseOrderId: "po-a", warehouseId: "warehouse-jakarta", status: "posted",
    lines: [{ productId: "product-router", quantity: 1, unitPrice: 18_000_000 }], createdAt: at, updatedAt: at,
  }];
  state.salesOrders = [{
    ...state.salesOrders[0], id: "so-a", orderNumber: "SO-A", status: "invoiced",
    lines: [{ productId: "product-router", quantity: 1, unitPrice: 20_000_000, deliveredQuantity: 1 }],
  }];
  state.deliveryOrders = [{
    id: "delivery-a", deliveryNumber: "DO-A", salesOrderId: "so-a", warehouseId: "warehouse-jakarta", status: "posted",
    lines: [{ productId: "product-router", quantity: 1, unitPrice: 20_000_000 }], createdAt: at, updatedAt: at,
  }];
  state.supplierInvoices = [];
  state.customerInvoices = [];
  state.payments = [];
  return state;
}

function invoice(direction: "payable" | "receivable", overrides: Partial<TradeInvoice> = {}): TradeInvoice {
  return {
    id: direction === "payable" ? "ap-a" : "ar-a", invoiceNumber: direction === "payable" ? "AP-A" : "AR-A",
    purchaseOrderId: direction === "payable" ? "po-a" : null, salesOrderId: direction === "receivable" ? "so-a" : null,
    supplierId: direction === "payable" ? "supplier-utama" : null, customerId: direction === "receivable" ? "erp-customer-sinar" : null,
    sourceDocumentIds: [direction === "payable" ? "receipt-a" : "delivery-a"], status: "unpaid",
    lines: [{ productId: "product-router", quantity: 1, unitPrice: direction === "payable" ? 18_000_000 : 20_000_000 }],
    totalAmount: direction === "payable" ? 18_000_000 : 20_000_000, dueDate: direction === "payable" ? "2026-09-15" : "2026-09-20",
    createdAt: at, updatedAt: at, ...overrides,
  };
}

function payment(direction: "payable" | "receivable", amount: number, overrides: Partial<Payment> = {}): Payment {
  return {
    id: `${direction}-payment-${amount}`, paymentNumber: `${direction}-PMT-${amount}`,
    invoiceId: direction === "payable" ? "ap-a" : "ar-a", direction,
    supplierId: direction === "payable" ? "supplier-utama" : null,
    customerId: direction === "receivable" ? "erp-customer-sinar" : null,
    amount, paymentDate: "2026-09-13", status: "posted", createdAt: at, updatedAt: at, ...overrides,
  };
}

function cashLedger(): ErpState {
  const state = financialState();
  state.cashAccounts = [{
    id: "cash-main", code: "CASH", name: "Kas", currency: "IDR", openingBalanceRupiah: "30000000", openingBalanceDate: "2026-09-10",
    openingSourceType: "verified_balance", openingSourceId: "opening-a", openingSourceRevision: "1", active: true, createdAt: at, updatedAt: at,
  }];
  state.cashMovements = [];
  return state;
}

function cashMovement(overrides: Partial<ErpState["cashMovements"][number]> = {}): ErpState["cashMovements"][number] {
  return {
    id: "cash-a", accountId: "cash-main", effectiveDate: "2026-09-11", sameDayOrder: 100, direction: "outflow", amountRupiah: "1000000",
    entryKind: "original", reversesMovementId: null, sourceType: "manual", sourceId: "manual-a", sourceRevision: "2",
    actorRole: "finance", actorId: "finance-a", reason: "Evidence", createdAt: at, updatedAt: at, ...overrides,
  };
}

describe("payable economic-chain normalization", () => {
  it("uses one confirmed PO obligation until a supplier invoice becomes authoritative", () => {
    const state = financialState();
    const poOnly = normalizePayables(state);
    expect(poOnly).toMatchObject({ ok: true, value: [{
      economicEventId: "payable:po-a", authority: "purchase_order", supplierId: "supplier-utama",
      purchaseOrderId: "po-a", dueDate: "2026-10-15", sameDayOrder: 300, amountRupiah: 18_000_000n,
    }] });

    state.supplierInvoices = [invoice("payable")];
    const invoiced = normalizePayables(state);
    expect(invoiced).toMatchObject({ ok: true, value: [{
      economicEventId: "payable:po-a", authority: "supplier_invoice", dueDate: "2026-09-15", amountRupiah: 18_000_000n,
    }] });
    if (!invoiced.ok) return;
    expect(invoiced.value).toHaveLength(1);
    expect(invoiced.value[0].sourceChain.map((source) => `${source.sourceType}:${source.sourceId}`)).toEqual([
      "purchase_order:po-a", "goods_receipt:receipt-a", "supplier_invoice:ap-a",
    ]);
    expect(invoiced.value[0].sourceChain.map((source) => source.key)).toEqual([
      "erp.purchase_order:po-a", "erp.goods_receipt:receipt-a", "erp.invoice:ap-a",
    ]);
  });

  it.each([
    ["partial", 5_000_000, "partially_paid", 13_000_000n],
    ["full", 18_000_000, "paid", null],
    ["cancelled payment", 5_000_000, "unpaid", 18_000_000n],
  ] as const)("normalizes %s payable payment once", (_label, amount, status, expected) => {
    const state = financialState();
    state.supplierInvoices = [invoice("payable", { status })];
    state.payments = [payment("payable", amount, status === "unpaid" ? { status: "cancelled" } : {})];
    const result = normalizePayables(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(expected === null ? 0 : 1);
    if (expected !== null) {
      expect(result.value[0].amountRupiah).toBe(expected);
      expect(result.value[0].sourceChain.at(-1)).toMatchObject({
        sourceType: "payment", sourceId: state.payments[0].id, key: `erp.payment:${state.payments[0].id}`,
      });
    }
  });

  it("fails closed for duplicated payable source identities", () => {
    const state = financialState();
    state.supplierInvoices = [invoice("payable"), invoice("payable")];
    expect(normalizePayables(state)).toMatchObject({ ok: false, error: { code: "DUPLICATE_FINANCIAL_SOURCE" } });
  });
});

describe("receivable economic-chain normalization", () => {
  it("emits only an outstanding customer invoice, never a quote/order/delivery as confirmed cash", () => {
    const state = financialState();
    expect(normalizeReceivables(state)).toEqual({ ok: true, value: [] });
    state.customerInvoices = [invoice("receivable")];
    const result = normalizeReceivables(state);
    expect(result).toMatchObject({ ok: true, value: [{
      economicEventId: "receivable:so-a", authority: "customer_invoice", customerId: "erp-customer-sinar",
      expectedDate: "2026-09-20", sameDayOrder: 500, amountRupiah: 20_000_000n,
    }] });
    if (!result.ok) return;
    expect(result.value[0].sourceChain.map((source) => `${source.sourceType}:${source.sourceId}`)).toEqual([
      "sales_order:so-a", "delivery_order:delivery-a", "customer_invoice:ar-a",
    ]);
    expect(result.value[0].sourceChain.map((source) => source.key)).toEqual([
      "erp.sales_order:so-a", "erp.delivery:delivery-a", "erp.invoice:ar-a",
    ]);
  });

  it.each([
    ["partial", 5_000_000, "partially_paid", 15_000_000n],
    ["full", 20_000_000, "paid", null],
    ["cancelled payment", 5_000_000, "unpaid", 20_000_000n],
  ] as const)("normalizes %s receivable payment once", (_label, amount, status, expected) => {
    const state = financialState();
    state.customerInvoices = [invoice("receivable", { status })];
    state.payments = [payment("receivable", amount, status === "unpaid" ? { status: "cancelled" } : {})];
    const result = normalizeReceivables(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(expected === null ? 0 : 1);
    if (expected !== null) expect(result.value[0].amountRupiah).toBe(expected);
  });

  it("fails closed for duplicated receivable source identities", () => {
    const state = financialState();
    state.customerInvoices = [invoice("receivable"), invoice("receivable")];
    expect(normalizeReceivables(state)).toMatchObject({ ok: false, error: { code: "DUPLICATE_FINANCIAL_SOURCE" } });
  });
});

describe("confirmed cash normalization", () => {
  it("rolls pre-as-of movements into opening and emits later original and reversal movements once", () => {
    const state = financialState();
    state.cashAccounts = [{
      id: "cash-main", code: "CASH", name: "Kas", currency: "IDR", openingBalanceRupiah: "30000000", openingBalanceDate: "2026-09-10",
      openingSourceType: "verified_balance", openingSourceId: "opening-a", openingSourceRevision: "1", active: true, createdAt: at, updatedAt: at,
    }];
    state.cashMovements = [
      { id: "cash-old", accountId: "cash-main", effectiveDate: "2026-09-11", sameDayOrder: 100, direction: "outflow", amountRupiah: "2000000", entryKind: "original", reversesMovementId: null, sourceType: "erp_payment", sourceId: "payment-old", sourceRevision: "2", actorRole: "finance", actorId: "finance-a", reason: "Paid", createdAt: at, updatedAt: at },
      { id: "cash-now", accountId: "cash-main", effectiveDate: "2026-09-12", sameDayOrder: 400, direction: "inflow", amountRupiah: "5000000", entryKind: "original", reversesMovementId: null, sourceType: "erp_payment", sourceId: "payment-now", sourceRevision: "3", actorRole: "finance", actorId: "finance-a", reason: "Received", createdAt: at, updatedAt: at },
      { id: "cash-reversal", accountId: "cash-main", effectiveDate: "2026-09-13", sameDayOrder: 100, direction: "outflow", amountRupiah: "5000000", entryKind: "reversal", reversesMovementId: "cash-now", sourceType: "cash_movement_reversal", sourceId: "cash-now", sourceRevision: "4", actorRole: "finance", actorId: "finance-a", reason: "Cancelled", createdAt: at, updatedAt: at },
    ];

    const result = normalizeCash(state, isoDate("2026-09-12"));
    expect(result).toMatchObject({ ok: true, value: { accountId: "cash-main", asOfDate: "2026-09-12", openingBalanceRupiah: 28_000_000n } });
    if (!result.ok) return;
    expect(result.value.confirmedMovements.map((event) => [event.eventId, event.direction, event.amountRupiah])).toEqual([
      ["cash:cash-now", "inflow", 5_000_000n], ["cash:cash-reversal", "outflow", 5_000_000n],
    ]);
    expect(result.value.confirmedMovements.every((event) => event.certainty === "confirmed")).toBe(true);
    expect(result.value.openingSource.key).toBe("erp.cash_account:cash-main");
    expect(result.value.dependencies.map((item) => item.key)).toEqual([
      "erp.cash_account:cash-main", "erp.cash_movement:cash-old", "erp.cash_movement:cash-now", "erp.cash_movement:cash-reversal",
    ]);
    expect(result.value.confirmedMovements.map((event) => event.dependencyKey)).toEqual([
      "erp.cash_movement:cash-now", "erp.cash_movement:cash-reversal",
    ]);
  });

  it("fails closed when pre-as-of movements would roll the opening into a negative balance", () => {
    const state = cashLedger();
    state.cashMovements = [cashMovement({
      id: "cash-overdraft", effectiveDate: "2026-09-11", sameDayOrder: 100, direction: "outflow", amountRupiah: "40000000",
    })];
    expect(normalizeCash(state, isoDate("2026-09-12"))).toMatchObject({ ok: false, error: { code: "INVALID_FINANCIAL_STATE" } });
  });

  it("fails closed when cash is not configured or movement provenance is duplicated", () => {
    const state = financialState();
    expect(normalizeCash(state, isoDate("2026-09-12"))).toMatchObject({ ok: false, error: { code: "CASH_NOT_CONFIGURED" } });
    state.cashAccounts = [{ id: "cash-main", code: "CASH", name: "Kas", currency: "IDR", openingBalanceRupiah: "1", openingBalanceDate: "2026-09-12", openingSourceType: "verified", openingSourceId: "opening", openingSourceRevision: "1", active: true, createdAt: at, updatedAt: at }];
    const movement = { id: "cash-a", accountId: "cash-main", effectiveDate: "2026-09-12", sameDayOrder: 100, direction: "outflow" as const, amountRupiah: "1", entryKind: "original" as const, reversesMovementId: null, sourceType: "manual", sourceId: "duplicate", sourceRevision: "2", actorRole: "finance" as const, actorId: "finance-a", reason: "Evidence", createdAt: at, updatedAt: at };
    state.cashMovements = [movement, { ...movement, id: "cash-b" }];
    expect(normalizeCash(state, isoDate("2026-09-12"))).toMatchObject({ ok: false, error: { code: "DUPLICATE_FINANCIAL_SOURCE" } });
  });

  it("rejects movements before the opening date and opening-date order at the anchor", () => {
    const state = cashLedger();
    state.cashMovements = [cashMovement({ id: "cash-before", effectiveDate: "2026-09-09", sameDayOrder: 100 })];
    expect(normalizeCash(state, isoDate("2026-09-12"))).toMatchObject({ ok: false, error: { code: "INVALID_FINANCIAL_STATE" } });
    state.cashMovements = [cashMovement({ id: "cash-anchor", effectiveDate: "2026-09-10", sameDayOrder: 0 })];
    expect(normalizeCash(state, isoDate("2026-09-12"))).toMatchObject({ ok: false, error: { code: "INVALID_FINANCIAL_STATE" } });
  });

  it("rejects unknown entry kinds and foreign directions instead of inventing a balance", () => {
    const state = cashLedger();
    state.cashMovements = [cashMovement({ id: "cash-kind", entryKind: "adjustment" as "original" })];
    expect(normalizeCash(state, isoDate("2026-09-12"))).toMatchObject({ ok: false, error: { code: "INVALID_FINANCIAL_STATE" } });
    state.cashMovements = [cashMovement({ id: "cash-dir", direction: "sideways" as "outflow" })];
    expect(normalizeCash(state, isoDate("2026-09-12"))).toMatchObject({ ok: false, error: { code: "INVALID_FINANCIAL_STATE" } });
  });

  it("rejects reversals that do not follow the original chronology, account, amount, or opposite direction", () => {
    const original = cashMovement({ id: "cash-original", effectiveDate: "2026-09-13", sameDayOrder: 100, direction: "outflow", amountRupiah: "5000000" });
    const state = cashLedger();
    state.cashMovements = [original, cashMovement({
      id: "cash-early-reversal", effectiveDate: "2026-09-13", sameDayOrder: 50, direction: "inflow", amountRupiah: "5000000",
      entryKind: "reversal", reversesMovementId: "cash-original", sourceType: "cash_movement_reversal", sourceId: "cash-original", sourceRevision: "3",
    })];
    expect(normalizeCash(state, isoDate("2026-09-12"))).toMatchObject({ ok: false, error: { code: "INVALID_FINANCIAL_STATE" } });

    state.cashMovements = [original, cashMovement({
      id: "cash-wrong-amount", effectiveDate: "2026-09-14", sameDayOrder: 100, direction: "inflow", amountRupiah: "1",
      entryKind: "reversal", reversesMovementId: "cash-original", sourceType: "cash_movement_reversal", sourceId: "cash-original", sourceRevision: "3",
    })];
    expect(normalizeCash(state, isoDate("2026-09-12"))).toMatchObject({ ok: false, error: { code: "INVALID_FINANCIAL_STATE" } });
  });

  it("rejects reversal-of-reversal and duplicate reversals", () => {
    const original = cashMovement({ id: "cash-original", effectiveDate: "2026-09-13", sameDayOrder: 100, direction: "outflow", amountRupiah: "5000000" });
    const reversal = cashMovement({
      id: "cash-reversal", effectiveDate: "2026-09-14", sameDayOrder: 100, direction: "inflow", amountRupiah: "5000000",
      entryKind: "reversal", reversesMovementId: "cash-original", sourceType: "cash_movement_reversal", sourceId: "cash-original", sourceRevision: "3",
    });
    const state = cashLedger();
    state.cashMovements = [original, reversal, cashMovement({
      id: "cash-double", effectiveDate: "2026-09-15", sameDayOrder: 100, direction: "outflow", amountRupiah: "5000000",
      entryKind: "reversal", reversesMovementId: "cash-original", sourceType: "cash_movement_reversal", sourceId: "cash-original", sourceRevision: "4",
    })];
    expect(normalizeCash(state, isoDate("2026-09-12"))).toMatchObject({ ok: false });

    state.cashMovements = [original, reversal, cashMovement({
      id: "cash-rev-rev", effectiveDate: "2026-09-15", sameDayOrder: 100, direction: "outflow", amountRupiah: "5000000",
      entryKind: "reversal", reversesMovementId: "cash-reversal", sourceType: "cash_movement_reversal", sourceId: "cash-reversal", sourceRevision: "4",
    })];
    expect(normalizeCash(state, isoDate("2026-09-12"))).toMatchObject({ ok: false, error: { code: "INVALID_FINANCIAL_STATE" } });
  });
});
