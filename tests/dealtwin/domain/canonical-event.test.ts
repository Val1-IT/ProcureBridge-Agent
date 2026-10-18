import { describe, expect, it } from "vitest";
import { canonicalCashEventDto, hashCanonicalCashEvents } from "../../../lib/dealtwin/domain/canonical-event";
import type { DatedCashEvent } from "../../../lib/dealtwin/domain/cash-event";
import { isoDate } from "../../../lib/dealtwin/domain/date";
import { rupiah } from "../../../lib/dealtwin/domain/money";
import { sha256Canonical } from "../../../lib/dealtwin/domain/canonical-json";

function event(overrides: Partial<DatedCashEvent> = {}): DatedCashEvent {
  return {
    eventId: "commitment-a:cost",
    dependencyKey: "dealtwin.commitment:commitment-a",
    date: isoDate("2026-09-23"),
    sameDayOrder: 200,
    direction: "outflow",
    amountRupiah: rupiah(5_000_000n),
    certainty: "reserved",
    eventClass: "commitment",
    orderingSource: "explicit",
    material: true,
    ...overrides,
  } as DatedCashEvent;
}

describe("canonical commitment event hash", () => {
  it("encodes bigint money as a canonical decimal string before hashing", () => {
    const dto = canonicalCashEventDto(event({ amountRupiah: rupiah(9_007_199_254_740_993n) }));
    expect(dto).toMatchObject({ amountRupiah: "9007199254740993" });
    expect(hashCanonicalCashEvents([event({ amountRupiah: rupiah(9_007_199_254_740_993n) })])).toBe(sha256Canonical([dto]));
  });

  it("is stable under event-order permutation of the same payload", () => {
    const first = event({ eventId: "commitment-a:cost", sameDayOrder: 200, date: isoDate("2026-09-23") });
    const second = event({ eventId: "commitment-a:deposit", sameDayOrder: 500, date: isoDate("2026-09-23"), direction: "inflow" });
    expect(hashCanonicalCashEvents([second, first])).toBe(hashCanonicalCashEvents([first, second]));
  });

  it("changes when an event amount changes", () => {
    expect(hashCanonicalCashEvents([event({ amountRupiah: rupiah(5_000_001n) })])).not.toBe(hashCanonicalCashEvents([event()]));
  });
});
