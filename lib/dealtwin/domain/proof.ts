import type { Result } from "./result";

export type ProofStatus = "VALID" | "CONDITIONALLY_VALID" | "STALE" | "INVALID";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ApprovalKind = "non_arithmetic_authorization" | "arithmetic_uncertainty";

export interface Approval {
  readonly id: string;
  readonly proofId: string;
  readonly dealVersionId: string;
  readonly kind: ApprovalKind;
  readonly status: ApprovalStatus;
  readonly requirementCode?: string;
}

export interface DealProof {
  readonly id: string;
  readonly dealId: string;
  readonly dealVersionId: string;
  readonly status: ProofStatus;
  readonly canonicalEventHash: string;
  readonly approvals: readonly Approval[];
}

function failure(code: string, message: string): Result<true> {
  return { ok: false, error: { code, message } };
}

function validateCurrentProof(proof: DealProof): Result<true> {
  if (proof.status !== "VALID" && proof.status !== "CONDITIONALLY_VALID") {
    return failure("PROOF_NOT_CURRENT", "Proof must be valid and current.");
  }
  if (proof.approvals.some((approval) => approval.proofId !== proof.id || approval.dealVersionId !== proof.dealVersionId)) {
    return failure("APPROVAL_IDENTITY_MISMATCH", "Approval must belong to this proof and Deal version.");
  }
  if (proof.approvals.some((approval) => approval.status === "rejected")) {
    return failure("APPROVAL_REJECTED", "A required approval was rejected.");
  }
  return { ok: true, value: true };
}

export function canReserveProof(proof: DealProof): Result<true> {
  const current = validateCurrentProof(proof);
  if (!current.ok) return current;
  if (proof.approvals.some((approval) => approval.kind === "arithmetic_uncertainty" && approval.status !== "approved")) {
    return failure("ARITHMETIC_UNCERTAINTY", "Arithmetic uncertainty must be resolved before reservation.");
  }
  if (proof.status === "CONDITIONALLY_VALID" && !proof.approvals.some((approval) => approval.kind === "non_arithmetic_authorization")) {
    return failure("APPROVAL_STATE_INVALID", "A conditionally valid proof must identify its non-arithmetic approval.");
  }
  if (proof.status === "VALID" && proof.approvals.some((approval) => approval.status === "pending")) {
    return failure("APPROVAL_STATE_INVALID", "A valid proof cannot retain pending approvals.");
  }
  return { ok: true, value: true };
}

export function canCommitProof(proof: DealProof): Result<true> {
  const current = validateCurrentProof(proof);
  if (!current.ok) return current;
  if (proof.status === "CONDITIONALLY_VALID" && !proof.approvals.some((approval) => approval.kind === "non_arithmetic_authorization")) {
    return failure("APPROVAL_STATE_INVALID", "A conditionally valid proof must identify its non-arithmetic approval.");
  }
  if (proof.approvals.some((approval) => approval.status === "pending")) {
    return failure("APPROVAL_REQUIRED", "All blocking approvals must be approved before commit.");
  }
  return { ok: true, value: true };
}
