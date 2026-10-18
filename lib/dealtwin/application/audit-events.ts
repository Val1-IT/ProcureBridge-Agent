import { canonicalStringify, sha256Canonical } from '../domain/canonical-json';
import type { MutationContext, OperationReceipt, OperationResponse, ProofCommandInput } from './operation-contracts';

export const RESERVE_ACTION = 'dealtwin.commitment.reserved';
export const COMMIT_ACTION = 'dealtwin.commitment.committed';
export interface CommitmentTarget extends ProofCommandInput { readonly dealId?: string; }
export function commitmentRequestHash(action: string, context: MutationContext, input: CommitmentTarget): string {
  return sha256Canonical({ action, expectedRevision: context.expectedRevision, dealId: input.dealId ?? null,
    proofId: input.proofId, dealVersionId: input.dealVersionId, canonicalEventHash: input.canonicalEventHash });
}
export function commitmentReceipt(context: MutationContext, action: string, input: CommitmentTarget, result: OperationResponse,
  revision: number, dealId: string, commitmentId: string, salesOrderId: string | null): OperationReceipt {
  const encoded = { httpStatus: result.httpStatus, body: result.body };
  return { tenantId: context.tenantId, actorId: context.actorId, action, idempotencyKey: context.idempotencyKey,
    requestHash: commitmentRequestHash(action, context, input), responseJson: canonicalStringify(encoded), responseHash: sha256Canonical(encoded),
    priorRevision: context.expectedRevision, currentRevision: revision, createdAt: context.now,
    detail: { schemaVersion: 'dealtwin.audit.v1', actorRole: context.role, dealId, proofId: input.proofId, dealVersionId: input.dealVersionId,
      canonicalEventHash: input.canonicalEventHash, commitmentId, salesOrderId } };
}
