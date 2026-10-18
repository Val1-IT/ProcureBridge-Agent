import type { CanonicalJsonValue } from "../domain/canonical-json";
import type { SelfReservationIdentity } from "../domain/commitment";

export interface ActorContext {
  readonly tenantId: string;
  readonly actorId: string;
  readonly role: "admin" | "procurement" | "warehouse" | "sales" | "finance" | "approver";
}

export interface MutationContext extends ActorContext {
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
  readonly now: string;
}

export type ProofCommandInput = SelfReservationIdentity;

export interface CommitmentCommandInput extends SelfReservationIdentity {
  readonly commitmentId: string;
}

export interface ApprovalDecisionInput {
  readonly approvalId: string;
  readonly proofId: string;
  readonly dealVersionId: string;
  readonly decision: "approved" | "rejected";
  readonly comment: string;
}

export interface OperationResponse {
  readonly httpStatus: number;
  readonly body: CanonicalJsonValue;
}

export interface OperationReceipt {
  readonly detail?: Readonly<Record<string, string | number | boolean | null>>;
  readonly tenantId: string;
  readonly actorId: string;
  readonly action: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly responseJson: string;
  readonly responseHash: string;
  readonly priorRevision: number;
  readonly currentRevision: number;
  readonly createdAt: string;
}
