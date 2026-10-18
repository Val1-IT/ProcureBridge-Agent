import { describe, expect, it } from "vitest";

import { addCalendarDays, compareIsoDate, isoDate } from "../../../lib/dealtwin/domain/date";
import { formatRupiahDto, nonNegativeRupiah, parseRupiah, rupiah } from "../../../lib/dealtwin/domain/money";
import { applyRateCeil, applyRateFloor, basisPoints } from "../../../lib/dealtwin/domain/rate";

describe("exact rupiah values", () => {
  it("preserves signed balances and values beyond Number.MAX_SAFE_INTEGER", () => {
    expect(rupiah(-5n)).toBe(-5n);
    expect(formatRupiahDto(parseRupiah("9007199254740993"))).toBe("9007199254740993");
  });

  it("requires non-negative transaction amounts", () => {
    expect(nonNegativeRupiah(0n)).toBe(0n);
    expect(nonNegativeRupiah(42n)).toBe(42n);
    expect(() => nonNegativeRupiah(-1n)).toThrowError("Rupiah amount must be non-negative.");
  });

  it.each(["", " 1", "1 ", "+1", "01", "-0", "1.5", "1e3", "1,000", "Rp1000"])(
    "rejects non-canonical rupiah input %j",
    (value) => {
      expect(() => parseRupiah(value)).toThrowError("Rupiah must be a canonical base-10 integer.");
    },
  );
});

describe("basis-point rates", () => {
  it("represents forty percent as 4,000 integer basis points", () => {
    expect(basisPoints(4_000)).toBe(4_000);
  });

  it.each([-1, 10_001, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid basis points %s", (value) => {
    expect(() => basisPoints(value)).toThrowError("Basis points must be an integer from 0 through 10000.");
  });

  it("rounds conservative inflows down and outflows up with bigint arithmetic", () => {
    const amount = rupiah(10_001n);
    const rate = basisPoints(3_333);

    expect(applyRateFloor(amount, rate)).toBe(3_333n);
    expect(applyRateCeil(amount, rate)).toBe(3_334n);
  });
});

describe("ISO calendar dates", () => {
  it("validates real calendar dates including leap years", () => {
    expect(isoDate("2028-02-29")).toBe("2028-02-29");
    expect(() => isoDate("2027-02-29")).toThrowError("Date must be a valid ISO calendar date.");
    expect(() => isoDate("2026-2-09")).toThrowError("Date must be a valid ISO calendar date.");
  });

  it("adds calendar days deterministically across month and leap-year boundaries", () => {
    expect(addCalendarDays(isoDate("2028-02-28"), 1)).toBe("2028-02-29");
    expect(addCalendarDays(isoDate("2028-02-28"), 2)).toBe("2028-03-01");
    expect(addCalendarDays(isoDate("2026-01-01"), -1)).toBe("2025-12-31");
  });

  it("rejects fractional day offsets and compares canonical dates", () => {
    expect(() => addCalendarDays(isoDate("2026-01-01"), 1.5)).toThrowError("Calendar-day offset must be a safe integer.");
    expect(compareIsoDate(isoDate("2026-01-01"), isoDate("2026-01-02"))).toBe(-1);
    expect(compareIsoDate(isoDate("2026-01-02"), isoDate("2026-01-02"))).toBe(0);
  });
});
