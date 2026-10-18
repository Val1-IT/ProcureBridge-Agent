import { describe, expect, it } from "vitest";
import type { DatedCashEvent } from "../../../lib/dealtwin/domain/cash-event";
import { isoDate } from "../../../lib/dealtwin/domain/date";
import type { DealTermsV1 } from "../../../lib/dealtwin/domain/deal-terms";
import { rupiah } from "../../../lib/dealtwin/domain/money";
import { basisPoints } from "../../../lib/dealtwin/domain/rate";
import type { CompilerPolicy } from "../../../lib/dealtwin/domain/policy";
import type { CanonicalErpSnapshot } from "../../../lib/dealtwin/erp/build-snapshot";
import { buildTimeline } from "../../../lib/dealtwin/compiler/timeline";
import { walkBalances } from "../../../lib/dealtwin/compiler/balance-walk";

function event(overrides: Partial<DatedCashEvent> & Pick<DatedCashEvent, "eventId" | "date" | "direction" | "amountRupiah">): DatedCashEvent {
  return {
    dependencyKey: `dep:${overrides.eventId}`, sameDayOrder: overrides.direction === "outflow" ? 300 : 500,
    certainty: "expected", eventClass: "projected", orderingSource: "conservative", material: true, ...overrides,
  } as DatedCashEvent;
}

function snapshot(events: readonly DatedCashEvent[]): CanonicalErpSnapshot {
  return { cashEvents: events, openingBalanceRupiah: rupiah(30_000_000n), requestedHorizonEnd: isoDate("2026-10-12") } as CanonicalErpSnapshot;
}

function terms(overrides: { depositBps?: number; balanceDate?: string; costDate?: string; revenue?: bigint; cost?: bigint } = {}): DealTermsV1 {
  const revenue = overrides.revenue ?? 60_000_000n;
  const balanceDate = overrides.balanceDate ?? "2026-09-30";
  const costDate = overrides.costDate ?? "2026-09-22";
  return {
    schemaVersion: "dealtwin.deal-terms.v1", currency: "IDR", customerId: "customer-a", warehouseId: "warehouse-a", acceptedDate: isoDate("2026-09-16"),
    productLines: [{ lineId: "line-a", productId: "product-a", quantity: 1, unitPriceRupiah: rupiah(revenue) }],
    customerPaymentEvents: [
      { eventId: "deal:deposit", role: "customer_deposit", basisPoints: basisPoints(overrides.depositBps ?? 2_000), daysFromAcceptance: 0, effectiveDate: isoDate("2026-09-16"), sameDayOrder: 500 },
      { eventId: "deal:balance", role: "customer_balance", basisPoints: basisPoints(10_000 - (overrides.depositBps ?? 2_000)), daysFromAcceptance: Number(balanceDate.slice(-2)) - 16, effectiveDate: isoDate(balanceDate), sameDayOrder: 500 },
    ],
    directCostEvents: [{ eventId: "deal:cost", role: "direct_cost", supplierId: "supplier-a", productLineIds: ["line-a"], amountRupiah: rupiah(overrides.cost ?? 42_000_000n), daysFromAcceptance: Number(costDate.slice(-2)) - 16, effectiveDate: isoDate(costDate), sameDayOrder: 300, orderingSource: "conservative", provenance: { sourceType: "deal_terms", sourceId: "cost-a", sourceRevision: "1", evidence: "Confirmed direct cost" } }],
  };
}

const policy: CompilerPolicy = { minimumCashRupiah: rupiah(5_000_000n), newBorrowingAllowed: false, defaultHorizonDays: 30 };

describe("exact financial timeline", () => {
  it("returns every exact intermediate confirmed and projected balance", () => {
    const result = buildTimeline(snapshot([
      event({ eventId: "opening", date: isoDate("2026-09-12"), direction: "inflow", amountRupiah: rupiah(30_000_000n), eventClass: "opening_balance", certainty: "confirmed", sameDayOrder: 0, orderingSource: "explicit" }),
      event({ eventId: "existing-ap", date: isoDate("2026-09-15"), direction: "outflow", amountRupiah: rupiah(18_000_000n) }),
      event({ eventId: "existing-ar", date: isoDate("2026-09-20"), direction: "inflow", amountRupiah: rupiah(20_000_000n) }),
    ]), terms(), policy);
    expect(result).toMatchObject({ ok: true, value: { minimumConfirmedBalance: 30_000_000n, minimumProjectedBalance: 2_000_000n } });
    if (!result.ok) return;
    expect(result.value.points.map((point) => [point.eventId, point.confirmedBalanceAfter, point.projectedBalanceAfter])).toEqual([
      ["opening", 30_000_000n, 30_000_000n],
      ["existing-ap", 30_000_000n, 12_000_000n],
      ["deal:deposit", 30_000_000n, 24_000_000n],
      ["existing-ar", 30_000_000n, 44_000_000n],
      ["deal:cost", 30_000_000n, 2_000_000n],
      ["deal:balance", 30_000_000n, 50_000_000n],
    ]);
    expect(walkBalances(result.value)).toEqual(result.value.points);
  });

  it("orders same-day outflows before inflows and uses stable event IDs as the final tie-break", () => {
    const result = buildTimeline(snapshot([
      event({ eventId: "opening", date: isoDate("2026-09-12"), direction: "inflow", amountRupiah: rupiah(10n), eventClass: "opening_balance", certainty: "confirmed", sameDayOrder: 0, orderingSource: "explicit" }),
      event({ eventId: "z-out", date: isoDate("2026-09-22"), direction: "outflow", amountRupiah: rupiah(3n) }),
      event({ eventId: "a-out", date: isoDate("2026-09-22"), direction: "outflow", amountRupiah: rupiah(4n) }),
      event({ eventId: "same-day-in", date: isoDate("2026-09-22"), direction: "inflow", amountRupiah: rupiah(20n) }),
    ]), terms({ depositBps: 0, revenue: 1n, cost: 1n, costDate: "2026-09-23", balanceDate: "2026-09-22" }), policy);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.value.events.filter((row) => row.date === "2026-09-22").map((row) => row.eventId)).toEqual(["a-out", "z-out", "deal:balance", "same-day-in"]);
    expect(result.value.minimumProjectedBalance).toBe(3n);
  });

  it("preserves negative balances and bigint values above Number.MAX_SAFE_INTEGER", () => {
    const huge = BigInt(Number.MAX_SAFE_INTEGER) + 100n;
    const result = buildTimeline(snapshot([
      event({ eventId: "opening", date: isoDate("2026-09-12"), direction: "inflow", amountRupiah: rupiah(huge), eventClass: "opening_balance", certainty: "confirmed", sameDayOrder: 0, orderingSource: "explicit" }),
      event({ eventId: "huge-out", date: isoDate("2026-09-13"), direction: "outflow", amountRupiah: rupiah(huge + 5n) }),
    ]), terms({ depositBps: 0, revenue: 1n, cost: 1n }), policy);
    expect(result).toMatchObject({ ok: true, value: { minimumProjectedBalance: -6n } });
    if (!result.ok) return;
    expect(result.value.firstProjectedNegativePoint).toMatchObject({ eventId: "huge-out", projectedBalanceAfter: -5n });
  });

  it("fails closed for unresolved material ordering", () => {
    const unresolved = event({ eventId: "unresolved", date: isoDate("2026-09-13"), direction: "outflow", amountRupiah: rupiah(1n), orderingSource: "unresolved", sameDayOrder: 300 });
    expect(buildTimeline(snapshot([unresolved]), terms(), policy)).toMatchObject({ ok: false, error: { code: "UNRESOLVED_SAME_DAY_ORDER" } });
  });
});
