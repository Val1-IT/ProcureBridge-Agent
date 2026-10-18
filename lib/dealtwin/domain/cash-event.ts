import { isoDate, type IsoDate } from "./date";
import type { OrderingSource } from "./deal-terms";
import type { Rupiah } from "./money";
import type { Result } from "./result";

export type CashEventCertainty = "confirmed" | "reserved" | "expected" | "assumption";
export type CashEventDirection = "inflow" | "outflow";
export type CashEventClass = "opening_balance" | "cash_movement" | "commitment" | "projected";

interface CashEventBase {
  readonly eventId: string;
  readonly dependencyKey: string;
  readonly date: IsoDate;
  readonly sameDayOrder: number;
  readonly amountRupiah: Rupiah;
  readonly orderingSource: OrderingSource;
  readonly material: boolean;
}

export type DatedCashEvent = CashEventBase & (
  | { readonly eventClass: "opening_balance"; readonly direction: "inflow"; readonly certainty: "confirmed" }
  | { readonly eventClass: "cash_movement"; readonly direction: CashEventDirection; readonly certainty: "confirmed" }
  | { readonly eventClass: "commitment"; readonly direction: CashEventDirection; readonly certainty: "reserved" }
  | { readonly eventClass: "projected"; readonly direction: CashEventDirection; readonly certainty: "expected" | "assumption" }
);

type CashEventOrderingInput = {
  readonly eventClass: CashEventClass;
  readonly direction: CashEventDirection;
  readonly certainty: CashEventCertainty;
};

export function conservativeSameDayOrder(event: CashEventOrderingInput): number {
  if (event.eventClass === "opening_balance" && event.direction === "inflow" && event.certainty === "confirmed") return 0;
  if (event.eventClass === "cash_movement" && event.certainty === "confirmed") return event.direction === "outflow" ? 100 : 400;
  if (event.eventClass === "commitment" && event.certainty === "reserved") return event.direction === "outflow" ? 200 : 500;
  if (event.eventClass === "projected" && (event.certainty === "expected" || event.certainty === "assumption")) {
    return event.direction === "outflow" ? 300 : 500;
  }
  throw new Error("Cash event class, direction, and certainty do not have a conservative order.");
}

export function sortCashEvents(events: readonly DatedCashEvent[]): readonly DatedCashEvent[] {
  return [...events].sort((left, right) => {
    if (left.date !== right.date) return left.date < right.date ? -1 : 1;
    if (left.sameDayOrder !== right.sameDayOrder) return left.sameDayOrder - right.sameDayOrder;
    return left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0;
  });
}

function invalid(code: "INVALID_CASH_EVENT" | "DUPLICATE_CASH_EVENT" | "UNRESOLVED_SAME_DAY_ORDER", message: string): Result<readonly DatedCashEvent[]> {
  return { ok: false, error: { code, message } };
}

function canonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function validEventShape(event: DatedCashEvent): boolean {
  if (!canonicalText(event.eventId) || !canonicalText(event.dependencyKey)) return false;
  try {
    isoDate(event.date);
  } catch {
    return false;
  }
  if (!Number.isSafeInteger(event.sameDayOrder) || event.sameDayOrder < 0) return false;
  if (typeof event.amountRupiah !== "bigint" || event.amountRupiah <= 0n) return false;
  if (!["inflow", "outflow"].includes(event.direction)) return false;
  if (!["confirmed", "reserved", "expected", "assumption"].includes(event.certainty)) return false;
  if (!["opening_balance", "cash_movement", "commitment", "projected"].includes(event.eventClass)) return false;
  if (!["explicit", "conservative", "unresolved"].includes(event.orderingSource)) return false;
  if (typeof event.material !== "boolean") return false;
  if (event.eventClass === "opening_balance" && (event.direction !== "inflow" || event.certainty !== "confirmed")) return false;
  if (event.eventClass === "cash_movement" && event.certainty !== "confirmed") return false;
  if (event.eventClass === "commitment" && event.certainty !== "reserved") return false;
  if (event.eventClass === "projected" && event.certainty !== "expected" && event.certainty !== "assumption") return false;
  if (event.eventClass === "opening_balance" && event.sameDayOrder !== 0) return false;
  if (event.eventClass !== "opening_balance" && event.sameDayOrder === 0) return false;
  return true;
}

export function validateCashEventOrdering(events: readonly DatedCashEvent[]): Result<readonly DatedCashEvent[]> {
  if (events.some((event) => !event || !validEventShape(event))) {
    return invalid("INVALID_CASH_EVENT", "Cash event does not match the locked event contract.");
  }
  const ids = events.map((event) => event.eventId);
  if (new Set(ids).size !== ids.length) return invalid("DUPLICATE_CASH_EVENT", "Cash event IDs must be unique.");
  for (const event of events) {
    if (event.orderingSource === "unresolved" && event.material) {
      return invalid("UNRESOLVED_SAME_DAY_ORDER", "Material cash event ordering must be resolved before compilation.");
    }
    if (event.orderingSource === "conservative") {
      let expected: number;
      try {
        expected = conservativeSameDayOrder(event);
      } catch {
        return invalid("INVALID_CASH_EVENT", "Cash event cannot use conservative ordering for this class and certainty.");
      }
      if (event.sameDayOrder !== expected) {
        return invalid("INVALID_CASH_EVENT", "Cash event same-day order does not match its conservative class.");
      }
    }
  }
  return { ok: true, value: sortCashEvents(events) };
}
