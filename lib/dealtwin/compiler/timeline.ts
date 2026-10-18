import { validateCashEventOrdering, type DatedCashEvent } from "../domain/cash-event";
import { calculateCustomerPaymentAmounts, type DealTermsV1 } from "../domain/deal-terms";
import { rupiah, type Rupiah } from "../domain/money";
import { createCompilerPolicy, type CompilerPolicy } from "../domain/policy";
import type { Result } from "../domain/result";
import type { CanonicalErpSnapshot } from "../erp/build-snapshot";
import { walkBalances, type LiquidityPoint } from "./balance-walk";
import { applyStressToEvents, type StressScenario } from '../stress/stress-transform';

export interface FinancialTimeline {
  readonly events: readonly DatedCashEvent[];
  readonly points: readonly LiquidityPoint[];
  readonly minimumConfirmedBalance: Rupiah;
  readonly minimumProjectedBalance: Rupiah;
  readonly worstConfirmedPoint: LiquidityPoint | null;
  readonly worstProjectedPoint: LiquidityPoint | null;
  readonly firstConfirmedNegativePoint: LiquidityPoint | null;
  readonly firstProjectedNegativePoint: LiquidityPoint | null;
}

function failure(code: string, message: string): Result<FinancialTimeline> { return { ok: false, error: { code, message } }; }

export function buildTimeline(snapshot: CanonicalErpSnapshot, terms: DealTermsV1, policy: CompilerPolicy, stressScenario?: StressScenario): Result<FinancialTimeline> {
  const validPolicy = createCompilerPolicy(policy);
  if (!validPolicy.ok) return validPolicy;
  let amounts;
  try { amounts = calculateCustomerPaymentAmounts(terms); } catch (caught) {
    return failure("INVALID_DEAL_TERMS", caught instanceof Error ? caught.message : "Deal terms are invalid.");
  }
  const candidateEvents: DatedCashEvent[] = [];
  const [deposit, balance] = terms.customerPaymentEvents;
  if (amounts.depositRupiah > 0n) candidateEvents.push({
    eventId: deposit.eventId, dependencyKey: `deal:event:${deposit.eventId}`, date: deposit.effectiveDate, sameDayOrder: deposit.sameDayOrder,
    direction: "inflow", amountRupiah: amounts.depositRupiah, certainty: "expected", eventClass: "projected", orderingSource: "conservative", material: true,
  });
  if (amounts.balanceRupiah > 0n) candidateEvents.push({
    eventId: balance.eventId, dependencyKey: `deal:event:${balance.eventId}`, date: balance.effectiveDate, sameDayOrder: balance.sameDayOrder,
    direction: "inflow", amountRupiah: amounts.balanceRupiah, certainty: "expected", eventClass: "projected", orderingSource: "conservative", material: true,
  });
  for (const cost of terms.directCostEvents) candidateEvents.push({
    eventId: cost.eventId, dependencyKey: `deal:event:${cost.eventId}`, date: cost.effectiveDate, sameDayOrder: cost.sameDayOrder,
    direction: "outflow", amountRupiah: cost.amountRupiah, certainty: "assumption", eventClass: "projected", orderingSource: cost.orderingSource, material: true,
  });
  let events: readonly DatedCashEvent[] = [...snapshot.cashEvents, ...candidateEvents];
  if (stressScenario) {
    try { events = applyStressToEvents(events, terms, snapshot.asOfDate, stressScenario); }
    catch (caught) { return failure('INVALID_STRESS_SCENARIO', caught instanceof Error ? caught.message : 'Invalid stress projection'); }
  }
  const ordered = validateCashEventOrdering(events);
  if (!ordered.ok) return failure(ordered.error.code, ordered.error.message);
  const shell: FinancialTimeline = {
    events: ordered.value, points: [], minimumConfirmedBalance: rupiah(0n), minimumProjectedBalance: rupiah(0n),
    worstConfirmedPoint: null, worstProjectedPoint: null, firstConfirmedNegativePoint: null, firstProjectedNegativePoint: null,
  };
  // Zero is valid opening liquidity, but never a zero-amount cash event.
  // Observe the as-of balance before future flows so floor diagnostics include it.
  const zero = rupiah(0n);
  const openingPoint: LiquidityPoint[] = snapshot.openingBalanceRupiah === 0n ? [{
    eventId: `cash-opening:${snapshot.cash.accountId}:${snapshot.asOfDate}`, date: snapshot.asOfDate,
    confirmedBalanceBefore: zero, confirmedBalanceAfter: zero, projectedBalanceBefore: zero, projectedBalanceAfter: zero,
  }] : [];
  const points = [...openingPoint, ...walkBalances(shell)];
  const worstConfirmedPoint = points.reduce<LiquidityPoint | null>((worst, point) => !worst || point.confirmedBalanceAfter < worst.confirmedBalanceAfter ? point : worst, null);
  const worstProjectedPoint = points.reduce<LiquidityPoint | null>((worst, point) => !worst || point.projectedBalanceAfter < worst.projectedBalanceAfter ? point : worst, null);
  return { ok: true, value: {
    events: ordered.value,
    points,
    minimumConfirmedBalance: worstConfirmedPoint?.confirmedBalanceAfter ?? rupiah(0n),
    minimumProjectedBalance: worstProjectedPoint?.projectedBalanceAfter ?? rupiah(0n),
    worstConfirmedPoint,
    worstProjectedPoint,
    firstConfirmedNegativePoint: points.find((point) => point.confirmedBalanceAfter < 0n) ?? null,
    firstProjectedNegativePoint: points.find((point) => point.projectedBalanceAfter < 0n) ?? null,
  } };
}
