import { describe, expect, it } from "vitest";
import type { DatedCashEvent } from "../../../lib/dealtwin/domain/cash-event";
import { validateConstraints, type CommercialConstraint, type ConstraintSet } from "../../../lib/dealtwin/domain/constraint";
import { isoDate } from "../../../lib/dealtwin/domain/date";
import type { DealTermsV1 } from "../../../lib/dealtwin/domain/deal-terms";
import { rupiah } from "../../../lib/dealtwin/domain/money";
import { basisPoints } from "../../../lib/dealtwin/domain/rate";
import type { CanonicalErpSnapshot } from "../../../lib/dealtwin/erp/build-snapshot";
import { compileDeal, type CompileInput } from "../../../lib/dealtwin/compiler/compile-deal";

function event(id: string, date: string, direction: "inflow" | "outflow", amount: bigint, overrides: Partial<DatedCashEvent> = {}): DatedCashEvent {
  return { eventId: id, dependencyKey: `dep:${id}`, date: isoDate(date), sameDayOrder: direction === "outflow" ? 300 : 500,
    direction, amountRupiah: rupiah(amount), certainty: "expected", eventClass: "projected", orderingSource: "conservative", material: true, ...overrides } as DatedCashEvent;
}

function terms(depositBps = 2_500): DealTermsV1 {
  return { schemaVersion: "dealtwin.deal-terms.v1", currency: "IDR", customerId: "customer-a", warehouseId: "warehouse-a", acceptedDate: isoDate("2026-09-16"),
    productLines: [{ lineId: "line-a", productId: "product-a", quantity: 1, unitPriceRupiah: rupiah(60_000_000n) }],
    customerPaymentEvents: [
      { eventId: "deal:deposit", role: "customer_deposit", basisPoints: basisPoints(depositBps), daysFromAcceptance: 0, effectiveDate: isoDate("2026-09-16"), sameDayOrder: 500 },
      { eventId: "deal:balance", role: "customer_balance", basisPoints: basisPoints(10_000 - depositBps), daysFromAcceptance: 14, effectiveDate: isoDate("2026-09-30"), sameDayOrder: 500 },
    ],
    directCostEvents: [{ eventId: "deal:cost", role: "direct_cost", supplierId: "supplier-a", productLineIds: ["line-a"], amountRupiah: rupiah(42_000_000n), daysFromAcceptance: 6, effectiveDate: isoDate("2026-09-22"), sameDayOrder: 300, orderingSource: "conservative", provenance: { sourceType: "confirmed_quote", sourceId: "quote-a", sourceRevision: "1", evidence: "Confirmed direct cost" } }],
  };
}

function constraint(kind: CommercialConstraint["kind"], value: unknown): CommercialConstraint {
  const base = { id: `constraint:${kind}`, kind, provenance: "judge_seed" as const, resolution: "confirmed" as const, sourceText: null };
  const operator = kind === "customer_deposit_max_bps" || kind === "customer_balance_due_days" ? "lte" : kind === "protect_existing_supplier_due_dates" || kind === "new_borrowing_allowed" || kind === "required_approval" ? "eq" : "gte";
  return { ...base, operator, value } as CommercialConstraint;
}

function constraints(items: readonly CommercialConstraint[]): ConstraintSet {
  const result = validateConstraints(items);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function snapshot(events: readonly DatedCashEvent[], inventoryAvailable = 1): CanonicalErpSnapshot {
  return {
    asOfDate: isoDate("2026-09-12"), requestedHorizonEnd: isoDate("2026-10-12"), openingBalanceRupiah: rupiah(30_000_000n), cashEvents: events,
    obligations: [], receipts: [], inventory: [{ productId: "product-a", warehouseId: "warehouse-a", physicalQuantity: 1, reservedQuantity: 1 - inventoryAvailable, availableQuantity: inventoryAvailable, dependencies: [] }],
  } as unknown as CanonicalErpSnapshot;
}

function input(overrides: Partial<CompileInput> = {}): CompileInput {
  const cashEvents = [
    event("opening", "2026-09-12", "inflow", 30_000_000n, { eventClass: "opening_balance", certainty: "confirmed", sameDayOrder: 0, orderingSource: "explicit" }),
    event("existing-ap", "2026-09-15", "outflow", 18_000_000n),
    event("existing-ar", "2026-09-20", "inflow", 20_000_000n),
  ];
  return { snapshot: snapshot(cashEvents), terms: terms(), constraints: constraints([
    constraint("customer_deposit_max_bps", basisPoints(4_000)),
    constraint("minimum_cash_rupiah", rupiah(5_000_000n)),
    constraint("new_borrowing_allowed", false),
  ]), policy: { minimumCashRupiah: rupiah(5_000_000n), newBorrowingAllowed: false, defaultHorizonDays: 30 }, approvedApprovalCodes: [], ...overrides };
}

describe("deterministic deal compilation", () => {
  it("returns COMPILES with exact minima for a feasible candidate", () => {
    expect(compileDeal(input())).toMatchObject({ outcome: "COMPILES", reasonCode: null, firstViolationDate: null, shortfallRupiah: null, timeline: { minimumProjectedBalance: 5_000_000n } });
  });

  it("returns CONDITIONALLY_VALID only for a non-arithmetic unresolved approval", () => {
    const base = input();
    const result = compileDeal({ ...base, constraints: constraints([...base.constraints.constraints, constraint("required_approval", { approvalCode: "owner_exception" })]) });
    expect(result).toMatchObject({ outcome: "CONDITIONALLY_VALID", reasonCode: "APPROVAL_REQUIRED" });
    expect(result.unresolvedConstraintIds).toEqual(["constraint:required_approval"]);
  });

  it("returns the first cash-floor violation, exact shortfall, and worst point", () => {
    const result = compileDeal({ ...input(), terms: terms(2_000) });
    expect(result).toMatchObject({ outcome: "DOES_NOT_COMPILE", reasonCode: "MINIMUM_CASH_VIOLATION", firstViolationDate: "2026-09-22", cashFloorRupiah: 5_000_000n, shortfallRupiah: 3_000_000n, worstLiquidityPoint: { eventId: "deal:cost", projectedBalanceAfter: 2_000_000n } });
  });

  it("reports the stricter confirmed cash-floor constraint as the effective floor", () => {
    const base = input();
    const stricter = constraints(base.constraints.constraints.map((item) => item.kind === "minimum_cash_rupiah"
      ? constraint("minimum_cash_rupiah", rupiah(6_000_000n)) : item));
    expect(compileDeal({ ...base, constraints: stricter })).toMatchObject({
      outcome: "DOES_NOT_COMPILE", reasonCode: "MINIMUM_CASH_VIOLATION", cashFloorRupiah: 6_000_000n, shortfallRupiah: 1_000_000n,
    });
  });

  it("enforces deposit cap, no borrowing, protected obligations, and inventory", () => {
    expect(compileDeal({ ...input(), terms: terms(4_100) })).toMatchObject({ outcome: "DOES_NOT_COMPILE", reasonCode: "CUSTOMER_DEPOSIT_LIMIT" });
    const borrowing = input({ snapshot: snapshot([event("opening", "2026-09-12", "inflow", 5_000_000n, { eventClass: "opening_balance", certainty: "confirmed", sameDayOrder: 0, orderingSource: "explicit" })]) });
    expect(compileDeal(borrowing)).toMatchObject({ outcome: "DOES_NOT_COMPILE", reasonCode: "NEW_BORROWING_PROHIBITED" });
    const protectedBase = input();
    const protectedInput = { ...protectedBase, snapshot: { ...protectedBase.snapshot,
      obligations: [{ economicEventId: "payable:missing", supplierId: "supplier-a", purchaseOrderId: "po-a", authority: "supplier_invoice" as const, dueDate: isoDate("2026-10-01"), sameDayOrder: 300 as const, amountRupiah: rupiah(1n), sourceChain: [] }],
    } };
    expect(compileDeal({ ...protectedInput, constraints: constraints([...protectedInput.constraints.constraints, constraint("protect_existing_supplier_due_dates", true)]) })).toMatchObject({ outcome: "DOES_NOT_COMPILE", reasonCode: "PROTECTED_OBLIGATION" });
    expect(compileDeal({ ...input(), snapshot: snapshot(input().snapshot.cashEvents, 0), constraints: constraints([...input().constraints.constraints, constraint("required_inventory_available", { productId: "product-a", warehouseId: "warehouse-a", quantity: 1 })]) })).toMatchObject({ outcome: "DOES_NOT_COMPILE", reasonCode: "INSUFFICIENT_INVENTORY" });
  });

  it("returns UNRESOLVED for material ordering uncertainty", () => {
    const unresolved = event("uncertain", "2026-09-14", "outflow", 1n, { orderingSource: "unresolved" });
    expect(compileDeal(input({ snapshot: snapshot([unresolved]) }))).toMatchObject({ outcome: "UNRESOLVED", reasonCode: "UNRESOLVED_SAME_DAY_ORDER" });
  });

  it("reports active commitment collision IDs without losing exact floor evidence", () => {
    const commitment = event("commitment-a:cost", "2026-09-22", "outflow", 6_000_000n, { eventClass: "commitment", certainty: "reserved", sameDayOrder: 200, orderingSource: "explicit", dependencyKey: "dealtwin.commitment:commitment-a" });
    const base = input();
    const result = compileDeal({ ...base, snapshot: snapshot([...base.snapshot.cashEvents, commitment]) });
    expect(result).toMatchObject({ outcome: "DOES_NOT_COMPILE", conflictingCommitmentIds: ["commitment-a"], firstViolationDate: "2026-09-22" });
  });

  it("expands the horizon for a material day-31 obligation", () => {
    const late = event("late-ap", "2026-10-13", "outflow", 1n);
    const base = input();
    expect(compileDeal({ ...base, snapshot: snapshot([...base.snapshot.cashEvents, late]) })).toMatchObject({ effectiveHorizonEnd: "2026-10-13", horizonExpanded: true, horizonExpansionEventIds: ["late-ap"] });
  });

  it("reports the earliest violation date rather than a later higher-priority deposit violation", () => {
    const cashEvents = [
      event("opening", "2026-09-12", "inflow", 30_000_000n, { eventClass: "opening_balance", certainty: "confirmed", sameDayOrder: 0, orderingSource: "explicit" }),
      event("existing-ap", "2026-09-15", "outflow", 40_000_000n),
    ];
    const result = compileDeal({
      snapshot: snapshot(cashEvents),
      terms: terms(4_100),
      constraints: constraints([
        constraint("customer_deposit_max_bps", basisPoints(4_000)),
        constraint("minimum_cash_rupiah", rupiah(5_000_000n)),
      ]),
      policy: { minimumCashRupiah: rupiah(5_000_000n), newBorrowingAllowed: false, defaultHorizonDays: 30 },
      approvedApprovalCodes: [],
    });
    expect(result).toMatchObject({
      outcome: "DOES_NOT_COMPILE",
      reasonCode: "NEW_BORROWING_PROHIBITED",
      firstViolationDate: "2026-09-15",
      shortfallRupiah: 10_000_000n,
    });
    expect(result.evaluations.some((item) => item.reasonCode === "MINIMUM_CASH_VIOLATION" && item.violationDate === "2026-09-15" && item.shortfallRupiah === 15_000_000n)).toBe(true);
    expect(result.evaluations.some((item) => item.reasonCode === "CUSTOMER_DEPOSIT_LIMIT" && item.violationDate === "2026-09-16")).toBe(true);
  });

  it("selects the same chronological primary failure regardless of constraint input order", () => {
    const cashEvents = [
      event("opening", "2026-09-12", "inflow", 30_000_000n, { eventClass: "opening_balance", certainty: "confirmed", sameDayOrder: 0, orderingSource: "explicit" }),
      event("existing-ap", "2026-09-15", "outflow", 40_000_000n),
    ];
    const items = [
      constraint("required_inventory_available", { productId: "product-a", warehouseId: "warehouse-a", quantity: 1 }),
      constraint("customer_deposit_max_bps", basisPoints(4_000)),
      constraint("minimum_cash_rupiah", rupiah(5_000_000n)),
    ];
    const permutations = [items, [...items].reverse(), [items[2], items[0], items[1]], [items[1], items[0], items[2]]];
    const results = permutations.map((order) => compileDeal({
      snapshot: snapshot(cashEvents, 0),
      terms: terms(4_100),
      constraints: constraints(order),
      policy: { minimumCashRupiah: rupiah(5_000_000n), newBorrowingAllowed: false, defaultHorizonDays: 30 },
      approvedApprovalCodes: [],
    }));
    for (const result of results) {
      expect(result).toMatchObject({
        outcome: "DOES_NOT_COMPILE",
        reasonCode: "NEW_BORROWING_PROHIBITED",
        firstViolationDate: "2026-09-15",
        shortfallRupiah: 10_000_000n,
      });
    }
  });
});
