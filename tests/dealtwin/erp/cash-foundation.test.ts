import { describe, expect, it } from "vitest";

import { isoDate } from "../../../lib/dealtwin/domain/date";
import { formatRupiahDto } from "../../../lib/dealtwin/domain/money";
import {
  postCashMovement,
  reverseCashMovement,
  setOpeningCashBalance,
} from "../../../lib/erp/commands/cash";
import { cancelPayment, recordPayment } from "../../../lib/erp/commands/finance";
import { createErpSeedState } from "../../../lib/erp/seed";
import { selectCurrentCashBalance } from "../../../lib/erp/selectors-cash";
import type { CashMovementInput, ErpState } from "../../../lib/erp/types";

const openingNow = "2026-09-12T08:00:00.000Z";

function configuredState(openingBalanceRupiah = "30000000", openingBalanceDate = "2026-09-12") {
  const result = setOpeningCashBalance(createErpSeedState(), "finance", {
    accountId: "cash-main",
    code: "BANK-IDR",
    name: "Primary IDR cash",
    openingBalanceRupiah,
    openingBalanceDate,
    sourceType: "opening_balance",
    sourceId: "opening-2026-09-12",
    sourceRevision: "1",
    actorId: "finance-a",
  }, openingNow);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

function movement(overrides: Partial<CashMovementInput> = {}): CashMovementInput {
  return {
    accountId: "cash-main",
    effectiveDate: "2026-09-13",
    sameDayOrder: 100,
    direction: "outflow",
    amountRupiah: "1000000",
    sourceType: "manual_cash",
    sourceId: "manual-1",
    sourceRevision: "2",
    actorId: "finance-a",
    reason: "Verified cash movement",
    ...overrides,
  };
}

function payableStateWithCash() {
  const state = configuredState();
  state.purchaseOrders[0] = { ...state.purchaseOrders[0], status: "confirmed" };
  state.supplierInvoices = [{
    id: "supplier-invoice-a",
    invoiceNumber: "SINV-2026-0001",
    purchaseOrderId: state.purchaseOrders[0].id,
    salesOrderId: null,
    supplierId: state.purchaseOrders[0].supplierId,
    customerId: null,
    sourceDocumentIds: [state.purchaseOrders[0].id],
    status: "unpaid",
    lines: [{ productId: "product-router", quantity: 1, unitPrice: 10_000_000 }],
    totalAmount: 10_000_000,
    dueDate: "2026-10-01",
    createdAt: "2026-09-12T09:00:00.000Z",
    updatedAt: "2026-09-12T09:00:00.000Z",
  }];
  return state;
}

describe("authoritative ERP cash account", () => {
  it("creates exactly one active IDR account with an exact opening anchor", () => {
    const result = setOpeningCashBalance(createErpSeedState(), "finance", {
      accountId: "cash-main", code: "BANK-IDR", name: "Primary IDR cash",
      openingBalanceRupiah: "9007199254740993", openingBalanceDate: "2026-09-12",
      sourceType: "opening_balance", sourceId: "opening-a", sourceRevision: "1", actorId: "finance-a",
    }, openingNow);

    expect(result).toMatchObject({
      ok: true,
      value: { id: "cash-main", currency: "IDR", openingBalanceRupiah: "9007199254740993", active: true },
      state: { cashAccounts: [{ id: "cash-main" }], cashMovements: [] },
    });
    if (!result.ok) return;
    expect(setOpeningCashBalance(result.state, "admin", {
      accountId: "cash-second", code: "CASH-2", name: "Second",
      openingBalanceRupiah: "1", openingBalanceDate: "2026-09-12",
      sourceType: "opening_balance", sourceId: "opening-b", sourceRevision: "2", actorId: "admin-a",
    }, openingNow)).toMatchObject({ ok: false, state: result.state, error: { code: "INVALID_STATE" } });
  });

  it.each([
    ["formatted amount", { openingBalanceRupiah: "30,000,000" }],
    ["negative amount", { openingBalanceRupiah: "-1" }],
    ["invalid date", { openingBalanceDate: "2026-02-31" }],
    ["blank provenance", { sourceId: " " }],
  ])("rejects %s without changing state", (_label, overrides) => {
    const state = createErpSeedState();
    const result = setOpeningCashBalance(state, "finance", {
      accountId: "cash-main", code: "BANK-IDR", name: "Primary IDR cash",
      openingBalanceRupiah: "30000000", openingBalanceDate: "2026-09-12",
      sourceType: "opening_balance", sourceId: "opening-a", sourceRevision: "1", actorId: "finance-a",
      ...overrides,
    }, openingNow);
    expect(result).toMatchObject({ ok: false, state, error: { code: "INVALID_INPUT" } });
  });
});

describe("append-only ERP cash movements", () => {
  it("accumulates exact signed values, including opening-day movements after order zero", () => {
    let state = configuredState("9007199254740993");
    const inflow = postCashMovement(state, "finance", movement({
      effectiveDate: "2026-09-12", sameDayOrder: 400, direction: "inflow", amountRupiah: "10", sourceId: "opening-day-in",
    }), "2026-09-12T09:00:00.000Z");
    if (!inflow.ok) throw new Error(inflow.error.message);
    state = inflow.state;
    const outflow = postCashMovement(state, "finance", movement({ amountRupiah: "3", sourceId: "next-day-out" }), "2026-09-13T09:00:00.000Z");
    if (!outflow.ok) throw new Error(outflow.error.message);

    const balance = selectCurrentCashBalance(outflow.state, "cash-main", isoDate("2026-09-13"));
    expect(balance.ok && formatRupiahDto(balance.value)).toBe("9007199254741000");
    expect(outflow.state.cashMovements).toHaveLength(2);
  });

  it.each([
    ["zero amount", { amountRupiah: "0" }],
    ["formatted amount", { amountRupiah: "1,000" }],
    ["unknown account", { accountId: "missing" }],
    ["before opening", { effectiveDate: "2026-09-11" }],
    ["opening order zero", { effectiveDate: "2026-09-12", sameDayOrder: 0 }],
    ["fractional order", { sameDayOrder: 1.5 }],
    ["invalid date", { effectiveDate: "2026-02-31" }],
    ["invalid direction", { direction: "sideways" }],
  ])("rejects %s atomically", (_label, overrides) => {
    const state = configuredState();
    const result = postCashMovement(state, "finance", movement(overrides as Partial<CashMovementInput>), "2026-09-13T09:00:00.000Z");
    expect(result).toMatchObject({ ok: false, state, error: { code: "INVALID_INPUT" } });
  });

  it("enforces unique source provenance", () => {
    const state = configuredState();
    const first = postCashMovement(state, "finance", movement(), "2026-09-13T09:00:00.000Z");
    if (!first.ok) throw new Error(first.error.message);
    expect(postCashMovement(first.state, "finance", movement({ amountRupiah: "2" }), "2026-09-13T10:00:00.000Z"))
      .toMatchObject({ ok: false, state: first.state, error: { code: "INVALID_STATE" } });
  });

  it("adds one opposite compensating reversal and never changes the original", () => {
    const posted = postCashMovement(configuredState(), "finance", movement(), "2026-09-13T09:00:00.000Z");
    if (!posted.ok) throw new Error(posted.error.message);
    const original = structuredClone(posted.value);
    const reversed = reverseCashMovement(posted.state, "finance", {
      originalMovementId: original.id, effectiveDate: "2026-09-14", sameDayOrder: 400,
      actorId: "finance-a", reason: "Correct duplicate evidence",
    }, "2026-09-14T09:00:00.000Z");

    expect(reversed).toMatchObject({ ok: true, value: {
      accountId: original.accountId, amountRupiah: original.amountRupiah, direction: "inflow",
      entryKind: "reversal", reversesMovementId: original.id,
      sourceType: "cash_movement_reversal", sourceId: original.id,
    } });
    if (!reversed.ok) return;
    expect(reversed.state.cashMovements?.[0]).toEqual(original);
    expect(reverseCashMovement(reversed.state, "finance", {
      originalMovementId: original.id, effectiveDate: "2026-09-15", sameDayOrder: 400, actorId: "finance-a", reason: "Again",
    }, "2026-09-15T09:00:00.000Z")).toMatchObject({ ok: false, state: reversed.state, error: { code: "INVALID_STATE" } });
    expect(reverseCashMovement(reversed.state, "finance", {
      originalMovementId: reversed.value.id, effectiveDate: "2026-09-15", sameDayOrder: 100, actorId: "finance-a", reason: "Reverse reversal",
    }, "2026-09-15T09:00:00.000Z")).toMatchObject({ ok: false, state: reversed.state, error: { code: "INVALID_STATE" } });
  });

  it("rejects caller-supplied reversal account, amount, or direction overrides", () => {
    const posted = postCashMovement(configuredState(), "finance", movement(), "2026-09-13T09:00:00.000Z");
    if (!posted.ok) throw new Error(posted.error.message);
    const result = reverseCashMovement(posted.state, "finance", {
      originalMovementId: posted.value.id, effectiveDate: "2026-09-14", sameDayOrder: 400,
      actorId: "finance-a", reason: "Caller attempted override", accountId: "cash-other",
      amountRupiah: "1", direction: "outflow",
    } as never, "2026-09-14T09:00:00.000Z");

    expect(result).toMatchObject({ ok: false, state: posted.state, error: { code: "INVALID_INPUT" } });
  });

  it("fails closed when the original movement account, amount, or direction is corrupt", () => {
    const posted = postCashMovement(configuredState(), "finance", movement(), "2026-09-13T09:00:00.000Z");
    if (!posted.ok) throw new Error(posted.error.message);
    const corruptStates = [
      { ...posted.state, cashMovements: [{ ...posted.value, accountId: "missing" }] },
      { ...posted.state, cashMovements: [{ ...posted.value, amountRupiah: "0" }] },
      { ...posted.state, cashMovements: [{ ...posted.value, direction: "sideways" }] },
    ];

    for (const state of corruptStates) {
      expect(reverseCashMovement(state as never, "finance", {
        originalMovementId: posted.value.id, effectiveDate: "2026-09-14", sameDayOrder: 400,
        actorId: "finance-a", reason: "Reject corrupt original",
      }, "2026-09-14T09:00:00.000Z")).toMatchObject({ ok: false, state, error: { code: "INVALID_STATE" } });
    }
  });

  it("fails closed when more than one cash account is active", () => {
    const state = configuredState();
    const corruptState: ErpState = {
      ...state,
      cashAccounts: [
        ...state.cashAccounts,
        {
          ...state.cashAccounts[0],
          id: "cash-duplicate",
          name: "Duplicate active account",
        },
      ],
    };

    expect(postCashMovement(
      corruptState,
      "finance",
      movement({ sourceId: "manual-duplicate-account" }),
      "2026-09-13T09:00:00.000Z",
    )).toMatchObject({ ok: false, state: corruptState, error: { code: "INVALID_STATE" } });
  });

  it("does not invent a selector balance when active IDR account count is not exactly one", () => {
    const state = configuredState();
    const duplicate: ErpState = {
      ...state,
      cashAccounts: [...state.cashAccounts, { ...state.cashAccounts[0], id: "cash-duplicate", name: "Duplicate active account" }],
    };
    expect(selectCurrentCashBalance(duplicate, "cash-main", isoDate("2026-09-13")))
      .toMatchObject({ ok: false, error: { code: "INVALID_CASH_EVIDENCE" } });
    expect(selectCurrentCashBalance({ ...state, cashAccounts: [] }, "cash-main", isoDate("2026-09-13")))
      .toMatchObject({ ok: false });
  });

  it("does not invent a selector balance from foreign direction or pre-opening evidence", () => {
    const posted = postCashMovement(configuredState(), "finance", movement(), "2026-09-13T09:00:00.000Z");
    if (!posted.ok) throw new Error(posted.error.message);
    const sideways = { ...posted.state, cashMovements: [{ ...posted.value, direction: "sideways" as "outflow" }] };
    expect(selectCurrentCashBalance(sideways, "cash-main", isoDate("2026-09-13")))
      .toMatchObject({ ok: false, error: { code: "INVALID_CASH_EVIDENCE" } });
    const beforeOpening = { ...posted.state, cashMovements: [{ ...posted.value, effectiveDate: "2026-09-11" }] };
    expect(selectCurrentCashBalance(beforeOpening, "cash-main", isoDate("2026-09-13")))
      .toMatchObject({ ok: false, error: { code: "INVALID_CASH_EVIDENCE" } });
  });

  it("does not invent a selector balance from a reversal that precedes its original", () => {
    const posted = postCashMovement(configuredState(), "finance", movement(), "2026-09-13T09:00:00.000Z");
    if (!posted.ok) throw new Error(posted.error.message);
    const earlyReversal = {
      ...posted.value,
      id: "cash-reversal-early",
      entryKind: "reversal" as const,
      reversesMovementId: posted.value.id,
      direction: "inflow" as const,
      sourceType: "cash_movement_reversal",
      sourceId: posted.value.id,
      sameDayOrder: 50,
    };
    const corrupt = { ...posted.state, cashMovements: [posted.value, earlyReversal] };
    expect(selectCurrentCashBalance(corrupt, "cash-main", isoDate("2026-09-14")))
      .toMatchObject({ ok: false, error: { code: "INVALID_CASH_EVIDENCE" } });
  });
});

describe("payment and cash atomicity", () => {
  it("creates exactly one cash movement for a posted safe-integer payment", () => {
    const state = payableStateWithCash();
    const result = recordPayment(state, "finance", {
      invoiceId: "supplier-invoice-a", direction: "payable", amount: 5_000_000,
    }, "2026-09-13T09:00:00.000Z");

    expect(result).toMatchObject({ ok: true, state: {
      supplierInvoices: [{ status: "partially_paid" }],
      cashMovements: [{ direction: "outflow", amountRupiah: "5000000", sourceType: "erp_payment" }],
    } });
  });

  it("creates no movement for failed or structurally duplicated payment evidence", () => {
    const state = payableStateWithCash();
    expect(recordPayment(state, "finance", {
      invoiceId: "supplier-invoice-a", direction: "payable", amount: Number.MAX_SAFE_INTEGER + 1,
    }, "2026-09-13T09:00:00.000Z")).toMatchObject({ ok: false, state });

    const corrupt = structuredClone(state) as ErpState;
    const duplicate = {
      id: "payment-duplicate", paymentNumber: "PMT-2026-0001", invoiceId: "supplier-invoice-a", direction: "payable" as const,
      supplierId: "supplier-utama", customerId: null, amount: 1, paymentDate: "2026-09-13", status: "posted" as const,
      createdAt: "2026-09-13T08:00:00.000Z", updatedAt: "2026-09-13T08:00:00.000Z",
    };
    corrupt.payments = [duplicate, { ...duplicate }];
    expect(recordPayment(corrupt, "finance", {
      invoiceId: "supplier-invoice-a", direction: "payable", amount: 1,
    }, "2026-09-13T09:00:00.000Z")).toMatchObject({ ok: false, state: corrupt, error: { code: "INVALID_STATE" } });
    expect(corrupt.cashMovements).toEqual([]);
  });

  it("cancels a payment by reversing cash and reopening its invoice atomically", () => {
    const paid = recordPayment(payableStateWithCash(), "finance", {
      invoiceId: "supplier-invoice-a", direction: "payable", amount: 10_000_000,
    }, "2026-09-13T09:00:00.000Z");
    if (!paid.ok) throw new Error(paid.error.message);
    const originalMovement = paid.state.cashMovements?.[0];
    if (!originalMovement) throw new Error("cash movement missing");

    expect(reverseCashMovement(paid.state, "finance", {
      originalMovementId: originalMovement.id, effectiveDate: "2026-09-14", sameDayOrder: 400,
      actorId: "finance-a", reason: "Must cancel payment instead",
    }, "2026-09-14T09:00:00.000Z")).toMatchObject({ ok: false, state: paid.state, error: { code: "INVALID_STATE" } });

    const cancelled = cancelPayment(paid.state, "finance", paid.value.id, "2026-09-14T09:00:00.000Z");
    expect(cancelled).toMatchObject({ ok: true, value: { status: "cancelled" }, state: {
      supplierInvoices: [{ status: "unpaid" }],
      cashMovements: [
        { sourceType: "erp_payment", direction: "outflow", amountRupiah: "10000000" },
        { sourceType: "cash_movement_reversal", direction: "inflow", amountRupiah: "10000000", reversesMovementId: originalMovement.id },
      ],
    } });
  });
});
