import { canonicalStringify, sha256Canonical, type CanonicalJsonValue } from "../domain/canonical-json";
import type { ApplicationPorts } from "./ports";
import type { ApprovalDecisionInput, MutationContext, OperationResponse } from "./operation-contracts";

const ACTION = "dealtwin.approval.decide";
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function canonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function response(httpStatus: number, body: CanonicalJsonValue): OperationResponse {
  return { httpStatus, body };
}

function errorResponse(httpStatus: number, code: string, message: string): OperationResponse {
  return response(httpStatus, { ok: false, error: { code, message } });
}

function requestHash(context: MutationContext, input: ApprovalDecisionInput): string {
  return sha256Canonical({
    action: ACTION,
    expectedRevision: context.expectedRevision,
    approvalId: input.approvalId,
    proofId: input.proofId,
    dealVersionId: input.dealVersionId,
    decision: input.decision,
    comment: input.comment,
  });
}

function parseStoredResponse(json: string): OperationResponse | null {
  try {
    const value = JSON.parse(json) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value) || !("httpStatus" in value) || !("body" in value)) {
      return null;
    }
    const record = value as { httpStatus: unknown; body: unknown };
    const httpStatus = record.httpStatus;
    if (typeof httpStatus !== "number" || !Number.isSafeInteger(httpStatus)) return null;
    return { httpStatus, body: record.body as CanonicalJsonValue };
  } catch {
    return null;
  }
}

export async function decideApproval(
  ports: ApplicationPorts,
  context: MutationContext,
  input: ApprovalDecisionInput,
): Promise<OperationResponse> {
  if (context.role !== "approver") {
    return errorResponse(403, "FORBIDDEN_ROLE", "Only an approver may decide an approval.");
  }
  if (!canonicalText(context.tenantId) || !canonicalText(context.actorId) || !canonicalText(context.idempotencyKey)
    || !TIMESTAMP_PATTERN.test(context.now) || !Number.isSafeInteger(context.expectedRevision) || context.expectedRevision < 0) {
    return errorResponse(422, "INVALID_PROOF", "Approval mutation context is invalid.");
  }
  if (!canonicalText(input.approvalId) || !canonicalText(input.proofId) || !canonicalText(input.dealVersionId)
    || !canonicalText(input.comment) || (input.decision !== "approved" && input.decision !== "rejected")) {
    return errorResponse(422, "INVALID_PROOF", "Approval decision input is invalid.");
  }
  const hash = requestHash(context, input);
  const canonicalInput: CanonicalJsonValue = {
    approvalId: input.approvalId,
    proofId: input.proofId,
    dealVersionId: input.dealVersionId,
    decision: input.decision,
    comment: input.comment,
  };
  return ports.transact(context, ACTION, canonicalInput, async (repos) => {
    const existing = await repos.receipts.findSuccess(context.tenantId, ACTION, context.idempotencyKey);
    if (existing) {
      if (existing.actorId !== context.actorId) {
        return errorResponse(403, "FORBIDDEN_ROLE", "Idempotent replay must authenticate the original actor.");
      }
      if (existing.requestHash !== hash) {
        return errorResponse(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency key was reused with a different request.");
      }
      const stored = parseStoredResponse(existing.responseJson);
      if (!stored) return errorResponse(409, "IDEMPOTENCY_KEY_REUSED", "Stored approval receipt is not a canonical response.");
      return stored;
    }
    const proof = await repos.proofs.getById(input.proofId);
    const approval = await repos.approvals.getById(input.approvalId);
    if (!proof || !approval || proof.id !== input.proofId || proof.dealVersionId !== input.dealVersionId
      || approval.proofId !== input.proofId || approval.dealVersionId !== input.dealVersionId
      || approval.proofId !== proof.id || approval.dealVersionId !== proof.dealVersionId) {
      return errorResponse(422, "APPROVAL_IDENTITY_MISMATCH", "Approval must belong to this proof and Deal version.");
    }
    const updated = {
      ...approval,
      status: input.decision,
      comment: input.comment,
      decidedBy: context.actorId,
      decidedAt: context.now,
    };
    await repos.approvals.save(updated);
    const body: CanonicalJsonValue = {
      ok: true,
      action: ACTION,
      approvalId: input.approvalId,
      proofId: input.proofId,
      dealVersionId: input.dealVersionId,
      status: input.decision,
      proofUnchanged: true,
    };
    const succeeded = response(200, body);
    const encoded = { httpStatus: succeeded.httpStatus, body: succeeded.body };
    await repos.receipts.appendSuccess({
      tenantId: context.tenantId,
      actorId: context.actorId,
      action: ACTION,
      idempotencyKey: context.idempotencyKey,
      requestHash: hash,
      responseJson: canonicalStringify(encoded),
      responseHash: sha256Canonical(encoded),
      priorRevision: context.expectedRevision,
      currentRevision: context.expectedRevision + 1,
      createdAt: context.now,
    });
    return succeeded;
  });
}
