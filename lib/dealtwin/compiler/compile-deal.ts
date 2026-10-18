import { validateConstraints, type ConstraintSet } from "../domain/constraint";
import type { DealTermsV1 } from "../domain/deal-terms";
import type { IsoDate } from "../domain/date";
import { rupiah, type Rupiah } from "../domain/money";
import type { CompilerPolicy } from "../domain/policy";
import type { DealTwinReasonCode } from "../domain/reason-code";
import type { CanonicalErpSnapshot } from "../erp/build-snapshot";
import { commitmentIdFromDependencyKey } from "../erp/dependency-keys";
import type { LiquidityPoint } from "./balance-walk";
import type { ConstraintEvaluation } from "./evaluate-constraints";
import type { FinancialTimeline } from "./timeline";
import { buildTimeline } from "./timeline";
import { evaluateConstraints } from "./evaluate-constraints";
import { buildPlanningHorizon } from "./horizon";
import type { StressScenario } from '../stress/stress-transform';

export interface CompileInput {
  readonly snapshot: CanonicalErpSnapshot;
  readonly terms: DealTermsV1;
  readonly constraints: ConstraintSet;
  readonly policy: CompilerPolicy;
  readonly approvedApprovalCodes: readonly string[];
  readonly stressScenario?: StressScenario;
}

export type CompileOutcome = "COMPILES" | "CONDITIONALLY_VALID" | "DOES_NOT_COMPILE" | "UNRESOLVED";

export interface CompileResult {
  readonly outcome: CompileOutcome;
  readonly reasonCode: DealTwinReasonCode | null;
  readonly timeline: FinancialTimeline | null;
  readonly evaluations: readonly ConstraintEvaluation[];
  readonly effectiveHorizonEnd: IsoDate;
  readonly horizonExpanded: boolean;
  readonly horizonExpansionEventIds: readonly string[];
  readonly firstViolationDate: IsoDate | null;
  readonly cashFloorRupiah: Rupiah;
  readonly shortfallRupiah: Rupiah | null;
  readonly worstLiquidityPoint: LiquidityPoint | null;
  readonly conflictingCommitmentIds: readonly string[];
  readonly unresolvedConstraintIds: readonly string[];
}

export function compileDeal(_input: CompileInput): CompileResult {
  const input = _input;
  const baseHorizon = input.snapshot.requestedHorizonEnd;
  const cashFloorConstraint = input.constraints.constraints.find((constraint) => constraint.kind === "minimum_cash_rupiah");
  const effectiveCashFloor = cashFloorConstraint?.kind === "minimum_cash_rupiah" && cashFloorConstraint.value > input.policy.minimumCashRupiah
    ? cashFloorConstraint.value : input.policy.minimumCashRupiah;
  const empty = (outcome: CompileOutcome, reasonCode: DealTwinReasonCode): CompileResult => ({
    outcome, reasonCode, timeline: null, evaluations: [], effectiveHorizonEnd: baseHorizon, horizonExpanded: false,
    horizonExpansionEventIds: [], firstViolationDate: null, cashFloorRupiah: effectiveCashFloor,
    shortfallRupiah: null, worstLiquidityPoint: null, conflictingCommitmentIds: [], unresolvedConstraintIds: [],
  });
  const validatedConstraints = validateConstraints(input.constraints.constraints);
  if (!validatedConstraints.ok) return empty("UNRESOLVED", "INVALID_CONSTRAINT");
  if (new Set(input.approvedApprovalCodes).size !== input.approvedApprovalCodes.length
    || input.approvedApprovalCodes.some((code) => typeof code !== "string" || code.length === 0 || code.trim() !== code)) {
    return empty("UNRESOLVED", "INVALID_CONSTRAINT");
  }
  const normalizedInput: CompileInput = { ...input, constraints: validatedConstraints.value };
  const timelineResult = buildTimeline(input.snapshot, input.terms, input.policy, input.stressScenario);
  if (!timelineResult.ok) {
    const reason = timelineResult.error.code === "UNRESOLVED_SAME_DAY_ORDER" ? "UNRESOLVED_SAME_DAY_ORDER" : "INVALID_CONSTRAINT";
    return empty("UNRESOLVED", reason);
  }
  const timeline = timelineResult.value;
  const effectiveHorizonEnd = [baseHorizon, buildPlanningHorizon(input.snapshot.asOfDate, timeline.events)]
    .reduce((latest, date) => date > latest ? date : latest);
  const relevantPoints = timeline.points.filter((point) => point.date <= effectiveHorizonEnd);
  const evaluations = [...evaluateConstraints(normalizedInput, relevantPoints)];
  if (!normalizedInput.constraints.constraints.some((constraint) => constraint.kind === "new_borrowing_allowed")) {
    const violating = relevantPoints.find((point) => point.projectedBalanceAfter < 0n);
    evaluations.push({ constraintId: "policy:new_borrowing_allowed", kind: "compiler_policy", status: violating ? "fail" : "pass",
      reasonCode: violating ? "NEW_BORROWING_PROHIBITED" : null, violationDate: violating?.date ?? null,
      shortfallRupiah: violating ? rupiah(-violating.projectedBalanceAfter) : null });
  }
  if (!normalizedInput.constraints.constraints.some((constraint) => constraint.kind === "minimum_cash_rupiah")) {
    const violating = relevantPoints.find((point) => point.projectedBalanceAfter < input.policy.minimumCashRupiah);
    evaluations.push({ constraintId: "policy:minimum_cash", kind: "compiler_policy", status: violating ? "fail" : "pass",
      reasonCode: violating ? "MINIMUM_CASH_VIOLATION" : null, violationDate: violating?.date ?? null,
      shortfallRupiah: violating ? rupiah(input.policy.minimumCashRupiah - violating.projectedBalanceAfter) : null });
  }
  const reasonPriority: Partial<Record<DealTwinReasonCode, number>> = {
    CUSTOMER_DEPOSIT_LIMIT: 10, PROTECTED_OBLIGATION: 20, INSUFFICIENT_INVENTORY: 30,
    NEW_BORROWING_PROHIBITED: 40, MINIMUM_CASH_VIOLATION: 50, APPROVAL_REQUIRED: 60, INVALID_CONSTRAINT: 0,
  };
  const comparePrimary = (left: ConstraintEvaluation, right: ConstraintEvaluation): number => {
    const leftDate = left.violationDate ?? "9999-99-99";
    const rightDate = right.violationDate ?? "9999-99-99";
    if (leftDate !== rightDate) return leftDate < rightDate ? -1 : 1;
    const leftPriority = reasonPriority[left.reasonCode ?? "INVALID_CONSTRAINT"] ?? 999;
    const rightPriority = reasonPriority[right.reasonCode ?? "INVALID_CONSTRAINT"] ?? 999;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return left.constraintId < right.constraintId ? -1 : left.constraintId > right.constraintId ? 1 : 0;
  };
  const unresolved = evaluations.filter((item) => item.status === "unresolved").sort(comparePrimary);
  const failed = evaluations.filter((item) => item.status === "fail").sort(comparePrimary);
  const pending = evaluations.filter((item) => item.status === "pending").sort(comparePrimary);
  const outcome: CompileOutcome = unresolved.length > 0 ? "UNRESOLVED" : failed.length > 0 ? "DOES_NOT_COMPILE" : pending.length > 0 ? "CONDITIONALLY_VALID" : "COMPILES";
  const primary = unresolved[0] ?? failed[0] ?? pending[0] ?? null;
  const conflictingCommitmentIds = outcome === "DOES_NOT_COMPILE" && failed.some((item) => item.reasonCode === "MINIMUM_CASH_VIOLATION" || item.reasonCode === "NEW_BORROWING_PROHIBITED")
    ? [...new Set(timeline.events.filter((event) => event.eventClass === "commitment").map((event) => commitmentIdFromDependencyKey(event.dependencyKey)).filter((id): id is string => id !== null))].sort()
    : [];
  const horizonExpansionEventIds = timeline.events.filter((event) => event.material && event.date > baseHorizon && event.date <= effectiveHorizonEnd).map((event) => event.eventId);
  return {
    outcome,
    reasonCode: primary?.reasonCode ?? null,
    timeline,
    evaluations,
    effectiveHorizonEnd,
    horizonExpanded: effectiveHorizonEnd > baseHorizon,
    horizonExpansionEventIds,
    firstViolationDate: (primary?.violationDate as IsoDate | null) ?? null,
    cashFloorRupiah: effectiveCashFloor,
    shortfallRupiah: primary?.shortfallRupiah ?? null,
    worstLiquidityPoint: timeline.worstProjectedPoint,
    conflictingCommitmentIds,
    unresolvedConstraintIds: [...unresolved, ...pending].map((item) => item.constraintId),
  };
}
