import type { ApprovalRecord } from "../../dealtwin/application/ports";
import type { CommercialConstraint } from "../../dealtwin/domain/constraint";
import type { Deal, DealStatus, DealVersion } from "../../dealtwin/domain/deal";
import type { ApprovalKind, ApprovalStatus, ProofStatus } from "../../dealtwin/domain/proof";
import type { CanonicalJsonValue } from "../../dealtwin/domain/canonical-json";
import type { DealProofDto } from "../../dealtwin/proof/proof-dto";
import { PersistenceIntegrityError } from "./errors";
import {
  asIsoDate,
  asIsoInstant,
  asNullableIsoDate,
  asNullableIsoInstant,
  isRecord,
  parseNonNegativeSafeInteger,
  parseRupiahText,
  parseSafeInteger,
  requireCanonicalText,
  requireHash,
  requireNullableCanonicalText,
} from "./pg-codec";
export interface DealTwinSnapshotInput {
  readonly id: string;
  readonly erpRevision: number;
  readonly asOfDate: string;
  readonly requestedHorizonEnd: string;
  readonly adapterVersion: string;
  readonly dependencyKeys: readonly string[];
  readonly dependencyManifest: unknown;
  readonly canonicalEvents: unknown;
  readonly stateHash: string;
  readonly createdAt: string;
}

export interface DealTwinCompileRunInput {
  readonly id: string;
  readonly dealVersionId: string;
  readonly snapshotId: string;
  readonly kind: "base" | "stress" | "recompile";
  readonly engineVersion: string;
  readonly inputHash: string;
  readonly resultHash: string;
  readonly outcome: "COMPILES" | "CONDITIONALLY_VALID" | "DOES_NOT_COMPILE" | "UNRESOLVED";
  readonly cashFloorRupiah: string;
  readonly shortfallRupiah: string | null;
  readonly worstMinimumRupiah: string | null;
  readonly firstViolationDate: string | null;
  readonly violationData: unknown;
  readonly parentRunId: string | null;
  readonly createdAt: string;
}

export interface DealTwinCommitmentInput {
  readonly id: string;
  readonly proofId: string;
  readonly dealVersionId: string;
  readonly accountId: string;
  readonly canonicalEventHash: string;
  readonly canonicalEvents: unknown;
  readonly amountRupiah: string;
  readonly direction: "inflow" | "outflow";
  readonly status: "reserved" | "committed" | "released" | "expired" | "cancelled";
  readonly reserveIdempotencyKey: string;
  readonly commitIdempotencyKey?: string | null;
  readonly releaseIdempotencyKey?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const DEAL_STATUSES = ["DRAFT", "COMPILED", "PROOF_GENERATED", "RESERVED", "COMMITTED", "STALE"] as const;
const PROOF_STATUSES = ["VALID", "CONDITIONALLY_VALID", "STALE", "INVALID"] as const;
const APPROVAL_KINDS = ["non_arithmetic_authorization", "arithmetic_uncertainty"] as const;
const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
const COMMITMENT_STATUSES = ["reserved", "committed", "released", "expired", "cancelled"] as const;
const COMMITMENT_DIRECTIONS = ["inflow", "outflow"] as const;
const COMPILE_KINDS = ["base", "stress", "recompile"] as const;
const COMPILE_OUTCOMES = ["COMPILES", "CONDITIONALLY_VALID", "DOES_NOT_COMPILE", "UNRESOLVED"] as const;

function allowed<const T extends readonly string[]>(value: string, options: T, label: string): T[number] {
  if (!options.includes(value)) throw new PersistenceIntegrityError(`${label} is unsupported.`);
  return value as T[number];
}

function jsonValue(value: unknown, label: string): CanonicalJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new PersistenceIntegrityError(`${label} contains a non-canonical number.`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => jsonValue(item, `${label}[${index}]`));
  if (!isRecord(value)) throw new PersistenceIntegrityError(`${label} is not canonical JSON.`);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item, `${label}.${key}`)]));
}

export function decodeProofJson(value: unknown): DealProofDto {
  const row = isRecord(value) ? value : (() => { throw new PersistenceIntegrityError("Proof JSON must be an object."); })();
  return {
    id: requireCanonicalText(row.id, "proof.id"),
    dealId: requireCanonicalText(row.dealId, "proof.dealId"),
    dealVersionId: requireCanonicalText(row.dealVersionId, "proof.dealVersionId"),
    dealVersion: parseSafeInteger(row.dealVersion, "proof.dealVersion"),
    status: allowed(requireCanonicalText(row.status, "proof.status"), PROOF_STATUSES, "proof.status") as ProofStatus,
    generatedAt: requireCanonicalText(row.generatedAt, "proof.generatedAt"),
    engineVersion: requireCanonicalText(row.engineVersion, "proof.engineVersion"),
    canonicalizationVersion: requireCanonicalText(row.canonicalizationVersion, "proof.canonicalizationVersion"),
    adapterVersion: requireCanonicalText(row.adapterVersion, "proof.adapterVersion"),
    erpRevision: parseNonNegativeSafeInteger(row.erpRevision, "proof.erpRevision"),
    snapshotHash: requireHash(row.snapshotHash, "proof.snapshotHash"),
    proofHash: requireHash(row.proofHash, "proof.proofHash"),
    inputHash: requireHash(row.inputHash, "proof.inputHash"),
    resultHash: requireHash(row.resultHash, "proof.resultHash"),
    canonicalEventHash: requireHash(row.canonicalEventHash, "proof.canonicalEventHash"),
    terms: jsonValue(row.terms, "proof.terms"),
    constraints: jsonValue(row.constraints, "proof.constraints"),
    policy: jsonValue(row.policy, "proof.policy"),
    cashEvents: jsonValue(row.cashEvents, "proof.cashEvents"),
    snapshot: jsonValue(row.snapshot, "proof.snapshot"),
    dependencyManifest: jsonValue(row.dependencyManifest, "proof.dependencyManifest"),
    baseResult: jsonValue(row.baseResult, "proof.baseResult"),
    stressRuns: jsonValue(row.stressRuns, "proof.stressRuns"),
    assumptions: jsonValue(row.assumptions, "proof.assumptions"),
    approvals: jsonValue(row.approvals, "proof.approvals"),
    approvedApprovalCodes: jsonValue(row.approvedApprovalCodes, "proof.approvedApprovalCodes"),
  };
}

export function dependencyKeysFromProof(proof: DealProofDto): readonly string[] {
  const manifest = proof.dependencyManifest;
  if (!isRecord(manifest) || !Array.isArray(manifest.keys)) return [];
  return manifest.keys.map((key, index) => requireCanonicalText(key, `proof.dependencyManifest.keys[${index}]`));
}

export function decodeDeal(row: Record<string, unknown>): Deal {
  return {
    id: requireCanonicalText(row.id, "deal.id"),
    title: requireCanonicalText(row.title, "deal.title"),
    customerId: requireCanonicalText(row.customer_id, "deal.customerId"),
    status: allowed(requireCanonicalText(row.status, "deal.status"), DEAL_STATUSES, "deal.status") as DealStatus,
    currentVersionId: requireNullableCanonicalText(row.current_version_id, "deal.currentVersionId") ?? "",
    committedSalesOrderId: requireNullableCanonicalText(row.committed_sales_order_id, "deal.committedSalesOrderId"),
  };
}

export function decodeDealVersion(row: Record<string, unknown>): DealVersion {
  return {
    id: requireCanonicalText(row.id, "dealVersion.id"),
    dealId: requireCanonicalText(row.deal_id, "dealVersion.dealId"),
    version: parseSafeInteger(row.version, "dealVersion.version"),
    terms: jsonValue(row.terms, "dealVersion.terms") as unknown as DealVersion["terms"],
    termsHash: requireHash(row.terms_hash, "dealVersion.termsHash"),
    createdBy: requireCanonicalText(row.created_by, "dealVersion.createdBy"),
    createdAt: asIsoInstant(row.created_at, "dealVersion.createdAt"),
  };
}

export function decodeApproval(row: Record<string, unknown>): ApprovalRecord {
  const requirement=requireCanonicalText(row.requirement_code,'approval.requirementCode');
  const snapshots=Array.isArray(row.proof_approvals)?row.proof_approvals as unknown[]:[];
  const bound=snapshots.find((item):item is Record<string,unknown>=>isRecord(item)&&item.id===row.id&&item.proofId===row.proof_id&&item.dealVersionId===row.deal_version_id&&item.requirementCode===requirement);
  const legacy=APPROVAL_KINDS.includes(requirement as ApprovalKind)&&!bound;
  if(!legacy&&!bound)throw new PersistenceIntegrityError('Approval code must match its immutable proof snapshot');
  const kind=legacy?requirement:requireCanonicalText(bound!.kind,'approval.kind');
  return {
    id: requireCanonicalText(row.id, "approval.id"),
    proofId: requireCanonicalText(row.proof_id, "approval.proofId"),
    dealVersionId: requireCanonicalText(row.deal_version_id, "approval.dealVersionId"),
    kind: allowed(kind, APPROVAL_KINDS, "approval.kind") as ApprovalKind,
    ...(!legacy?{requirementCode:requirement}:{}),
    status: allowed(requireCanonicalText(row.status, "approval.status"), APPROVAL_STATUSES, "approval.status") as ApprovalStatus,
    comment: requireNullableCanonicalText(row.comment, "approval.comment"),
    decidedBy: requireNullableCanonicalText(row.decided_by, "approval.decidedBy"),
    decidedAt: asNullableIsoInstant(row.decided_at, "approval.decidedAt"),
  };
}

export function decodeSnapshot(row: Record<string, unknown>): DealTwinSnapshotInput {
  const keys = row.dependency_keys;
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== "string")) {
    throw new PersistenceIntegrityError("Snapshot dependency keys must be text.");
  }
  return {
    id: requireCanonicalText(row.id, "snapshot.id"),
    erpRevision: parseNonNegativeSafeInteger(row.erp_revision, "snapshot.erpRevision"),
    asOfDate: asIsoDate(row.as_of_date, "snapshot.asOfDate"),
    requestedHorizonEnd: asIsoDate(row.requested_horizon_end, "snapshot.requestedHorizonEnd"),
    adapterVersion: requireCanonicalText(row.adapter_version, "snapshot.adapterVersion"),
    dependencyKeys: keys,
    dependencyManifest: row.dependency_manifest,
    canonicalEvents: row.canonical_events,
    stateHash: requireHash(row.state_hash, "snapshot.stateHash"),
    createdAt: asIsoInstant(row.created_at, "snapshot.createdAt"),
  };
}

export function decodeCompileRun(row: Record<string, unknown>): DealTwinCompileRunInput {
  return {
    id: requireCanonicalText(row.id, "compileRun.id"),
    dealVersionId: requireCanonicalText(row.deal_version_id, "compileRun.dealVersionId"),
    snapshotId: requireCanonicalText(row.snapshot_id, "compileRun.snapshotId"),
    kind: allowed(requireCanonicalText(row.kind, "compileRun.kind"), COMPILE_KINDS, "compileRun.kind"),
    engineVersion: requireCanonicalText(row.engine_version, "compileRun.engineVersion"),
    inputHash: requireHash(row.input_hash, "compileRun.inputHash"),
    resultHash: requireHash(row.result_hash, "compileRun.resultHash"),
    outcome: allowed(requireCanonicalText(row.outcome, "compileRun.outcome"), COMPILE_OUTCOMES, "compileRun.outcome"),
    cashFloorRupiah: parseRupiahText(row.cash_floor_rupiah, "compileRun.cashFloorRupiah"),
    shortfallRupiah: row.shortfall_rupiah === null ? null : parseRupiahText(row.shortfall_rupiah, "compileRun.shortfallRupiah"),
    worstMinimumRupiah: row.worst_minimum_rupiah === null ? null : parseRupiahText(row.worst_minimum_rupiah, "compileRun.worstMinimumRupiah"),
    firstViolationDate: asNullableIsoDate(row.first_violation_date, "compileRun.firstViolationDate"),
    violationData: row.violation_data,
    parentRunId: requireNullableCanonicalText(row.parent_run_id, "compileRun.parentRunId"),
    createdAt: asIsoInstant(row.created_at, "compileRun.createdAt"),
  };
}

export function decodeCommitment(row: Record<string, unknown>): DealTwinCommitmentInput {
  return {
    id: requireCanonicalText(row.id, "commitment.id"),
    proofId: requireCanonicalText(row.proof_id, "commitment.proofId"),
    dealVersionId: requireCanonicalText(row.deal_version_id, "commitment.dealVersionId"),
    accountId: requireCanonicalText(row.account_id, "commitment.accountId"),
    canonicalEventHash: requireHash(row.canonical_event_hash, "commitment.canonicalEventHash"),
    canonicalEvents: row.canonical_events,
    amountRupiah: parseRupiahText(row.amount_rupiah, "commitment.amountRupiah"),
    direction: allowed(requireCanonicalText(row.direction, "commitment.direction"), COMMITMENT_DIRECTIONS, "commitment.direction"),
    status: allowed(requireCanonicalText(row.status, "commitment.status"), COMMITMENT_STATUSES, "commitment.status"),
    reserveIdempotencyKey: requireCanonicalText(row.reserve_idempotency_key, "commitment.reserveIdempotencyKey"),
    commitIdempotencyKey: requireNullableCanonicalText(row.commit_idempotency_key, "commitment.commitIdempotencyKey"),
    releaseIdempotencyKey: requireNullableCanonicalText(row.release_idempotency_key, "commitment.releaseIdempotencyKey"),
    createdAt: asIsoInstant(row.created_at, "commitment.createdAt"),
    updatedAt: asIsoInstant(row.updated_at, "commitment.updatedAt"),
  };
}

export function constraintColumns(constraint: CommercialConstraint): { kind: string; operator: string; value: unknown; approvalRequirement: string | null } {
  const approvalRequirement = constraint.kind === "required_approval" ? constraint.value.approvalCode : null;
  const value = constraint.kind === "minimum_cash_rupiah"
    ? constraint.value.toString(10)
    : constraint.value;
  return {
    kind: constraint.kind,
    operator: constraint.operator,
    value,
    approvalRequirement,
  };
}
