import type { BasisPoints } from '../domain/rate';
import type { StressScenario } from '../stress/stress-transform';
import type { DealTermsV1 } from '../domain/deal-terms';
import { basisPoints } from '../domain/rate';
import { addCalendarDays } from '../domain/date';

export interface AmendmentPolicy {
  readonly schemaVersion: 'dealtwin.amendment-policy.v1';
  readonly depositMaximumBps: BasisPoints;
  readonly earliestCustomerBalanceDays: number;
  readonly latestSupplierPaymentDays: number;
  readonly supplierApprovalPermitted: boolean;
  readonly requiredStressScenarios: readonly StressScenario[];
  readonly supplierApprovalCode?: string;
}

export interface SearchPoint { readonly terms: DealTermsV1; readonly depositDelta: number; readonly customerDelta: number; readonly supplierDelta: number }
export function* enumerateAmendments(source: DealTermsV1, policy: AmendmentPolicy): Generator<SearchPoint> {
  const deposit = source.customerPaymentEvents[0].basisPoints; const customer = source.customerPaymentEvents[1].daysFromAcceptance;
  const supplier = source.directCostEvents.reduce((max,row) => Math.max(max,row.daysFromAcceptance),0);
  const lastSupplier = policy.supplierApprovalPermitted && source.directCostEvents.length > 0 ? policy.latestSupplierPaymentDays : supplier;
  const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
  if (policy.schemaVersion !== 'dealtwin.amendment-policy.v1' || !integer(policy.depositMaximumBps) || policy.depositMaximumBps > 10000
    || policy.depositMaximumBps < deposit
    || !integer(policy.earliestCustomerBalanceDays) || policy.earliestCustomerBalanceDays > customer
    || !integer(policy.latestSupplierPaymentDays) || policy.latestSupplierPaymentDays < supplier
    || typeof policy.supplierApprovalPermitted !== 'boolean' || !Array.isArray(policy.requiredStressScenarios)
    || new Set(policy.requiredStressScenarios.map(row => row.id)).size !== policy.requiredStressScenarios.length
    || (policy.supplierApprovalCode !== undefined && (policy.supplierApprovalCode.length===0 || policy.supplierApprovalCode.trim()!==policy.supplierApprovalCode))) throw new Error('INVALID_AMENDMENT_POLICY');
  const count = (Math.floor((policy.depositMaximumBps-deposit)/100)+1)*(customer-policy.earliestCustomerBalanceDays+1)*(lastSupplier-supplier+1);
  if (!Number.isSafeInteger(count) || count*Math.max(1,policy.requiredStressScenarios.length)>10000) throw new Error('INVALID_AMENDMENT_POLICY');
  for (let bps: number=deposit; bps<=policy.depositMaximumBps; bps+=100) for (let day=customer; day>=policy.earliestCustomerBalanceDays; day--) for (let costDay=supplier; costDay<=lastSupplier; costDay++) {
    const terms = structuredClone(source);
    yield { terms: { ...terms, customerPaymentEvents: [{ ...terms.customerPaymentEvents[0], basisPoints: basisPoints(bps) },
      { ...terms.customerPaymentEvents[1], basisPoints: basisPoints(10000-bps), daysFromAcceptance: day, effectiveDate: addCalendarDays(terms.acceptedDate,day) }],
      directCostEvents: terms.directCostEvents.map(row => ({ ...row, daysFromAcceptance: row.daysFromAcceptance+costDay-supplier,
        effectiveDate: addCalendarDays(terms.acceptedDate,row.daysFromAcceptance+costDay-supplier) })) },
      depositDelta: bps-deposit, customerDelta: customer-day, supplierDelta: costDay-supplier };
  }
}
