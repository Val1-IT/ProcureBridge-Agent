import { describe, expect, it } from "vitest";
import type { DatedCashEvent } from "../../../lib/dealtwin/domain/cash-event";
import { isoDate } from "../../../lib/dealtwin/domain/date";
import { rupiah } from "../../../lib/dealtwin/domain/money";
import { buildPlanningHorizon } from "../../../lib/dealtwin/compiler/horizon";

function event(id: string, date: string, material = true): DatedCashEvent {
  return { eventId: id, dependencyKey: `dep:${id}`, date: isoDate(date), sameDayOrder: 300, direction: "outflow", amountRupiah: rupiah(1n), certainty: "expected", eventClass: "projected", orderingSource: "conservative", material };
}

describe("planning horizon", () => {
  it("uses the default 30-day horizon when no later material dependency exists", () => {
    expect(buildPlanningHorizon(isoDate("2026-09-12"), [event("inside", "2026-10-12")])).toBe("2026-10-12");
  });

  it("expands to a decision-relevant 31st-day obligation and ignores irrelevant events", () => {
    expect(buildPlanningHorizon(isoDate("2026-09-12"), [event("day-31", "2026-10-13"), event("irrelevant", "2026-12-31", false)])).toBe("2026-10-13");
  });
});
