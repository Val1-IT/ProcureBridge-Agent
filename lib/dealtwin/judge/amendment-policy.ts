import { basisPoints } from '../domain/rate';
import type { AmendmentPolicy } from '../recompiler/search-space';
export function createJudgeAmendmentPolicy():AmendmentPolicy {
 return {schemaVersion:'dealtwin.amendment-policy.v1',depositMaximumBps:basisPoints(4000),earliestCustomerBalanceDays:2,latestSupplierPaymentDays:14,supplierApprovalPermitted:true,
  requiredStressScenarios:[{schemaVersion:'dealtwin.stress-scenario.v1',id:'required-receipts-plus-3',type:'customer_receipt_delay',days:3}]};
}
