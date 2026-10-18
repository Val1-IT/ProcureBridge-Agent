import type { CommercialConstraint } from "../domain/constraint";
import type { DealTwinReasonCode } from "../domain/reason-code";
import { rupiah, type Rupiah } from "../domain/money";
import type { LiquidityPoint } from "./balance-walk";
import type { CompileInput } from "./compile-deal";

export interface ConstraintEvaluation {
  readonly constraintId: string;
  readonly kind: CommercialConstraint["kind"] | "compiler_policy";
  readonly status: "pass" | "fail" | "pending" | "unresolved";
  readonly reasonCode: DealTwinReasonCode | null;
  readonly violationDate: string | null;
  readonly shortfallRupiah: Rupiah | null;
}

export function evaluateConstraints(_input: CompileInput, _points: readonly LiquidityPoint[]): readonly ConstraintEvaluation[] {
  const input = _input;
  const points = _points;
  const evaluation = (
    constraint: CommercialConstraint,
    status: ConstraintEvaluation["status"],
    reasonCode: DealTwinReasonCode | null = null,
    violationDate: string | null = null,
    shortfallRupiah: Rupiah | null = null,
  ): ConstraintEvaluation => ({ constraintId: constraint.id, kind: constraint.kind, status, reasonCode, violationDate, shortfallRupiah });
  return input.constraints.constraints.map((constraint) => {
    if (constraint.resolution !== "confirmed") return evaluation(constraint, "unresolved", "INVALID_CONSTRAINT");
    switch (constraint.kind) {
      case "customer_deposit_max_bps":
        return input.terms.customerPaymentEvents[0].basisPoints <= constraint.value
          ? evaluation(constraint, "pass") : evaluation(constraint, "fail", "CUSTOMER_DEPOSIT_LIMIT", input.terms.acceptedDate);
      case "customer_deposit_min_bps":
        return input.terms.customerPaymentEvents[0].basisPoints >= constraint.value
          ? evaluation(constraint, "pass") : evaluation(constraint, "fail", "CUSTOMER_DEPOSIT_LIMIT", input.terms.acceptedDate);
      case "customer_balance_due_days":
        return input.terms.customerPaymentEvents[1].daysFromAcceptance <= constraint.value
          ? evaluation(constraint, "pass") : evaluation(constraint, "fail", "INVALID_CONSTRAINT", input.terms.customerPaymentEvents[1].effectiveDate);
      case "supplier_payment_due_days": {
        const offending = input.terms.directCostEvents.find((event) => event.daysFromAcceptance < constraint.value);
        return offending ? evaluation(constraint, "fail", "PROTECTED_OBLIGATION", offending.effectiveDate) : evaluation(constraint, "pass");
      }
      case "protect_existing_supplier_due_dates": {
        const pointIds = new Set(points.map((point) => point.eventId));
        const missing = input.snapshot.obligations.find((item) => !pointIds.has(item.economicEventId));
        return missing ? evaluation(constraint, "fail", "PROTECTED_OBLIGATION", missing.dueDate) : evaluation(constraint, "pass");
      }
      case "new_borrowing_allowed": {
        const violating = points.find((point) => point.projectedBalanceAfter < 0n);
        return violating ? evaluation(constraint, "fail", "NEW_BORROWING_PROHIBITED", violating.date, rupiah(-violating.projectedBalanceAfter)) : evaluation(constraint, "pass");
      }
      case "minimum_cash_rupiah": {
        const violating = points.find((point) => point.projectedBalanceAfter < constraint.value);
        return violating ? evaluation(constraint, "fail", "MINIMUM_CASH_VIOLATION", violating.date, rupiah(constraint.value - violating.projectedBalanceAfter)) : evaluation(constraint, "pass");
      }
      case "required_inventory_available": {
        const position = input.snapshot.inventory.find((item) => item.productId === constraint.value.productId && item.warehouseId === constraint.value.warehouseId);
        return position && position.availableQuantity >= constraint.value.quantity
          ? evaluation(constraint, "pass") : evaluation(constraint, "fail", "INSUFFICIENT_INVENTORY", input.terms.acceptedDate);
      }
      case "required_approval":
        return input.approvedApprovalCodes.includes(constraint.value.approvalCode)
          ? evaluation(constraint, "pass") : evaluation(constraint, "pending", "APPROVAL_REQUIRED");
      default:
        return evaluation(constraint, "unresolved", "INVALID_CONSTRAINT");
    }
  });
}
