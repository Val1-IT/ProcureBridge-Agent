import type { CompileInput } from '../compiler/compile-deal';
import type { IsoDate } from '../domain/date';
import type { Rupiah } from '../domain/money';
import { rupiah, parseRupiah } from '../domain/money';
import { isoDate, addCalendarDays } from '../domain/date';
import { applyRateCeil, basisPoints } from '../domain/rate';
import { calculateCustomerPaymentAmounts, type DealTermsV1 } from '../domain/deal-terms';
import type { DatedCashEvent } from '../domain/cash-event';
import type { CanonicalJsonValue } from '../domain/canonical-json';

export type StressScenario = { readonly schemaVersion: 'dealtwin.stress-scenario.v1'; readonly id: string } & (
  | { readonly type: 'customer_receipt_delay'; readonly days: number }
  | { readonly type: 'direct_outflow_increase'; readonly basisPoints: number }
  | { readonly type: 'specified_receipt_delay'; readonly eventId: string; readonly days: number }
  | { readonly type: 'new_obligation'; readonly amountRupiah: Rupiah; readonly date: IsoDate; readonly sameDayOrder: number }
);

function invalid(): never { throw new Error('INVALID_STRESS_SCENARIO'); }
function validate(scenario: StressScenario, asOfDate: IsoDate): void {
  if (!scenario || typeof scenario !== 'object' || scenario.schemaVersion !== 'dealtwin.stress-scenario.v1'
    || typeof scenario.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(scenario.id)) invalid();
  const days = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 36500;
  let fields: readonly string[];
  switch (scenario.type) {
    case 'customer_receipt_delay': if (!days(scenario.days)) invalid(); fields = ['days']; break;
    case 'specified_receipt_delay':
      if (!days(scenario.days) || typeof scenario.eventId !== 'string' || scenario.eventId.length === 0 || scenario.eventId.trim() !== scenario.eventId) invalid();
      fields = ['eventId','days']; break;
    case 'direct_outflow_increase':
      if (!Number.isSafeInteger(scenario.basisPoints) || scenario.basisPoints < 0 || scenario.basisPoints > 10000) invalid();
      fields = ['basisPoints']; break;
    case 'new_obligation':
      try { isoDate(scenario.date); } catch { invalid(); }
      if (scenario.date < asOfDate || typeof scenario.amountRupiah !== 'bigint' || scenario.amountRupiah <= 0n
        || !Number.isSafeInteger(scenario.sameDayOrder) || scenario.sameDayOrder <= 0) invalid();
      fields = ['date','sameDayOrder','amountRupiah']; break;
    default: invalid();
  }
  if (Object.keys(scenario).some(key => !['id','type','schemaVersion',...fields].includes(key))) invalid();
}
export function encodeStressScenario(scenario: StressScenario): CanonicalJsonValue {
  return scenario.type === 'new_obligation' ? { ...scenario, amountRupiah: scenario.amountRupiah.toString() } : { ...scenario };
}
export function decodeStressScenario(value: CanonicalJsonValue): StressScenario {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const row = value as { readonly [key: string]: CanonicalJsonValue }; // readonly arrays need an explicit TS narrowing after the runtime guard.
  if (row.type === 'new_obligation') {
    if (typeof row.amountRupiah !== 'string' || typeof row.date !== 'string') invalid();
    try { return { ...row, amountRupiah: parseRupiah(row.amountRupiah), date: isoDate(row.date) } as StressScenario; }
    catch { invalid(); }
  }
  return { ...row } as StressScenario; // Complete shape/target validation occurs against the replayed base input.
}
export function applyStressTransform(input: CompileInput, scenario: StressScenario): CompileInput {
  validate(scenario, input.snapshot.asOfDate);
  if (input.stressScenario) invalid(); // Each named run is independent, never an ambiguous stacked transform.
  if (scenario.type === 'specified_receipt_delay') {
    const amounts = calculateCustomerPaymentAmounts(input.terms);
    const candidate = input.terms.customerPaymentEvents.find(item => item.eventId === scenario.eventId);
    const present = candidate && (candidate.role === 'customer_deposit' ? amounts.depositRupiah > 0n : amounts.balanceRupiah > 0n);
    const external = input.snapshot.cashEvents.find(item => item.eventId === scenario.eventId && item.eventClass === 'projected' && item.direction === 'inflow' && item.certainty === 'expected');
    if (!present && !external) invalid();
  }
  return { ...structuredClone(input), stressScenario: structuredClone(scenario) };
}
export function applyStressToEvents(events: readonly DatedCashEvent[], terms: DealTermsV1, asOfDate: IsoDate, scenario: StressScenario): readonly DatedCashEvent[] {
  validate(scenario, asOfDate);
  const receipts = new Set(terms.customerPaymentEvents.map(item => item.eventId));
  const costs = new Set(terms.directCostEvents.map(item => item.eventId));
  if (scenario.type === 'specified_receipt_delay' && !events.some(item => item.eventId === scenario.eventId && item.eventClass === 'projected' && item.direction === 'inflow' && item.certainty === 'expected')) invalid();
  if (scenario.type === 'new_obligation') {
    const id = `stress:${scenario.id}:obligation`; if (events.some(item => item.eventId === id)) invalid();
    return [...events, { eventId: id, dependencyKey: `stress:obligation:${scenario.id}`, date: scenario.date,
      sameDayOrder: scenario.sameDayOrder, direction: 'outflow', amountRupiah: scenario.amountRupiah,
      certainty: 'assumption', eventClass: 'projected', orderingSource: 'explicit', material: true }];
  }
  return events.map(item => {
    if ((scenario.type === 'customer_receipt_delay' && receipts.has(item.eventId) && item.dependencyKey === `deal:event:${item.eventId}`)
      || (scenario.type === 'specified_receipt_delay' && item.eventId === scenario.eventId)) {
      return { ...item, date: addCalendarDays(item.date, scenario.days) };
    }
    if (scenario.type === 'direct_outflow_increase' && costs.has(item.eventId) && item.dependencyKey === `deal:event:${item.eventId}`) {
      return { ...item, amountRupiah: rupiah(item.amountRupiah + applyRateCeil(item.amountRupiah, basisPoints(scenario.basisPoints))) };
    }
    return { ...item };
  });
}
