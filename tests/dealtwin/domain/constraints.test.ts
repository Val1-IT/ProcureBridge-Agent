import { describe, expect, it } from "vitest";

import { validateConstraints, type CommercialConstraint, type ConstraintProvenance, type ConstraintResolution } from "../../../lib/dealtwin/domain/constraint";
import { rupiah } from "../../../lib/dealtwin/domain/money";
import { createCompilerPolicy } from "../../../lib/dealtwin/domain/policy";
import { basisPoints } from "../../../lib/dealtwin/domain/rate";
import { isDealTwinReasonCode } from "../../../lib/dealtwin/domain/reason-code";

function metadata(id: string, provenance: ConstraintProvenance = "judge_seed", resolution: ConstraintResolution = "confirmed") {
  return { id, provenance, resolution, sourceText: provenance === "ai_extracted" || provenance === "user_confirmed" ? "Commercial terms" : null } as const;
}

function allConstraintKinds(): CommercialConstraint[] {
  return [
    { ...metadata("c-09"), kind: "required_approval", operator: "eq", value: { approvalCode: "owner_exception" } },
    { ...metadata("c-08"), kind: "required_inventory_available", operator: "gte", value: { productId: "product-a", warehouseId: "warehouse-a", quantity: 2 } },
    { ...metadata("c-07"), kind: "minimum_cash_rupiah", operator: "gte", value: rupiah(5_000_000n) },
    { ...metadata("c-06"), kind: "new_borrowing_allowed", operator: "eq", value: false },
    { ...metadata("c-05"), kind: "protect_existing_supplier_due_dates", operator: "eq", value: true },
    { ...metadata("c-04"), kind: "supplier_payment_due_days", operator: "gte", value: 6 },
    { ...metadata("c-03"), kind: "customer_balance_due_days", operator: "lte", value: 14 },
    { ...metadata("c-02"), kind: "customer_deposit_min_bps", operator: "gte", value: basisPoints(2_000) },
    { ...metadata("c-01"), kind: "customer_deposit_max_bps", operator: "lte", value: basisPoints(4_000) },
  ];
}

describe("commercial constraint validation", () => {
  it("accepts every locked MVP kind and returns stable canonical order", () => {
    const result = validateConstraints(allConstraintKinds());

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.constraints.map((constraint) => constraint.kind)).toEqual([
      "customer_deposit_max_bps",
      "customer_deposit_min_bps",
      "customer_balance_due_days",
      "supplier_payment_due_days",
      "protect_existing_supplier_due_dates",
      "new_borrowing_allowed",
      "minimum_cash_rupiah",
      "required_inventory_available",
      "required_approval",
    ]);
  });

  it("rejects duplicate identities and duplicate semantic constraints with a stable code", () => {
    const source = allConstraintKinds();
    const duplicateId = validateConstraints([...source, { ...source[0] }]);
    const duplicateKind = validateConstraints([...source, { ...source[6], id: "c-10" }]);

    expect(duplicateId).toMatchObject({ ok: false, error: { code: "DUPLICATE_CONSTRAINT" } });
    expect(duplicateKind).toMatchObject({ ok: false, error: { code: "DUPLICATE_CONSTRAINT" } });
    expect(!duplicateId.ok && isDealTwinReasonCode(duplicateId.error.code)).toBe(true);
  });

  it("rejects a deposit minimum above its maximum", () => {
    const constraints = allConstraintKinds().map((constraint) => constraint.kind === "customer_deposit_min_bps"
      ? { ...constraint, value: basisPoints(5_000) }
      : constraint) as CommercialConstraint[];

    expect(validateConstraints(constraints)).toMatchObject({ ok: false, error: { code: "CONFLICTING_CONSTRAINTS" } });
  });

  it.each([
    ["AI result marked confirmed", { ...allConstraintKinds()[0], ...metadata("bad-ai", "ai_extracted", "confirmed") }],
    ["user constraint left pending", { ...allConstraintKinds()[0], ...metadata("bad-user", "user_confirmed", "pending_confirmation") }],
    ["fractional days", { ...allConstraintKinds()[2], id: "bad-days", value: 1.5 }],
    ["negative minimum cash", { ...allConstraintKinds()[6], id: "bad-cash", value: rupiah(-1n) }],
    ["fractional inventory", { ...allConstraintKinds()[7], id: "bad-stock", value: { productId: "product-a", warehouseId: "warehouse-a", quantity: 0.5 } }],
    ["borrowing enabled", { ...allConstraintKinds()[5], id: "bad-borrow", value: true }],
  ] as const)("fails closed for %s", (_label, constraint) => {
    expect(validateConstraints([constraint as CommercialConstraint])).toMatchObject({ ok: false, error: { code: "INVALID_CONSTRAINT" } });
  });
});

describe("compiler policy", () => {
  it("accepts exact cash floor, no borrowing, and a positive integer horizon", () => {
    expect(createCompilerPolicy({ minimumCashRupiah: rupiah(5_000_000n), newBorrowingAllowed: false, defaultHorizonDays: 30 }))
      .toEqual({ ok: true, value: { minimumCashRupiah: 5_000_000n, newBorrowingAllowed: false, defaultHorizonDays: 30 } });
  });

  it("rejects negative money, borrowing, and fractional horizon", () => {
    expect(createCompilerPolicy({ minimumCashRupiah: rupiah(-1n), newBorrowingAllowed: false, defaultHorizonDays: 30 })).toMatchObject({ ok: false });
    expect(createCompilerPolicy({ minimumCashRupiah: rupiah(0n), newBorrowingAllowed: true as false, defaultHorizonDays: 30 })).toMatchObject({ ok: false });
    expect(createCompilerPolicy({ minimumCashRupiah: rupiah(0n), newBorrowingAllowed: false, defaultHorizonDays: 1.5 })).toMatchObject({ ok: false });
  });
});
