import type { PoolClient } from "pg";
import { sha256Canonical, type CanonicalJsonValue } from "../../dealtwin/domain/canonical-json";
import type { OperationReceipt, OperationResponse } from "../../dealtwin/application/operation-contracts";
import { IdempotencyKeyReusedError, PersistenceIntegrityError, isPostgresError } from "./errors";
import {
  asIsoInstant,
  isRecord,
  parseNonNegativeSafeInteger,
  requireCanonicalText,
  requireHash,
  uniqueOrNone,
} from "./pg-codec";

const SUCCESS_FLAG = "true";

function receiptId(receipt: Pick<OperationReceipt, "tenantId" | "action" | "idempotencyKey">): string {
  return `dealtwin.receipt:${sha256Canonical({
    tenantId: receipt.tenantId,
    action: receipt.action,
    idempotencyKey: receipt.idempotencyKey,
  })}`;
}

function parseResponseJson(json: string): OperationResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new PersistenceIntegrityError("Stored operation receipt JSON is not valid.");
  }
  if (!isRecord(parsed) || !("httpStatus" in parsed) || !("body" in parsed)) {
    throw new PersistenceIntegrityError("Stored operation receipt is not an OperationResponse.");
  }
  const httpStatus = parsed.httpStatus;
  if (typeof httpStatus !== "number" || !Number.isSafeInteger(httpStatus)) {
    throw new PersistenceIntegrityError("Stored operation receipt HTTP status is invalid.");
  }
  return { httpStatus, body: parsed.body as CanonicalJsonValue };
}

function verifyResponseHash(responseJson: string, responseHash: string): OperationResponse {
  const response = parseResponseJson(responseJson);
  const actual = sha256Canonical({ httpStatus: response.httpStatus, body: response.body });
  if (actual !== responseHash) {
    throw new PersistenceIntegrityError("Stored operation receipt response hash does not match canonical JSON.");
  }
  return response;
}

function decodeReceipt(row: Record<string, unknown>): OperationReceipt {
  const detail = requireObject(row.detail, "erp_audit_events.detail");
  const responseJson = requireCanonicalText(detail.responseJson, "receipt.responseJson");
  const responseHash = requireHash(detail.responseHash, "receipt.responseHash");
  verifyResponseHash(responseJson, responseHash);
  const succeeded = detail.operationSucceeded;
  if (succeeded !== true && succeeded !== SUCCESS_FLAG) {
    throw new PersistenceIntegrityError("Receipt row is not a successful operation.");
  }
  return {
    tenantId: requireCanonicalText(row.tenant_id, "receipt.tenantId"),
    actorId: requireCanonicalText(detail.actorId ?? row.actor_id, "receipt.actorId"),
    action: requireCanonicalText(row.action, "receipt.action"),
    idempotencyKey: requireCanonicalText(detail.idempotencyKey, "receipt.idempotencyKey"),
    requestHash: requireHash(detail.requestHash, "receipt.requestHash"),
    responseJson,
    responseHash,
    priorRevision: parseNonNegativeSafeInteger(detail.priorRevision, "receipt.priorRevision"),
    currentRevision: parseNonNegativeSafeInteger(detail.currentRevision, "receipt.currentRevision"),
    createdAt: asIsoInstant(row.created_at, "receipt.createdAt"),
  };
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new PersistenceIntegrityError(`${label} must be an object.`);
  return value;
}

async function loadSuccessRow(
  tx: PoolClient,
  tenantId: string,
  action: string,
  key: string,
): Promise<Record<string, unknown> | null> {
  const result = await tx.query<Record<string, unknown>>(
    `select tenant_id, actor_id, action, detail, created_at
     from public.erp_audit_events
     where tenant_id = $1
       and action = $2
       and detail->>'operationSucceeded' = 'true'
       and detail->>'idempotencyKey' = $3
     order by id`,
    [requireCanonicalText(tenantId, "tenantId"), requireCanonicalText(action, "action"), requireCanonicalText(key, "idempotencyKey")],
  );
  const row = uniqueOrNone(result.rows, "success operation receipt");
  return row;
}

export async function findSuccessReceipt(
  tx: PoolClient,
  tenantId: string,
  action: string,
  key: string,
): Promise<OperationReceipt | null> {
  const row = await loadSuccessRow(tx, tenantId, action, key);
  return row ? decodeReceipt(row) : null;
}

export async function readOperationReceipt(
  tx: PoolClient,
  tenantId: string,
  action: string,
  key: string,
  requestHash: string,
): Promise<OperationResponse | null> {
  const receipt = await findSuccessReceipt(tx, tenantId, action, key);
  if (!receipt) return null;
  if (receipt.requestHash !== requireHash(requestHash, "requestHash")) {
    throw new IdempotencyKeyReusedError();
  }
  return parseResponseJson(receipt.responseJson);
}

export async function appendOperationReceipt(tx: PoolClient, receipt: OperationReceipt): Promise<void> {
  const tenantId = requireCanonicalText(receipt.tenantId, "receipt.tenantId");
  const action = requireCanonicalText(receipt.action, "receipt.action");
  if (!action.startsWith("dealtwin.")) {
    throw new PersistenceIntegrityError("Success receipts must use a dealtwin.* action.");
  }
  const response = verifyResponseHash(
    requireCanonicalText(receipt.responseJson, "receipt.responseJson"),
    requireHash(receipt.responseHash, "receipt.responseHash"),
  );
  void response;
  const createdAt = asIsoInstant(receipt.createdAt, "receipt.createdAt");
  const detail = {
    ...receipt.detail,
    schemaVersion: "dealtwin.audit.v1",
    tenantId,
    operationSucceeded: true,
    idempotencyKey: requireCanonicalText(receipt.idempotencyKey, "receipt.idempotencyKey"),
    requestHash: requireHash(receipt.requestHash, "receipt.requestHash"),
    responseHash: receipt.responseHash,
    responseJson: receipt.responseJson,
    actorId: requireCanonicalText(receipt.actorId, "receipt.actorId"),
    priorRevision: parseNonNegativeSafeInteger(receipt.priorRevision, "receipt.priorRevision"),
    currentRevision: parseNonNegativeSafeInteger(receipt.currentRevision, "receipt.currentRevision"),
  };
  try {
    await tx.query(
      `insert into public.erp_audit_events (
         tenant_id, id, entity_type, entity_id, action, actor_role, actor_id, detail, created_at, updated_at
       ) values (
         $1, $2, 'dealtwin_operation', $3, $4, 'system', $5, $6::jsonb, $7, $7
       )`,
      [
        tenantId,
        receiptId(receipt),
        receipt.idempotencyKey,
        action,
        receipt.actorId,
        JSON.stringify(detail),
        createdAt,
      ],
    );
  } catch (error) {
    if (isPostgresError(error) && error.code === "23505") {
      throw new PersistenceIntegrityError("A successful operation receipt already exists for this idempotency key.");
    }
    throw error;
  }
}
