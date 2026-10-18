export type CommitmentStatus = "reserved" | "committed" | "released" | "expired" | "cancelled";

export interface SelfReservationIdentity {
  readonly proofId: string;
  readonly dealVersionId: string;
  readonly canonicalEventHash: string;
}

export interface LiquidityCommitment extends SelfReservationIdentity {
  readonly id: string;
  readonly status: CommitmentStatus;
}

export function isSelfReservation(commitment: SelfReservationIdentity, identity: SelfReservationIdentity): boolean {
  return commitment.proofId === identity.proofId
    && commitment.dealVersionId === identity.dealVersionId
    && commitment.canonicalEventHash === identity.canonicalEventHash;
}
