import { describe, expect, it } from "vitest";

import {
  conservativeSameDayOrder,
  sortCashEvents,
  validateCashEventOrdering,
  type CashEventCertainty,
  type CashEventClass,
  type CashEventDirection,
  type DatedCashEvent,
} from "../../../lib/dealtwin/domain/cash-event";
import { isoDate } from "../../../lib/dealtwin/domain/date";
import { rupiah } from "../../../lib/dealtwin/domain/money";

type CashEventFixture = Omit<DatedCashEvent, "eventClass" | "direction" | "certainty"> & {
  readonly eventClass: CashEventClass;
  readonly direction: CashEventDirection;
  readonly certainty: CashEventCertainty;
};

function event(overrides: Partial<CashEventFixture> = {}): DatedCashEvent {
  const fixture: CashEventFixture = {
    eventId: "event-a",
    dependencyKey: "erp.invoice:invoice-a",
    date: isoDate("2026-09-22"),
    sameDayOrder: 300,
    direction: "outflow",
    amountRupiah: rupiah(1n),
    certainty: "expected",
    eventClass: "projected",
    orderingSource: "conservative",
    material: true,
    ...overrides,
  };
  return fixture as DatedCashEvent;
}

describe("conservative same-day classes", () => {
  it.each([
    [event({ eventClass: "opening_balance", direction: "inflow", certainty: "confirmed" }), 0],
    [event({ eventClass: "cash_movement", direction: "outflow", certainty: "confirmed" }), 100],
    [event({ eventClass: "commitment", direction: "outflow", certainty: "reserved" }), 200],
    [event({ eventClass: "projected", direction: "outflow", certainty: "expected" }), 300],
    [event({ eventClass: "cash_movement", direction: "inflow", certainty: "confirmed" }), 400],
    [event({ eventClass: "projected", direction: "inflow", certainty: "expected" }), 500],
  ] as const)("assigns %s to order %s", (input, expected) => {
    expect(conservativeSameDayOrder(input)).toBe(expected);
  });

  it("never defaults an expected inflow ahead of an expected outflow", () => {
    const outflow = event({ eventId: "out", direction: "outflow", sameDayOrder: 300 });
    const inflow = event({ eventId: "in", direction: "inflow", sameDayOrder: 500 });

    const result = validateCashEventOrdering([inflow, outflow]);
    expect(result.ok && result.value.map((item) => item.eventId)).toEqual(["out", "in"]);
  });
});

describe("cash-event ordering", () => {
  it("sorts by date, same-day order, then stable event ID without mutating input", () => {
    const input = [
      event({ eventId: "z", date: isoDate("2026-09-23"), orderingSource: "explicit" }),
      event({ eventId: "b", sameDayOrder: 400, direction: "inflow", certainty: "confirmed", eventClass: "cash_movement" }),
      event({ eventId: "a", sameDayOrder: 400, direction: "inflow", certainty: "confirmed", eventClass: "cash_movement" }),
    ];

    expect(sortCashEvents(input).map((item) => item.eventId)).toEqual(["a", "b", "z"]);
    expect(input.map((item) => item.eventId)).toEqual(["z", "b", "a"]);
  });

  it("produces the same order for every input permutation", () => {
    const values = [
      event({ eventId: "c", sameDayOrder: 500, direction: "inflow" }),
      event({ eventId: "a", sameDayOrder: 100, certainty: "confirmed", eventClass: "cash_movement" }),
      event({ eventId: "b", sameDayOrder: 300 }),
    ];
    const permutations = [values, [values[2], values[0], values[1]], [...values].reverse()];

    for (const permutation of permutations) {
      const result = validateCashEventOrdering(permutation);
      expect(result.ok && result.value.map((item) => item.eventId)).toEqual(["a", "b", "c"]);
    }
  });

  it("returns UNRESOLVED_SAME_DAY_ORDER for material unresolved ordering", () => {
    expect(validateCashEventOrdering([event({ orderingSource: "unresolved" })]))
      .toMatchObject({ ok: false, error: { code: "UNRESOLVED_SAME_DAY_ORDER" } });
  });

  it("permits unresolved ordering only when explicitly non-material", () => {
    const result = validateCashEventOrdering([event({ orderingSource: "unresolved", material: false })]);
    expect(result.ok).toBe(true);
  });

  it("rejects a conservative order that would favor an inflow", () => {
    expect(validateCashEventOrdering([event({ direction: "inflow", sameDayOrder: 100 })]))
      .toMatchObject({ ok: false, error: { code: "INVALID_CASH_EVENT" } });
  });

  it("rejects class semantics that conflict even when ordering provenance is explicit", () => {
    expect(validateCashEventOrdering([
      event({
        eventClass: "opening_balance",
        direction: "outflow",
        certainty: "expected",
        sameDayOrder: 0,
        orderingSource: "explicit",
      }),
    ])).toMatchObject({ ok: false, error: { code: "INVALID_CASH_EVENT" } });
  });

  it("rejects duplicate IDs and invalid exact event fields", () => {
    const duplicate = event();
    expect(validateCashEventOrdering([duplicate, { ...duplicate }])).toMatchObject({ ok: false, error: { code: "DUPLICATE_CASH_EVENT" } });
    expect(validateCashEventOrdering([event({ amountRupiah: rupiah(0n) })])).toMatchObject({ ok: false, error: { code: "INVALID_CASH_EVENT" } });
    expect(validateCashEventOrdering([event({ sameDayOrder: 1.5, orderingSource: "explicit" })])).toMatchObject({ ok: false, error: { code: "INVALID_CASH_EVENT" } });
  });
});
