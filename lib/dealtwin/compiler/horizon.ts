import type { DatedCashEvent } from "../domain/cash-event";
import { addCalendarDays, type IsoDate } from "../domain/date";

export function buildPlanningHorizon(asOfDate: IsoDate, events: readonly DatedCashEvent[]): IsoDate {
  return events.filter((event) => event.material).reduce(
    (latest, event) => event.date > latest ? event.date : latest,
    addCalendarDays(asOfDate, 30),
  );
}
