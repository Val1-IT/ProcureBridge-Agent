import { canonicalStringify, sha256Canonical } from '../domain/canonical-json';
import { canonicalCashEventDto } from '../domain/canonical-event';
import { isSelfReservation, type CommitmentStatus } from '../domain/commitment';
import { transitionCommitment } from '../domain/state-machine';
import { normalizeExternalCommitments } from '../erp/build-snapshot';
import { dependencyKey, type DependencyChange } from '../erp/dependency-manifest';
import { QUERY_ACTIVE_COMMITMENTS_KEY } from '../erp/dependency-keys';
import { assertJudgeActor } from './judge-seed-service';
import type { CommitmentPort, StoredCommitment } from './commitment-service';
import type { CommitmentCommandInput, MutationContext, OperationReceipt, OperationResponse } from './operation-contracts';

export type LifecycleOperation = 'release' | 'expire' | 'cancel';
export interface LifecycleCommitment extends StoredCommitment {
  readonly expiresAt: string | null;
  // Computed with PostgreSQL timestamp precision against the injected server clock.
  readonly expiryDue: boolean;
}
export interface LifecycleWrite {
  readonly commitment: LifecycleCommitment;
  readonly input: CommitmentCommandInput;
  readonly operation: LifecycleOperation;
  readonly status: CommitmentStatus;
  readonly allowedStatuses: readonly CommitmentStatus[];
}
const targets = { release: 'released', expire: 'expired', cancel: 'cancelled' } as const;
const actions = { release: 'dealtwin.commitment.released', expire: 'dealtwin.commitment.expired', cancel: 'dealtwin.commitment.cancelled' } as const;
const statuses: readonly CommitmentStatus[] = ['reserved', 'committed', 'released', 'expired', 'cancelled'];
const error = (code: string, httpStatus = 409): OperationResponse => ({ httpStatus, body: { ok: false, error: { code } } });
function capacityHashes(rows: readonly StoredCommitment[]): Map<string, string> {
  const normalized = normalizeExternalCommitments(rows, null);
  if (!normalized.ok) throw new Error(`Invalid capacity evidence: ${normalized.error.code}`);
  const events = normalized.value;
  const hashes = new Map([[QUERY_ACTIVE_COMMITMENTS_KEY, sha256Canonical(events.map(canonicalCashEventDto))]]);
  for (const key of new Set(events.map(event => event.dependencyKey))) {
    hashes.set(key, sha256Canonical(events.filter(event => event.dependencyKey === key).map(canonicalCashEventDto)));
  }
  return hashes;
}
export async function runCommitmentLifecycle(port: CommitmentPort, context: MutationContext, input: CommitmentCommandInput, operation: LifecycleOperation): Promise<OperationResponse> {
  try { assertJudgeActor(context); } catch { return error('FORBIDDEN_JUDGE_CONTEXT', 403); }
  if (context.role !== 'admin' && context.role !== 'sales') return error('FORBIDDEN_ROLE', 403);
  const text = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,128}$/.test(value);
  if (!text(context.idempotencyKey) || !Number.isSafeInteger(context.expectedRevision) || context.expectedRevision < 0 || context.expectedRevision >= Number.MAX_SAFE_INTEGER
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(context.now) || !Number.isFinite(Date.parse(context.now))
    || !text(input.commitmentId) || !text(input.proofId) || !text(input.dealVersionId) || !/^[0-9a-f]{64}$/.test(input.canonicalEventHash)) return error('INVALID_REQUEST', 422);
  const action = actions[operation];
  const requestHash = sha256Canonical({ action, expectedRevision: context.expectedRevision, commitmentId: input.commitmentId,
    proofId: input.proofId, dealVersionId: input.dealVersionId, canonicalEventHash: input.canonicalEventHash });
  return port.transact(context, async tx => {
    // Replay is independent of current revision, lifecycle status, existence, or Judge reset.
    const receipt = await tx.receipts.findSuccess(context.tenantId, action, context.idempotencyKey);
    if (receipt) {
      if (receipt.actorId !== context.actorId) return error('FORBIDDEN_ROLE', 403);
      if (receipt.requestHash !== requestHash) return error('IDEMPOTENCY_KEY_REUSED');
      return JSON.parse(receipt.responseJson) as OperationResponse;
    }
    if (tx.revision !== context.expectedRevision) return error('REVISION_CONFLICT');
    const commitment = await tx.getCommitment(input.commitmentId);
    if (!commitment) return error('COMMITMENT_NOT_FOUND', 404);
    if (!isSelfReservation(commitment, input)) return error('COMMITMENT_IDENTITY_MISMATCH', 422);
    const status = targets[operation];
    const transition = transitionCommitment(commitment, status);
    if (!transition.ok) return error(transition.error.code);
    if (operation === 'expire' && !commitment.expiryDue) return error('COMMITMENT_NOT_EXPIRED');
    const version = await tx.getVersion(commitment.dealVersionId);
    const deal = version ? await tx.getDeal(version.dealId) : null;
    if (!deal || !version) throw new Error('Missing historical commitment aggregate');
    // Cleanup is not an allocation: a STALE proof must not trap reserved capacity.
    // Validate canonical capacity evidence, but never recompile or mutate ERP/Sales Order/cash.
    const before = capacityHashes(await tx.listCommitments());
    const updated = await tx.transitionCommitment({ commitment, input, operation, status,
      allowedStatuses: statuses.filter(source => transitionCommitment({ ...commitment, status: source }, status).ok) });
    const revision = await tx.advanceRevision();
    const after = capacityHashes(await tx.listCommitments());
    const changes: DependencyChange['changes'] = [...new Set([...before.keys(), ...after.keys()])].sort()
      .filter(key => before.get(key) !== after.get(key))
      .map(key => ({ key: dependencyKey(key), beforeHash: before.get(key) ?? null, afterHash: after.get(key) ?? null }));
    await tx.invalidate({ tenantId: context.tenantId, priorRevision: tx.revision, currentRevision: revision, changes,
      self: input, selfCapacityKeys: changes.filter(change => change.key === QUERY_ACTIVE_COMMITMENTS_KEY || change.key === `dealtwin.commitment:${commitment.id}`).map(change => change.key) }, input);
    const response: OperationResponse = { httpStatus: 200, body: { ok: true, action, commitmentId: updated.id, status: updated.status,
      dealId: deal.id, proofId: input.proofId, dealVersionId: input.dealVersionId, canonicalEventHash: input.canonicalEventHash,
      salesOrderId: deal.committedSalesOrderId, revision, expiresAt: updated.expiresAt } };
    const encoded = { httpStatus: response.httpStatus, body: response.body };
    const success: OperationReceipt = { tenantId: context.tenantId, actorId: context.actorId, action, idempotencyKey: context.idempotencyKey,
      requestHash, responseJson: canonicalStringify(encoded), responseHash: sha256Canonical(encoded),
      priorRevision: tx.revision, currentRevision: revision, createdAt: context.now,
      detail: { schemaVersion: 'dealtwin.audit.v1', actorRole: context.role, dealId: deal.id, commitmentId: commitment.id,
        proofId: input.proofId, dealVersionId: input.dealVersionId, canonicalEventHash: input.canonicalEventHash,
        priorStatus: commitment.status, status, salesOrderId: deal.committedSalesOrderId, expiresAt: commitment.expiresAt } };
    await tx.receipts.appendSuccess(success); // This immutable audit IS the one successful operation audit.
    return response;
  });
}
