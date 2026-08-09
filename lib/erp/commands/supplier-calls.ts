import { isStrictIsoDate, isStrictIsoInstant } from "../date-validation";
import type { ErpCommandResult } from "../errors";
import { authorize } from "../permissions";
import type { ErpRole, ErpState, SupplierCall, SupplierCallApproval, SupplierCallScenario } from "../types";
import { appendErpAudit, commitErpState, isErpRole, rejectErpCommand } from "./shared";

export interface SaveSupplierCallApprovalInput {
  supplierCallId: string;
  supplierId: string;
  purchaseOrderId: string;
  scenario: SupplierCallScenario;
  objective: string;
  permittedProductIds: readonly string[];
  maximumDeliveryDate: string;
  partialDeliveryAllowed: boolean;
  maximumUnitPriceIncreasePercent: number;
  language: string;
  callTime: string;
  approvedBy: string;
}

function invalid<T>(state: ErpState, message: string): ErpCommandResult<T> {
  return rejectErpCommand(state, { code: "INVALID_INPUT", message });
}

function hasValidTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}

export function saveSupplierCallApproval(state: ErpState, role: ErpRole, input: SaveSupplierCallApprovalInput, now: string): ErpCommandResult<SupplierCallApproval> {
  if (!isErpRole(role)) return invalid(state, "Active role is invalid.");
  if (!authorize(role, "call.approve")) return rejectErpCommand(state, { code: "FORBIDDEN", message: "You do not have permission to approve supplier calls." });
  if (!isStrictIsoInstant(now)) return invalid(state, "Approval time is invalid.");
  if (!input.supplierCallId.trim() || !input.objective.trim() || !input.language.trim() || !input.approvedBy.trim()) return invalid(state, "Supplier call approval is incomplete.");
  if (!isStrictIsoDate(input.maximumDeliveryDate) || input.maximumDeliveryDate < now.slice(0, 10) || !hasValidTime(input.callTime)) return invalid(state, "Supplier call date or time boundary is invalid.");
  if (typeof input.partialDeliveryAllowed !== "boolean" || !Number.isFinite(input.maximumUnitPriceIncreasePercent) || input.maximumUnitPriceIncreasePercent < 0 || input.maximumUnitPriceIncreasePercent > 100) return invalid(state, "Supplier call commercial boundary is invalid.");
  const supplier = state.suppliers.find((item) => item.id === input.supplierId && item.active);
  const purchaseOrder = state.purchaseOrders.find((item) => item.id === input.purchaseOrderId);
  if (!supplier || !purchaseOrder || purchaseOrder.supplierId !== supplier.id) return rejectErpCommand(state, { code: "NOT_FOUND", message: "Supplier or purchase order was not found." });
  if (!["sent", "confirmed", "partially_received"].includes(purchaseOrder.status)) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Purchase order is not eligible for supplier follow-up." });
  const permitted = new Set(input.permittedProductIds);
  if (permitted.size !== input.permittedProductIds.length || permitted.size !== purchaseOrder.lines.length || !purchaseOrder.lines.every((line) => permitted.has(line.productId))) return invalid(state, "Approval must cover every unique product in the purchase order.");
  const existingCall = state.supplierCalls.find((call) => call.id === input.supplierCallId);
  if (existingCall && (existingCall.supplierId !== supplier.id || existingCall.purchaseOrderId !== purchaseOrder.id || existingCall.status !== "draft")) return rejectErpCommand(state, { code: "INVALID_STATE", message: "Supplier call draft does not match this approval." });

  const call: SupplierCall = existingCall ?? {
    id: input.supplierCallId, supplierId: supplier.id, purchaseOrderId: purchaseOrder.id, status: "draft", scenario: input.scenario,
    provider: null, providerCallId: null, calledLocalDate: null, transcript: [], durationSeconds: 0, startedAt: null, endedAt: null,
    createdAt: now, updatedAt: now,
  };
  const approval: SupplierCallApproval = {
    id: `supplier-approval-${input.supplierCallId}`, supplierCallId: call.id, supplierId: supplier.id, purchaseOrderId: purchaseOrder.id, status: "approved",
    objective: input.objective.trim(), permittedProductIds: [...input.permittedProductIds], maximumDeliveryDate: input.maximumDeliveryDate,
    partialDeliveryAllowed: input.partialDeliveryAllowed, maximumUnitPriceIncreasePercent: input.maximumUnitPriceIncreasePercent,
    language: input.language.trim(), callTime: input.callTime, approvedBy: input.approvedBy.trim(), createdAt: now, updatedAt: now,
  };
  const staged: ErpState = {
    ...state,
    supplierCalls: existingCall ? state.supplierCalls.map((item) => item.id === call.id ? { ...call, scenario: input.scenario, updatedAt: now } : item) : [...state.supplierCalls, call],
    supplierApprovals: [...state.supplierApprovals.filter((item) => item.supplierCallId !== call.id), approval],
  };
  const next = appendErpAudit(staged, {
    entityType: "supplier_call", entityId: call.id, action: "supplier_call.approved", actorRole: role, actorId: `role:${role}`,
    detail: { supplierId: supplier.id, purchaseOrderId: purchaseOrder.id, scenario: input.scenario, approvedBy: approval.approvedBy },
  }, now);
  return commitErpState(state, next, approval);
}
