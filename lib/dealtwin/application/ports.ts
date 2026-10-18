import type { CanonicalJsonValue } from "../domain/canonical-json";
import type { SelfReservationIdentity } from "../domain/commitment";
import type { Approval } from "../domain/proof";
import type { DependencyChange } from "../erp/dependency-manifest";
import type { DealProofDto } from "../proof/proof-dto";
import type { MutationContext, OperationReceipt } from "./operation-contracts";

export interface ApprovalRecord extends Approval {
  readonly comment: string | null;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
}

export interface ProofRepository {
  getById(proofId: string): Promise<DealProofDto | null>;
}

export interface ApprovalRepository {
  getById(approvalId: string): Promise<ApprovalRecord | null>;
  listByProofVersion(proofId: string, dealVersionId: string): Promise<readonly ApprovalRecord[]>;
  save(record: ApprovalRecord): Promise<void>;
}

export interface OperationReceiptRepository {
  findSuccess(tenantId: string, action: string, idempotencyKey: string): Promise<OperationReceipt | null>;
  appendSuccess(receipt: OperationReceipt): Promise<void>;
}

export interface TransactionScopedRepositories {
  readonly proofs: ProofRepository;
  readonly approvals: ApprovalRepository;
  readonly receipts: OperationReceiptRepository;
  invalidate(change: DependencyChange, self: SelfReservationIdentity | null): Promise<readonly string[]>;
}

export interface ApplicationPorts {
  transact<T>(
    context: MutationContext,
    action: string,
    input: CanonicalJsonValue,
    work: (repos: TransactionScopedRepositories) => Promise<T>,
  ): Promise<T>;
}
