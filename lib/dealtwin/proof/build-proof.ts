import type { CompileResult } from "../compiler/compile-deal";
import type { ConstraintEvaluation } from "../compiler/evaluate-constraints";
import type { LiquidityPoint } from "../compiler/balance-walk";
import type { FinancialTimeline } from "../compiler/timeline";
import { canonicalCashEventDto, hashCanonicalCashEvents } from "../domain/canonical-event";
import { hashCanonicalSnapshotState } from "../erp/build-snapshot";
import { sha256Canonical, type CanonicalJsonValue } from "../domain/canonical-json";
import { sortCashEvents, type DatedCashEvent } from "../domain/cash-event";
import { validateConstraints, type CommercialConstraint, type ConstraintSet } from "../domain/constraint";
import type { DealVersion } from "../domain/deal";
import { formatRupiahDto, type Rupiah } from "../domain/money";
import { createCompilerPolicy, type CompilerPolicy } from "../domain/policy";
import type { Approval } from "../domain/proof";
import type { Result } from "../domain/result";
import type { CanonicalErpSnapshot } from "../erp/build-snapshot";
import type { SourceDependency } from "../erp/adapter-types";
import type { DealProof, DealProofDto } from "./proof-dto";
import { CANONICALIZATION_VERSION, DEALTWIN_ENGINE_VERSION, NAMED_STRESS_ENGINE_VERSION, type DealTwinEngineVersion } from "./version";
import type { CompileInput } from '../compiler/compile-deal';
import { canonicalizeDealTermsV1 } from '../domain/deal-terms';

export interface RecordedStressRun {
  readonly id: string;
  readonly transformType: string;
  readonly parameters: CanonicalJsonValue;
  readonly inputPayload: CanonicalJsonValue;
  readonly resultPayload: CanonicalJsonValue;
}

export interface ProofAssumption {
  readonly id: string;
  readonly code: string;
  readonly detail: string;
}

export interface ProofBuildInput {
  readonly proofId: string;
  readonly dealId: string;
  readonly version: DealVersion;
  readonly snapshot: CanonicalErpSnapshot;
  readonly constraints: ConstraintSet;
  readonly policy: CompilerPolicy;
  readonly baseResult: CompileResult;
  readonly stressRuns: readonly RecordedStressRun[];
  readonly assumptions: readonly ProofAssumption[];
  readonly approvals: readonly Approval[];
  readonly approvedApprovalCodes: readonly string[];
  readonly generatedAt: string;
  readonly engineVersion?: DealTwinEngineVersion;
}

const DEAL_EVENT_PREFIX = "deal:event:";
const GENERATED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function failure<T>(code: string, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}

function canonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function uniqueIds(values: readonly string[], code: string, message: string): Result<true> {
  if (new Set(values).size !== values.length) return failure(code, message);
  return { ok: true, value: true };
}

function sortById<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

function money(value: Rupiah | null | undefined): string | null {
  return value == null ? null : formatRupiahDto(value);
}

function encodeConstraint(constraint: CommercialConstraint): CanonicalJsonValue {
  const base = {
    id: constraint.id,
    kind: constraint.kind,
    operator: constraint.operator,
    provenance: constraint.provenance,
    resolution: constraint.resolution,
    sourceText: constraint.sourceText,
  };
  switch (constraint.kind) {
    case "minimum_cash_rupiah":
      return { ...base, value: formatRupiahDto(constraint.value) };
    case "required_inventory_available":
      return { ...base, value: { productId: constraint.value.productId, warehouseId: constraint.value.warehouseId, quantity: constraint.value.quantity } };
    case "required_approval":
      return { ...base, value: { approvalCode: constraint.value.approvalCode } };
    default:
      return { ...base, value: constraint.value };
  }
}

function encodeDependency(entry: SourceDependency): CanonicalJsonValue {
  return { key: entry.key, contentHash: entry.contentHash };
}

function encodeDependencies(entries: readonly SourceDependency[]): CanonicalJsonValue {
  return [...entries]
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
    .map(encodeDependency);
}

function encodeManifest(snapshot: CanonicalErpSnapshot): Result<CanonicalJsonValue> {
  const byKey = new Map<string, string>();
  for (const entry of snapshot.dependencyManifest.entries) {
    if (!canonicalText(entry.key) || !canonicalText(entry.contentHash)) {
      return failure("INVALID_PROOF", "Dependency identity is invalid.");
    }
    const prior = byKey.get(entry.key);
    if (prior && prior !== entry.contentHash) {
      return failure("DEPENDENCY_HASH_CONFLICT", `Dependency ${entry.key} has conflicting material hashes.`);
    }
    byKey.set(entry.key, entry.contentHash);
  }
  const entries = [...byKey.entries()].sort((left, right) => left[0] < right[0] ? -1 : 1)
    .map(([key, contentHash]) => ({ key, contentHash }));
  return { ok: true, value: { entries, keys: entries.map((entry) => entry.key) } };
}

function encodeSnapshot(snapshot: CanonicalErpSnapshot, manifest: CanonicalJsonValue): CanonicalJsonValue {
  const encodeSource = (source: { key: string; contentHash: string; sourceType?: string; sourceId?: string; sourceRevision?: string }): CanonicalJsonValue => ({
    key: source.key,
    contentHash: source.contentHash,
    ...(source.sourceType ? { sourceType: source.sourceType, sourceId: source.sourceId ?? null, sourceRevision: source.sourceRevision ?? null } : {}),
  });
  return {
    tenantId: snapshot.tenantId,
    erpRevision: snapshot.erpRevision,
    asOfDate: snapshot.asOfDate,
    requestedHorizonEnd: snapshot.requestedHorizonEnd,
    adapterVersion: snapshot.adapterVersion,
    openingBalanceRupiah: formatRupiahDto(snapshot.openingBalanceRupiah),
    stateHash: snapshot.stateHash,
    cash: {
      accountId: snapshot.cash.accountId,
      asOfDate: snapshot.cash.asOfDate,
      openingBalanceRupiah: formatRupiahDto(snapshot.cash.openingBalanceRupiah),
      openingSource: encodeSource(snapshot.cash.openingSource),
      confirmedMovements: sortCashEvents(snapshot.cash.confirmedMovements).map(canonicalCashEventDto),
      dependencies: encodeDependencies(snapshot.cash.dependencies),
    },
    obligations: [...snapshot.obligations].sort((left, right) => left.economicEventId < right.economicEventId ? -1 : 1).map((item) => ({
      economicEventId: item.economicEventId, supplierId: item.supplierId, purchaseOrderId: item.purchaseOrderId,
      authority: item.authority, dueDate: item.dueDate, sameDayOrder: item.sameDayOrder,
      amountRupiah: formatRupiahDto(item.amountRupiah), sourceChain: item.sourceChain.map(encodeSource),
    })),
    receipts: [...snapshot.receipts].sort((left, right) => left.economicEventId < right.economicEventId ? -1 : 1).map((item) => ({
      economicEventId: item.economicEventId, customerId: item.customerId, salesOrderId: item.salesOrderId,
      authority: item.authority, expectedDate: item.expectedDate, sameDayOrder: item.sameDayOrder,
      amountRupiah: formatRupiahDto(item.amountRupiah), sourceChain: item.sourceChain.map(encodeSource),
    })),
    inventory: [...snapshot.inventory]
      .sort((left, right) => left.productId !== right.productId ? (left.productId < right.productId ? -1 : 1) : (left.warehouseId < right.warehouseId ? -1 : 1))
      .map((item) => ({
        productId: item.productId, warehouseId: item.warehouseId, physicalQuantity: item.physicalQuantity,
        reservedQuantity: item.reservedQuantity, availableQuantity: item.availableQuantity,
        dependencies: encodeDependencies(item.dependencies),
      })),
    supplierTerms: [...snapshot.supplierTerms].sort((left, right) => left.supplierId < right.supplierId ? -1 : 1).map((item) => ({
      supplierId: item.supplierId, paymentTermDays: item.paymentTermDays, dependency: encodeDependency(item.dependency),
    })),
    customerTerms: [...snapshot.customerTerms].sort((left, right) => left.customerId < right.customerId ? -1 : 1).map((item) => ({
      customerId: item.customerId, creditLimitRupiah: formatRupiahDto(item.creditLimitRupiah), dependency: encodeDependency(item.dependency),
    })),
    cashEvents: sortCashEvents(snapshot.cashEvents).map(canonicalCashEventDto),
    dependencyManifest: manifest,
  };
}

function encodePoint(point: LiquidityPoint | null): CanonicalJsonValue {
  if (!point) return null;
  return {
    eventId: point.eventId,
    date: point.date,
    confirmedBalanceBefore: formatRupiahDto(point.confirmedBalanceBefore),
    confirmedBalanceAfter: formatRupiahDto(point.confirmedBalanceAfter),
    projectedBalanceBefore: formatRupiahDto(point.projectedBalanceBefore),
    projectedBalanceAfter: formatRupiahDto(point.projectedBalanceAfter),
  };
}

function encodeEvaluation(evaluation: ConstraintEvaluation): CanonicalJsonValue {
  return {
    constraintId: evaluation.constraintId,
    kind: evaluation.kind,
    status: evaluation.status,
    reasonCode: evaluation.reasonCode,
    violationDate: evaluation.violationDate,
    shortfallRupiah: money(evaluation.shortfallRupiah),
  };
}

function encodeTimeline(timeline: FinancialTimeline | null): CanonicalJsonValue {
  if (!timeline) return null;
  return {
    events: sortCashEvents(timeline.events).map(canonicalCashEventDto),
    minimumConfirmedBalance: formatRupiahDto(timeline.minimumConfirmedBalance),
    minimumProjectedBalance: formatRupiahDto(timeline.minimumProjectedBalance),
    worstConfirmedPoint: encodePoint(timeline.worstConfirmedPoint),
    worstProjectedPoint: encodePoint(timeline.worstProjectedPoint),
    firstConfirmedNegativePoint: encodePoint(timeline.firstConfirmedNegativePoint),
    firstProjectedNegativePoint: encodePoint(timeline.firstProjectedNegativePoint),
  };
}

export function encodeCompileResult(result: CompileResult): CanonicalJsonValue {
  return {
    outcome: result.outcome,
    reasonCode: result.reasonCode,
    firstViolationDate: result.firstViolationDate,
    cashFloorRupiah: formatRupiahDto(result.cashFloorRupiah),
    shortfallRupiah: money(result.shortfallRupiah),
    effectiveHorizonEnd: result.effectiveHorizonEnd,
    horizonExpanded: result.horizonExpanded,
    horizonExpansionEventIds: [...result.horizonExpansionEventIds].sort(),
    conflictingCommitmentIds: [...result.conflictingCommitmentIds].sort(),
    unresolvedConstraintIds: [...result.unresolvedConstraintIds].sort(),
    evaluations: [...result.evaluations].sort((left, right) => left.constraintId < right.constraintId ? -1 : 1).map(encodeEvaluation),
    worstLiquidityPoint: encodePoint(result.worstLiquidityPoint),
    timeline: encodeTimeline(result.timeline),
  };
}

function encodeApproval(approval: Approval): CanonicalJsonValue {
  return { id: approval.id, proofId: approval.proofId, dealVersionId: approval.dealVersionId, kind: approval.kind, status: approval.status,
    ...(approval.requirementCode!==undefined?{requirementCode:approval.requirementCode}:{}) };
}

export function encodeCompileInput(input: CompileInput): CanonicalJsonValue {
  const manifest = encodeManifest(input.snapshot); const constraints = validateConstraints(input.constraints.constraints);
  if (!manifest.ok || !constraints.ok || hashCanonicalSnapshotState(input.snapshot) !== input.snapshot.stateHash) throw new Error('INVALID_STRESS_INPUT');
  return { snapshot: encodeSnapshot(input.snapshot,manifest.value), terms: canonicalizeDealTermsV1(input.terms) as unknown as CanonicalJsonValue,
    constraints: constraints.value.constraints.map(encodeConstraint), approvedApprovalCodes: [...input.approvedApprovalCodes].sort(),
    policy: { minimumCashRupiah: formatRupiahDto(input.policy.minimumCashRupiah), newBorrowingAllowed: input.policy.newBorrowingAllowed, defaultHorizonDays: input.policy.defaultHorizonDays } };
}

function encodeAssumption(assumption: ProofAssumption): CanonicalJsonValue {
  return { id: assumption.id, code: assumption.code, detail: assumption.detail };
}

function encodeStress(run: RecordedStressRun): {
  readonly id: string;
  readonly transformType: string;
  readonly parameters: CanonicalJsonValue;
  readonly inputPayload: CanonicalJsonValue;
  readonly resultPayload: CanonicalJsonValue;
} {
  return { id: run.id, transformType: run.transformType, parameters: run.parameters, inputPayload: run.inputPayload, resultPayload: run.resultPayload };
}

function proofStatus(result: CompileResult): Result<DealProof["status"]> {
  if (result.outcome === "COMPILES") return { ok: true, value: "VALID" };
  if (result.outcome === "CONDITIONALLY_VALID") return { ok: true, value: "CONDITIONALLY_VALID" };
  if (result.outcome === "DOES_NOT_COMPILE" || result.outcome === "UNRESOLVED") return { ok: true, value: "INVALID" };
  return failure("INVALID_PROOF", "Compile outcome is not a canonical proof status.");
}

function reservedEvents(result: CompileResult): readonly DatedCashEvent[] {
  return result.timeline?.events.filter((event) => event.dependencyKey.startsWith(DEAL_EVENT_PREFIX)) ?? [];
}

function validateInput(input: ProofBuildInput): Result<true> {
  if (!canonicalText(input.proofId) || !canonicalText(input.dealId) || !GENERATED_AT_PATTERN.test(input.generatedAt)) {
    return failure("INVALID_PROOF", "Proof identity or generated-at timestamp is invalid.");
  }
  if (input.dealId !== input.version.dealId) {
    return failure("PROOF_IDENTITY_MISMATCH", "Proof deal identity does not match the Deal version.");
  }
  if (!canonicalText(input.version.id) || !canonicalText(input.snapshot.tenantId) || !canonicalText(input.snapshot.adapterVersion)
    || !canonicalText(input.snapshot.stateHash) || !Number.isSafeInteger(input.snapshot.erpRevision) || input.snapshot.erpRevision < 0) {
    return failure("INVALID_PROOF", "Snapshot or version identity is invalid.");
  }
  const policy = createCompilerPolicy(input.policy);
  if (!policy.ok) return failure("INVALID_PROOF", policy.error.message);
  const constraints = validateConstraints(input.constraints.constraints);
  if (!constraints.ok) return failure(constraints.error.code, constraints.error.message);
  if (new Set(input.approvedApprovalCodes).size !== input.approvedApprovalCodes.length
    || input.approvedApprovalCodes.some((code) => !canonicalText(code))) {
    return failure("INVALID_PROOF", "Approved approval codes must be unique canonical text.");
  }
  const approvals = uniqueIds(input.approvals.map((item) => item.id), "DUPLICATE_PROOF_EVIDENCE", "Approval identities must be unique.");
  if (!approvals.ok) return approvals;
  const assumptions = uniqueIds(input.assumptions.map((item) => item.id), "DUPLICATE_PROOF_EVIDENCE", "Assumption identities must be unique.");
  if (!assumptions.ok) return assumptions;
  const stress = uniqueIds(input.stressRuns.map((item) => item.id), "DUPLICATE_PROOF_EVIDENCE", "Stress-run identities must be unique.");
  if (!stress.ok) return stress;
  if (input.assumptions.some((item) => !canonicalText(item.id) || !canonicalText(item.code) || !canonicalText(item.detail))) {
    return failure("INVALID_PROOF", "Assumption evidence is invalid.");
  }
  if (input.stressRuns.some((item) => !canonicalText(item.id) || !canonicalText(item.transformType))) {
    return failure("INVALID_PROOF", "Stress-run evidence is invalid.");
  }
  if (input.approvals.some((item) => !canonicalText(item.id) || item.proofId !== input.proofId || item.dealVersionId !== input.version.id
    || (item.requirementCode!==undefined && (!canonicalText(item.requirementCode)||item.requirementCode.length>128)))) {
    return failure("APPROVAL_IDENTITY_MISMATCH", "Approval must belong to this proof and Deal version.");
  }
  return { ok: true, value: true };
}

export function buildDealProof(input: ProofBuildInput): Result<DealProof> {
  const validated = validateInput(input);
  if (!validated.ok) return validated;
  const namedStress = input.stressRuns.some(run => run.transformType === 'dealtwin.named-stress.v1');
  const engineVersion = input.engineVersion ?? (namedStress ? NAMED_STRESS_ENGINE_VERSION : DEALTWIN_ENGINE_VERSION);
  if (engineVersion !== DEALTWIN_ENGINE_VERSION && engineVersion !== NAMED_STRESS_ENGINE_VERSION) return failure('UNSUPPORTED_ENGINE_VERSION', 'Unsupported proof engine.');
  if ((namedStress && engineVersion !== NAMED_STRESS_ENGINE_VERSION)
    || (engineVersion === NAMED_STRESS_ENGINE_VERSION && input.stressRuns.some(run => run.transformType !== 'dealtwin.named-stress.v1'))) {
    return failure('UNSUPPORTED_STRESS_VERSION', 'Named stress requires v2; legacy evidence cannot be silently upgraded.');
  }
  const manifest = encodeManifest(input.snapshot);
  if (!manifest.ok) return manifest;
  if (hashCanonicalSnapshotState(input.snapshot) !== input.snapshot.stateHash) {
    return failure("SNAPSHOT_HASH_MISMATCH", "Encoded snapshot contents do not match the recorded snapshot stateHash.");
  }
  const status = proofStatus(input.baseResult);
  if (!status.ok) return status;
  if (status.value === "VALID" && input.approvals.some((item) => item.status === "pending")) {
    return failure("APPROVAL_STATE_INVALID", "A valid proof cannot retain pending approvals.");
  }
  if (status.value === "CONDITIONALLY_VALID" && !input.approvals.some((item) => item.kind === "non_arithmetic_authorization")) {
    return failure("APPROVAL_STATE_INVALID", "A conditionally valid proof must retain the authorizing approval snapshot.");
  }
  const constraints = validateConstraints(input.constraints.constraints);
  if (!constraints.ok) return failure(constraints.error.code, constraints.error.message);
  const cashEvents = sortCashEvents(input.snapshot.cashEvents).map(canonicalCashEventDto);
  const snapshot = encodeSnapshot(input.snapshot, manifest.value);
  const encodedConstraints = constraints.value.constraints.map(encodeConstraint);
  const encodedPolicy = {
    minimumCashRupiah: formatRupiahDto(input.policy.minimumCashRupiah),
    newBorrowingAllowed: input.policy.newBorrowingAllowed,
    defaultHorizonDays: input.policy.defaultHorizonDays,
  };
  const encodedApprovals = sortById(input.approvals).map(encodeApproval);
  const encodedAssumptions = sortById(input.assumptions).map(encodeAssumption);
  const encodedStress = sortById(input.stressRuns).map(encodeStress);
  const approvedApprovalCodes = [...input.approvedApprovalCodes].sort();
  const baseResult = encodeCompileResult(input.baseResult);
  const canonicalEventHash = hashCanonicalCashEvents(reservedEvents(input.baseResult));
  const inputHash = sha256Canonical({
    proofId: input.proofId,
    dealId: input.dealId,
    dealVersionId: input.version.id,
    version: input.version.version,
    terms: input.version.terms as unknown as CanonicalJsonValue,
    constraints: encodedConstraints,
    policy: encodedPolicy,
    snapshot,
    approvedApprovalCodes,
    stressRuns: encodedStress.map((run) => ({ id: run.id, transformType: run.transformType, parameters: run.parameters, inputPayload: run.inputPayload })),
    assumptions: encodedAssumptions,
    generatedAt: input.generatedAt,
    engineVersion,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    adapterVersion: input.snapshot.adapterVersion,
  });
  const resultHash = sha256Canonical({
    baseResult,
    stressResults: encodedStress.map((run) => ({ id: run.id, resultPayload: run.resultPayload })),
  });
  const snapshotHash = sha256Canonical(snapshot);
  const dtoWithoutHash: Omit<DealProofDto, "proofHash"> = {
    id: input.proofId,
    dealId: input.dealId,
    dealVersionId: input.version.id,
    dealVersion: input.version.version,
    status: status.value,
    generatedAt: input.generatedAt,
    engineVersion,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    adapterVersion: input.snapshot.adapterVersion,
    erpRevision: input.snapshot.erpRevision,
    snapshotHash,
    inputHash,
    resultHash,
    canonicalEventHash,
    terms: input.version.terms as unknown as CanonicalJsonValue,
    constraints: encodedConstraints,
    policy: encodedPolicy,
    cashEvents,
    snapshot,
    dependencyManifest: manifest.value,
    baseResult,
    stressRuns: encodedStress,
    assumptions: encodedAssumptions,
    approvals: encodedApprovals,
    approvedApprovalCodes,
  };
  const proofHash = sha256Canonical(dtoWithoutHash as CanonicalJsonValue);
  const dto: DealProofDto = { ...dtoWithoutHash, proofHash };
  const proof: DealProof = {
    id: dto.id,
    dealId: dto.dealId,
    dealVersionId: dto.dealVersionId,
    status: dto.status,
    canonicalEventHash,
    approvals: sortById(input.approvals),
    proofHash,
    inputHash,
    resultHash,
    generatedAt: dto.generatedAt,
    engineVersion: dto.engineVersion,
    canonicalizationVersion: dto.canonicalizationVersion,
    snapshotHash,
    dto,
  };
  return { ok: true, value: proof };
}

export { encodeProof } from "./proof-dto";
