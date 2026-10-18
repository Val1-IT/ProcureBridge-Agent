import { describe, expect, it } from "vitest";
import { compileDeal } from "../../../lib/dealtwin/compiler/compile-deal";
import { calculateCustomerPaymentAmounts } from "../../../lib/dealtwin/domain/deal-terms";
import { createJudgeFixture } from "../fixtures/judge-scenario";

describe("locked DealTwin Judge financial scenario", () => {
  it("locks the canonical synthetic ERP facts and dates", () => {
    const scenario = createJudgeFixture();
    expect(scenario.tenantId).toBe("dealtwin-judge-v1");
    expect(scenario.expected).toMatchObject({
      openingCashRupiah: 30_000_000n, existingPayableRupiah: 18_000_000n, mutatedPayableRupiah: 19_000_000n,
      existingReceivableRupiah: 20_000_000n, minimumCashRupiah: 5_000_000n,
      revenueRupiah: 60_000_000n, directCostRupiah: 42_000_000n, maximumDepositBps: 4_000,
    });
    expect(scenario.snapshot.cashEvents.map((event) => [event.eventId, event.date, event.sameDayOrder, event.amountRupiah])).toEqual([
      ["cash-opening:judge-cash:2026-09-12", "2026-09-12", 0, 30_000_000n],
      ["payable:judge-existing-po", "2026-09-15", 300, 18_000_000n],
      ["receivable:judge-existing-so", "2026-09-20", 500, 20_000_000n],
    ]);
    expect(scenario.snapshot.inventory.find((item) => item.productId === "judge-product-a" && item.warehouseId === "judge-warehouse"))
      .toMatchObject({ physicalQuantity: 0, reservedQuantity: 0, availableQuantity: 0 });
  });

  it("computes the profitable-looking initial Deal A as an exact Rp3m floor failure", () => {
    const scenario = createJudgeFixture();
    expect(calculateCustomerPaymentAmounts(scenario.initialTermsA)).toMatchObject({ revenueRupiah: 60_000_000n, depositRupiah: 12_000_000n, balanceRupiah: 48_000_000n });
    expect(scenario.expected.revenueRupiah - scenario.expected.directCostRupiah).toBe(18_000_000n);
    expect(compileDeal({ snapshot: scenario.snapshot, terms: scenario.initialTermsA, constraints: scenario.constraints, policy: scenario.policy, approvedApprovalCodes: [] })).toMatchObject({
      outcome: "DOES_NOT_COMPILE", reasonCode: "MINIMUM_CASH_VIOLATION", firstViolationDate: "2026-09-22",
      shortfallRupiah: 3_000_000n, timeline: { minimumProjectedBalance: 2_000_000n },
    });
    expect(scenario.initialResult).toMatchObject({ outcome: "DOES_NOT_COMPILE", shortfallRupiah: 3_000_000n });
  });

  it("compiles the explicit 25 percent candidate to exactly the Rp5m floor", () => {
    const scenario = createJudgeFixture();
    expect(calculateCustomerPaymentAmounts(scenario.candidateTermsA)).toMatchObject({ depositRupiah: 15_000_000n, balanceRupiah: 45_000_000n });
    const result = compileDeal({ snapshot: scenario.snapshot, terms: scenario.candidateTermsA, constraints: scenario.constraints, policy: scenario.policy, approvedApprovalCodes: [] });
    expect(result).toMatchObject({ outcome: "CONDITIONALLY_VALID", reasonCode: "APPROVAL_REQUIRED", timeline: { minimumProjectedBalance: 5_000_000n } });
    expect(result.timeline?.points.find((point) => point.eventId === "deal-a:direct-cost")).toMatchObject({
      date: "2026-09-22", projectedBalanceAfter: 5_000_000n,
    });
    expect(scenario.candidateResult).toMatchObject({ outcome: "CONDITIONALLY_VALID", timeline: { minimumProjectedBalance: 5_000_000n } });
  });

  it("locks Deal A and collision Deal B terms without reading a runtime clock", () => {
    const first = createJudgeFixture();
    const second = createJudgeFixture();
    expect(second).toEqual(first);
    expect(first.initialTermsA).toMatchObject({ acceptedDate: "2026-09-16", customerPaymentEvents: [
      { eventId: "deal-a:deposit", basisPoints: 2_000, effectiveDate: "2026-09-16", sameDayOrder: 500 },
      { eventId: "deal-a:balance", basisPoints: 8_000, effectiveDate: "2026-09-30", sameDayOrder: 500 },
    ], directCostEvents: [{ eventId: "deal-a:direct-cost", amountRupiah: 42_000_000n, effectiveDate: "2026-09-22", sameDayOrder: 300 }] });
    expect(first.collisionTermsB).toMatchObject({ acceptedDate: "2026-09-16", productLines: [{ productId: "judge-product-b", unitPriceRupiah: 8_000_000n }], customerPaymentEvents: [
      { basisPoints: 0, effectiveDate: "2026-09-16", sameDayOrder: 500 },
      { basisPoints: 10_000, effectiveDate: "2026-10-05", sameDayOrder: 500 },
    ], directCostEvents: [{ amountRupiah: 5_000_000n, effectiveDate: "2026-09-23", sameDayOrder: 300 }] });
    expect(first.apMutationState.supplierInvoices.find((invoice) => invoice.id === "judge-existing-ap")?.totalAmount).toBe(19_000_000);
  });
});
