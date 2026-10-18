import type { IsoDate } from "../domain/date";
import type { Rupiah } from "../domain/money";
import { rupiah } from "../domain/money";
import type { FinancialTimeline } from "./timeline";

export interface LiquidityPoint {
  readonly eventId: string;
  readonly date: IsoDate;
  readonly confirmedBalanceBefore: Rupiah;
  readonly confirmedBalanceAfter: Rupiah;
  readonly projectedBalanceBefore: Rupiah;
  readonly projectedBalanceAfter: Rupiah;
}

export function walkBalances(timeline: FinancialTimeline): readonly LiquidityPoint[] {
  let confirmed = rupiah(0n);
  let projected = rupiah(0n);
  return timeline.events.map((event) => {
    const confirmedBefore = confirmed;
    const projectedBefore = projected;
    const signed = event.direction === "inflow" ? event.amountRupiah : -event.amountRupiah;
    if (event.eventClass === "opening_balance" || event.eventClass === "cash_movement") {
      confirmed = rupiah(confirmed + signed);
    }
    projected = rupiah(projected + signed);
    return {
      eventId: event.eventId,
      date: event.date,
      confirmedBalanceBefore: confirmedBefore,
      confirmedBalanceAfter: confirmed,
      projectedBalanceBefore: projectedBefore,
      projectedBalanceAfter: projected,
    };
  });
}
