import type { ErpCommandResult, ErpError } from "../errors";
import type { ErpAuditEvent, ErpRole, ErpState } from "../types";

export function commitErpState<T>(before: ErpState, next: Omit<ErpState, "revision">, value: T): ErpCommandResult<T> {
  return { ok: true, state: { ...next, revision: before.revision + 1 }, value };
}

export function rejectErpCommand<T>(state: ErpState, error: ErpError): ErpCommandResult<T> {
  return { ok: false, state, error };
}

export function appendErpAudit(
  state: ErpState,
  event: Omit<ErpAuditEvent, "id" | "createdAt" | "updatedAt">,
  now: string,
): Omit<ErpState, "revision"> {
  const { revision: _revision, ...next } = state;
  const audit: ErpAuditEvent = {
    ...event,
    id: `erp-audit-${state.revision + 1}`,
    createdAt: now,
    updatedAt: now,
  };
  return { ...next, auditLogs: [...state.auditLogs, audit] };
}

export function isErpRole(role: unknown): role is ErpRole {
  return role === "admin" || role === "procurement" || role === "warehouse" || role === "sales" || role === "finance" || role === "approver";
}
