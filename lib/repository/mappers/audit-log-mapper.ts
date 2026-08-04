import type { AuditLog } from "../../domain/types";
import { enumText, MapperError, nullableText, optionalArray, record, text } from "./mapper-utils";

export interface AuditLogRow { id: string; entity_type: string; entity_id: string; action: string; actor_type: AuditLog["actorType"]; actor_id: string; before_data: unknown; after_data: unknown; created_at: string; api_request_id: string | null; guardrail_violations: string[] }

export function toAuditLogRow(value: AuditLog): AuditLogRow {
  return { id: value.id, entity_type: value.entityType, entity_id: value.entityId, action: value.action, actor_type: value.actorType, actor_id: value.actorId, before_data: value.beforeData, after_data: value.afterData, created_at: value.createdAt, api_request_id: value.apiRequestId ?? null, guardrail_violations: value.guardrailViolations ?? [] };
}

export function fromAuditLogRow(input: unknown): AuditLog {
  const row = record(input, "audit log");
  const violations = (optionalArray(row, "guardrail_violations", "audit log") ?? []).map((value) => { if (typeof value !== "string") throw new MapperError("audit log", "guardrail_violations must contain text"); return value; });
  const requestId = nullableText(row, "api_request_id", "audit log");
  return { id: text(row, "id", "audit log"), entityType: text(row, "entity_type", "audit log"), entityId: text(row, "entity_id", "audit log"), action: text(row, "action", "audit log"), actorType: enumText(row, "actor_type", ["human", "ai", "system", "provider"] as const, "audit log"), actorId: text(row, "actor_id", "audit log"), beforeData: row.before_data ?? null, afterData: row.after_data ?? null, createdAt: text(row, "created_at", "audit log"), ...(requestId ? { apiRequestId: requestId } : {}), ...(violations.length ? { guardrailViolations: violations } : {}) };
}
