import type { Deal, DealStatus } from "./deal";
import type { LiquidityCommitment, CommitmentStatus } from "./commitment";
import type { DealProof, ProofStatus } from "./proof";
import type { Result } from "./result";

const dealTransitions: Readonly<Record<DealStatus, readonly DealStatus[]>> = {
  DRAFT: ["COMPILED"],
  COMPILED: ["PROOF_GENERATED"],
  PROOF_GENERATED: ["RESERVED", "STALE"],
  RESERVED: ["STALE"],
  COMMITTED: ["STALE"],
  STALE: ["COMPILED"],
};

function invalid<T>(code: string, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}

export function transitionDeal(deal: Deal, next: DealStatus): Result<Deal> {
  if (next === "COMMITTED") return invalid("COMMIT_REQUIRES_SALES_ORDER", "Use the atomic commit transition to link a Sales Order.");
  if (!dealTransitions[deal.status].includes(next)) return invalid("INVALID_DEAL_TRANSITION", `Cannot transition Deal from ${deal.status} to ${next}.`);
  return { ok: true, value: { ...deal, status: next } };
}

export function commitDealLifecycle(deal: Deal, salesOrderId: string): Result<Deal> {
  if (deal.committedSalesOrderId !== null || deal.status === "COMMITTED") {
    return invalid("DEAL_ALREADY_COMMITTED", "Deal already has an operational Sales Order.");
  }
  if (deal.status !== "RESERVED") return invalid("INVALID_DEAL_TRANSITION", `Cannot commit Deal from ${deal.status}.`);
  if (typeof salesOrderId !== "string" || salesOrderId.trim() !== salesOrderId || salesOrderId.length === 0) {
    return invalid("INVALID_SALES_ORDER_ID", "Sales Order ID must be non-empty.");
  }
  return { ok: true, value: { ...deal, status: "COMMITTED", committedSalesOrderId: salesOrderId } };
}

export function transitionProof(proof: DealProof, next: ProofStatus): Result<DealProof> {
  const allowed = (proof.status === "VALID" || proof.status === "CONDITIONALLY_VALID") && (next === "STALE" || next === "INVALID");
  return allowed
    ? { ok: true, value: { ...proof, status: next } }
    : invalid("INVALID_PROOF_TRANSITION", `Cannot transition proof from ${proof.status} to ${next}.`);
}

export function transitionCommitment(commitment: LiquidityCommitment, next: CommitmentStatus): Result<LiquidityCommitment> {
  const allowed = commitment.status === "reserved"
    ? ["committed", "released", "expired", "cancelled"].includes(next)
    : commitment.status === "committed" && ["released", "cancelled"].includes(next);
  return allowed
    ? { ok: true, value: { ...commitment, status: next } }
    : invalid("INVALID_COMMITMENT_TRANSITION", `Cannot transition commitment from ${commitment.status} to ${next}.`);
}
