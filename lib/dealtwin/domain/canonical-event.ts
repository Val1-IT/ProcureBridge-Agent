import { sortCashEvents, type DatedCashEvent } from "./cash-event";
import { sha256Canonical, type CanonicalJsonValue } from "./canonical-json";
import { formatRupiahDto } from "./money";

export function canonicalCashEventDto(event: DatedCashEvent): CanonicalJsonValue {
  return {
    amountRupiah: formatRupiahDto(event.amountRupiah),
    certainty: event.certainty,
    date: event.date,
    dependencyKey: event.dependencyKey,
    direction: event.direction,
    eventClass: event.eventClass,
    eventId: event.eventId,
    material: event.material,
    orderingSource: event.orderingSource,
    sameDayOrder: event.sameDayOrder,
  };
}

export function hashCanonicalCashEvents(events: readonly DatedCashEvent[]): string {
  return sha256Canonical(sortCashEvents(events).map(canonicalCashEventDto));
}
