import { getSupplierScenarioTranscript } from "../../supplier-call/scripts";
import { getJakartaClock } from "../../supplier-call/jakarta-clock";
import type { CreateSupplierCallResult } from "../../supplier-call/types";
import { isStrictIsoDate, isStrictIsoInstant } from "../date-validation";
import type { ErpCommandResult } from "../errors";
import { evaluateSupplierCallEligibility } from "../guardrails/supplier-call";
import { authorize } from "../permissions";
import { isPositiveWholeQuantity } from "../quantity";
import type { ErpDispute, ErpFollowUp, ErpRole, ErpState, SupplierCall, SupplierCallResult, SupplierCallScenario } from "../types";
import { appendErpAudit, commitErpState, isErpRole, rejectErpCommand } from "./shared";

export interface EditSupplierResultPatch {
  scenario?: SupplierCallScenario;
  promisedDeliveryDate?: string | null;
  partialDeliveryDate?: string | null;
  remainingDeliveryDate?: string | null;
  followUpDate?: string | null;
  reason?: string | null;
  summary?: string;
  sentiment?: SupplierCallResult["sentiment"];
}

const editableFields = new Set<keyof EditSupplierResultPatch>([
  "scenario", "promisedDeliveryDate", "partialDeliveryDate", "remainingDeliveryDate", "followUpDate", "reason", "summary", "sentiment",
]);
const supplierScenarios: readonly SupplierCallScenario[] = ["delivery_commitment", "partial_delivery", "stock_unavailable", "price_discrepancy", "failed_contact"];
const supplierSentiments: readonly SupplierCallResult["sentiment"][] = ["positive", "neutral", "concerned"];

function validEditPatch(patch: Record<string, unknown>): boolean {
  if (Object.hasOwn(patch, "scenario") && (typeof patch.scenario !== "string" || !supplierScenarios.includes(patch.scenario as SupplierCallScenario))) return false;
  if (Object.hasOwn(patch, "sentiment") && (typeof patch.sentiment !== "string" || !supplierSentiments.includes(patch.sentiment as SupplierCallResult["sentiment"]))) return false;
  if (Object.hasOwn(patch, "summary") && (typeof patch.summary !== "string" || !patch.summary.trim())) return false;
  if (Object.hasOwn(patch, "reason") && patch.reason !== null && (typeof patch.reason !== "string" || !patch.reason.trim())) return false;
  return ["promisedDeliveryDate", "partialDeliveryDate", "remainingDeliveryDate", "followUpDate"].every((field) => !Object.hasOwn(patch, field) || patch[field] === null || (typeof patch[field] === "string" && isStrictIsoDate(patch[field])));
}

function reject<T>(state: ErpState, code: "FORBIDDEN" | "INVALID_INPUT" | "INVALID_STATE" | "NOT_FOUND", message: string): ErpCommandResult<T> {
  return rejectErpCommand(state, { code, message });
}

function authorizeReview<T>(state: ErpState, role: ErpRole): ErpCommandResult<T> | null {
  if (!isErpRole(role)) return reject(state, "INVALID_INPUT", "Active role is invalid.");
  if (!authorize(role, "call.approve")) return reject(state, "FORBIDDEN", "You do not have permission to review supplier call results.");
  return null;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function scenarioDraft(call: SupplierCall, maximumDeliveryDate: string): Omit<SupplierCallResult, "id" | "supplierCallId" | "supplierId" | "purchaseOrderId" | "status" | "sourceScenario" | "sourceProvider" | "sourceProviderCallId" | "createdAt" | "updatedAt"> | null {
  const callDate = call.calledLocalDate!;
  switch (call.scenario) {
  case "delivery_commitment": return {
    scenario: call.scenario, promisedDeliveryDate: maximumDeliveryDate, partialDeliveryDate: null, remainingDeliveryDate: null,
    followUpDate: maximumDeliveryDate, reason: null, summary: `Supplier committed to deliver the complete purchase order by ${maximumDeliveryDate}.`, sentiment: "positive",
  };
  case "partial_delivery": return {
    scenario: call.scenario, promisedDeliveryDate: maximumDeliveryDate, partialDeliveryDate: callDate, remainingDeliveryDate: maximumDeliveryDate,
    followUpDate: maximumDeliveryDate, reason: "Part of the order is ready; the remainder needs follow-up.", summary: `Supplier committed to a partial delivery on ${callDate} and the remainder by ${maximumDeliveryDate}.`, sentiment: "neutral",
  };
  case "stock_unavailable": return {
    scenario: call.scenario, promisedDeliveryDate: null, partialDeliveryDate: null, remainingDeliveryDate: null,
    followUpDate: addDays(callDate, 1), reason: "Supplier stock is unavailable.", summary: "Supplier reported unavailable stock; procurement review is required.", sentiment: "concerned",
  };
  case "price_discrepancy": return {
    scenario: call.scenario, promisedDeliveryDate: null, partialDeliveryDate: null, remainingDeliveryDate: null,
    followUpDate: addDays(callDate, 1), reason: "Supplier price differs from the approved purchase order.", summary: "Supplier reported a price discrepancy; no price was changed by the call.", sentiment: "concerned",
  };
  case "failed_contact": return {
    scenario: "failed_contact", promisedDeliveryDate: null, partialDeliveryDate: null, remainingDeliveryDate: null,
    followUpDate: addDays(callDate, 2), reason: "Supplier contact was unsuccessful.", summary: "The supplier could not be reached and requires a policy-checked follow-up.", sentiment: "neutral",
  };
  default: return null;
  }
}

function findResultForStatuses(state: ErpState, resultId: string, allowedStatuses: readonly SupplierCallResult["status"][]): { result: SupplierCallResult; call: SupplierCall } | ErpCommandResult<never> {
  const result = state.supplierResults.find((item) => item.id === resultId);
  if (!result) return reject(state, "NOT_FOUND", "Supplier call result was not found.");
  if (!allowedStatuses.includes(result.status)) return reject(state, "INVALID_STATE", "Supplier call result is not in a reviewable state.");
  const call = state.supplierCalls.find((item) => item.id === result.supplierCallId);
  if (!call || !["completed", "ended_early"].includes(call.status) || !call.provider || !call.providerCallId
    || call.supplierId !== result.supplierId || call.purchaseOrderId !== result.purchaseOrderId
    || call.scenario !== result.sourceScenario || call.provider !== result.sourceProvider || call.providerCallId !== result.sourceProviderCallId) {
    return reject(state, "INVALID_STATE", "Supplier call result provenance is invalid.");
  }
  return { result, call };
}

function findPendingResult(state: ErpState, resultId: string): { result: SupplierCallResult; call: SupplierCall } | ErpCommandResult<never> {
  return findResultForStatuses(state, resultId, ["pending"]);
}

function resultValidation(state: ErpState, result: SupplierCallResult, now: string): string | null {
  const call = state.supplierCalls.find((item) => item.id === result.supplierCallId);
  const approval = state.supplierApprovals.find((item) => item.supplierCallId === result.supplierCallId && item.status === "approved");
  const supplier = state.suppliers.find((item) => item.id === result.supplierId && item.active);
  const purchaseOrder = state.purchaseOrders.find((item) => item.id === result.purchaseOrderId);
  if (!call || !approval || !supplier || !purchaseOrder || purchaseOrder.supplierId !== supplier.id) return "Supplier result context is incomplete.";
  if (!["sent", "confirmed", "partially_received"].includes(purchaseOrder.status)) return "Purchase order is no longer eligible for supplier result approval.";
  const seenProducts = new Set<string>();
  if (!purchaseOrder.lines.length || purchaseOrder.lines.some((line) => {
    const invalid = !line.productId || seenProducts.has(line.productId) || !isPositiveWholeQuantity(line.quantity) || !Number.isSafeInteger(line.unitPrice) || line.unitPrice <= 0;
    seenProducts.add(line.productId);
    return invalid;
  })) return "Purchase order data is no longer valid.";
  if (state.disputes.some((item) => item.purchaseOrderId === purchaseOrder.id && ["open", "investigating"].includes(item.status))) return "An unresolved purchase-order dispute requires human review.";
  if (typeof result.summary !== "string" || !result.summary.trim() || !supplierSentiments.includes(result.sentiment)) return "Supplier result summary or sentiment is invalid.";
  const date = (value: string | null) => value === null || isStrictIsoDate(value);
  if (![result.promisedDeliveryDate, result.partialDeliveryDate, result.remainingDeliveryDate, result.followUpDate].every(date)) return "Supplier result contains an invalid date.";
  switch (result.scenario) {
  case "delivery_commitment":
    if (!result.promisedDeliveryDate || result.promisedDeliveryDate > approval.maximumDeliveryDate || !result.followUpDate) return "Delivery commitment exceeds the approved boundary or lacks follow-up.";
    break;
  case "partial_delivery":
    if (!approval.partialDeliveryAllowed || !result.partialDeliveryDate || !result.remainingDeliveryDate || !result.followUpDate
      || result.partialDeliveryDate > result.remainingDeliveryDate || result.remainingDeliveryDate > approval.maximumDeliveryDate) return "Partial delivery is incomplete or exceeds the approved boundary.";
    break;
  case "stock_unavailable":
  case "price_discrepancy":
    if (!result.reason?.trim() || !result.followUpDate) return "Supplier discrepancy requires a reason and human follow-up date.";
    break;
  case "failed_contact":
    if (!result.followUpDate || result.followUpDate <= now.slice(0, 10) || supplier.doNotContact) {
    return "Failed contact requires a future follow-up and a contactable supplier.";
    }
    break;
  default: return "Supplier result scenario is invalid.";
  }
  return null;
}

export function recordSupplierCallStarted(state: ErpState, role: ErpRole, callId: string, providerResult: CreateSupplierCallResult, dateOrNow: string, maybeNow?: string): ErpCommandResult<SupplierCall> {
  const permission = authorizeReview<SupplierCall>(state, role);
  if (permission) return permission;
  const now = maybeNow ?? dateOrNow;
  if (!isStrictIsoInstant(now)) return reject(state, "INVALID_INPUT", "Supplier call start time is invalid.");
  const clock = getJakartaClock(new Date(now));
  const call = state.supplierCalls.find((item) => item.id === callId);
  const approval = state.supplierApprovals.find((item) => item.supplierCallId === callId && item.status === "approved");
  const supplier = state.suppliers.find((item) => item.id === call?.supplierId);
  const purchaseOrder = state.purchaseOrders.find((item) => item.id === call?.purchaseOrderId);
  if (!call || !approval || !supplier || !purchaseOrder) return reject(state, "NOT_FOUND", "Approved supplier call was not found.");
  if (call.status !== "draft" || providerResult.callId !== call.id || providerResult.provider !== "mock" || !providerResult.providerCallId.trim() || !["creating", "connecting"].includes(providerResult.status)) return reject(state, "INVALID_STATE", "Supplier call provider result does not match the approved demo draft.");
  const decision = evaluateSupplierCallEligibility({
    supplier,
    purchaseOrder,
    approval,
    localTime: clock.time,
    callsToday: state.supplierCalls.filter((item) => item.purchaseOrderId === purchaseOrder.id && item.calledLocalDate === clock.date).length,
    openDispute: state.disputes.some((item) => item.purchaseOrderId === purchaseOrder.id && (item.status === "open" || item.status === "investigating")),
  });
  if (!decision.allowed) return reject(state, "INVALID_STATE", `Supplier call guardrails changed: ${decision.codes.join(", ")}.`);
  const started: SupplierCall = { ...call, status: "active", provider: providerResult.provider, providerCallId: providerResult.providerCallId, calledLocalDate: clock.date, startedAt: now, updatedAt: now };
  const staged: ErpState = { ...state, supplierCalls: state.supplierCalls.map((item) => item.id === call.id ? started : item) };
  const next = appendErpAudit(staged, { entityType: "supplier_call", entityId: call.id, action: "supplier_call.started", actorRole: role, actorId: `role:${role}`, detail: { provider: providerResult.provider, purchaseOrderId: call.purchaseOrderId } }, now);
  return commitErpState(state, next, started);
}

export interface FinishSupplierCallSimulationInput { visibleTranscript: SupplierCall["transcript"]; elapsedSeconds: number }

export function completeSupplierCallSimulation(state: ErpState, role: ErpRole, callId: string, inputOrNow: FinishSupplierCallSimulationInput | string, maybeNow?: string): ErpCommandResult<SupplierCallResult> {
  const permission = authorizeReview<SupplierCallResult>(state, role);
  if (permission) return permission;
  const now = maybeNow ?? (typeof inputOrNow === "string" ? inputOrNow : "");
  if (!isStrictIsoInstant(now)) return reject(state, "INVALID_INPUT", "Supplier call completion time is invalid.");
  const call = state.supplierCalls.find((item) => item.id === callId);
  const approval = state.supplierApprovals.find((item) => item.supplierCallId === callId && item.status === "approved");
  if (!call || !approval) return reject(state, "NOT_FOUND", "Approved supplier call was not found.");
  if (call.status !== "active" || call.provider !== "mock" || !call.providerCallId || !call.calledLocalDate || state.supplierResults.some((item) => item.supplierCallId === call.id && item.status !== "rejected")) return reject(state, "INVALID_STATE", "Supplier simulation cannot be completed from its current state.");
  const scripted = getSupplierScenarioTranscript(call.scenario);
  const input = typeof inputOrNow === "string" ? { visibleTranscript: scripted, elapsedSeconds: scripted.at(-1)?.offsetSeconds ?? 0 } : inputOrNow;
  const transcript = input?.visibleTranscript;
  if (!Array.isArray(transcript) || !Number.isSafeInteger(input.elapsedSeconds) || input.elapsedSeconds < 0 || transcript.length > scripted.length
    || transcript.some((segment, index) => JSON.stringify(segment) !== JSON.stringify(scripted[index]))
    || input.elapsedSeconds !== (transcript.at(-1)?.offsetSeconds ?? 0)) return reject(state, "INVALID_INPUT", "Supplier simulation transcript or elapsed time is invalid.");
  const fullyCompleted = transcript.length === scripted.length;
  const completed: SupplierCall = { ...call, status: fullyCompleted ? "completed" : "ended_early", transcript, durationSeconds: input.elapsedSeconds, endedAt: now, updatedAt: now };
  const drafted = fullyCompleted ? scenarioDraft(call, approval.maximumDeliveryDate) : null;
  if (fullyCompleted && !drafted) return reject(state, "INVALID_STATE", "Supplier simulation scenario is invalid.");
  const result: SupplierCallResult = {
    id: `supplier-result-${call.id}`, supplierCallId: call.id, supplierId: call.supplierId, purchaseOrderId: call.purchaseOrderId, status: fullyCompleted ? "pending" : "human_review",
    sourceScenario: call.scenario, sourceProvider: call.provider, sourceProviderCallId: call.providerCallId,
    ...(fullyCompleted ? drafted! : {
      scenario: "failed_contact" as const, promisedDeliveryDate: null, partialDeliveryDate: null, remainingDeliveryDate: null, followUpDate: null,
      reason: "Call ended before the complete approved script was displayed.", summary: "Incomplete supplier call requires human review; no commitment was extracted.", sentiment: "neutral" as const,
    }), createdAt: now, updatedAt: now,
  };
  const staged: ErpState = { ...state, supplierCalls: state.supplierCalls.map((item) => item.id === call.id ? completed : item), supplierResults: [...state.supplierResults, result] };
  const next = appendErpAudit(staged, { entityType: "supplier_call", entityId: call.id, action: fullyCompleted ? "supplier_call.completed" : "supplier_call.ended_early", actorRole: role, actorId: `role:${role}`, detail: { provider: "mock", scenario: call.scenario, simulation: true, durationSeconds: input.elapsedSeconds, displayedSegments: transcript.length } }, now);
  return commitErpState(state, next, result);
}

export function editSupplierResult(state: ErpState, role: ErpRole, resultId: string, patch: EditSupplierResultPatch, now: string): ErpCommandResult<SupplierCallResult> {
  const permission = authorizeReview<SupplierCallResult>(state, role);
  if (permission) return permission;
  if (!isStrictIsoInstant(now) || !patch || typeof patch !== "object" || Object.keys(patch).length === 0 || Object.keys(patch).some((key) => !editableFields.has(key as keyof EditSupplierResultPatch)) || !validEditPatch(patch as unknown as Record<string, unknown>)) return reject(state, "INVALID_INPUT", "Supplier result edit is invalid.");
  const context = findPendingResult(state, resultId);
  if ("ok" in context) return context;
  const edited: SupplierCallResult = { ...context.result, ...patch, updatedAt: now };
  const issue = resultValidation(state, edited, now);
  if (issue) return reject(state, "INVALID_INPUT", issue);
  const staged: ErpState = { ...state, supplierResults: state.supplierResults.map((item) => item.id === resultId ? edited : item) };
  const next = appendErpAudit(staged, { entityType: "supplier_call_result", entityId: edited.id, action: "supplier_result.edited", actorRole: role, actorId: `role:${role}`, detail: { fromScenario: context.result.scenario, toScenario: edited.scenario } }, now);
  return commitErpState(state, next, edited);
}

export function approveSupplierResult(state: ErpState, role: ErpRole, resultId: string, now: string): ErpCommandResult<SupplierCallResult> {
  const permission = authorizeReview<SupplierCallResult>(state, role);
  if (permission) return permission;
  if (!isStrictIsoInstant(now)) return reject(state, "INVALID_INPUT", "Supplier result review time is invalid.");
  const context = findPendingResult(state, resultId);
  if ("ok" in context) return context;
  const issue = resultValidation(state, context.result, now);
  if (issue) return reject(state, "INVALID_STATE", issue);
  const result = context.result;
  if (state.followUps.some((item) => item.id === `supplier-follow-up-${result.id}`) || state.disputes.some((item) => item.id === `supplier-dispute-${result.id}`)) return reject(state, "INVALID_STATE", "Supplier result has already created downstream work.");

  const approved: SupplierCallResult = { ...result, status: "approved", updatedAt: now };
  let purchaseOrders = state.purchaseOrders;
  const followUps = [...state.followUps];
  const disputes = [...state.disputes];
  if (result.scenario === "delivery_commitment" || result.scenario === "partial_delivery") {
    const promisedDeliveryDate = result.scenario === "partial_delivery" ? result.remainingDeliveryDate : result.promisedDeliveryDate;
    purchaseOrders = state.purchaseOrders.map((item) => item.id === result.purchaseOrderId ? { ...item, promisedDeliveryDate, updatedAt: now } : item);
    followUps.push(followUp(result, "approved", `Verify supplier commitment for ${promisedDeliveryDate}.`, now, role));
  } else if (result.scenario === "stock_unavailable" || result.scenario === "price_discrepancy") {
    const dispute: ErpDispute = { id: `supplier-dispute-${result.id}`, supplierId: result.supplierId, customerId: null, purchaseOrderId: result.purchaseOrderId, salesOrderId: null, status: "open", reason: result.reason!, createdAt: now, updatedAt: now };
    disputes.push(dispute);
    followUps.push(followUp(result, "pending", `Human procurement review: ${result.reason}`, now, role));
  } else {
    followUps.push(followUp(result, "approved", "Retry supplier contact after guardrail re-check.", now, role));
  }
  const staged: ErpState = { ...state, purchaseOrders, followUps, disputes, supplierResults: state.supplierResults.map((item) => item.id === result.id ? approved : item) };
  const next = appendErpAudit(staged, { entityType: "supplier_call_result", entityId: result.id, action: "supplier_result.approved", actorRole: role, actorId: `role:${role}`, detail: { scenario: result.scenario, purchaseOrderId: result.purchaseOrderId } }, now);
  return commitErpState(state, next, approved);
}

function followUp(result: SupplierCallResult, approvalStatus: ErpFollowUp["approvalStatus"], reason: string, now: string, role: ErpRole): ErpFollowUp {
  return {
    id: `supplier-follow-up-${result.id}`, supplierId: result.supplierId, customerId: null, purchaseOrderId: result.purchaseOrderId, salesOrderId: null,
    dueAt: `${result.followUpDate}T09:00:00.000Z`, status: "open", approvalStatus, approvedBy: approvalStatus === "approved" ? `role:${role}` : null,
    reason, createdAt: now, updatedAt: now,
  };
}

function decideSupplierResult(state: ErpState, role: ErpRole, resultId: string, status: "rejected" | "human_review", now: string): ErpCommandResult<SupplierCallResult> {
  const permission = authorizeReview<SupplierCallResult>(state, role);
  if (permission) return permission;
  if (!isStrictIsoInstant(now)) return reject(state, "INVALID_INPUT", "Supplier result review time is invalid.");
  const context = findResultForStatuses(state, resultId, status === "rejected" ? ["pending", "human_review"] : ["pending"]);
  if ("ok" in context) return context;
  const decided: SupplierCallResult = { ...context.result, status, updatedAt: now };
  const staged: ErpState = { ...state, supplierResults: state.supplierResults.map((item) => item.id === resultId ? decided : item) };
  const action = status === "rejected" ? "supplier_result.rejected" : "supplier_result.human_review";
  const next = appendErpAudit(staged, { entityType: "supplier_call_result", entityId: resultId, action, actorRole: role, actorId: `role:${role}`, detail: { scenario: decided.scenario, purchaseOrderId: decided.purchaseOrderId } }, now);
  return commitErpState(state, next, decided);
}

export function rejectSupplierResult(state: ErpState, role: ErpRole, resultId: string, now: string): ErpCommandResult<SupplierCallResult> {
  return decideSupplierResult(state, role, resultId, "rejected", now);
}

export function markSupplierResultForHumanReview(state: ErpState, role: ErpRole, resultId: string, now: string): ErpCommandResult<SupplierCallResult> {
  return decideSupplierResult(state, role, resultId, "human_review", now);
}

export function retrySupplierResultReview(state: ErpState, role: ErpRole, resultId: string, now: string): ErpCommandResult<SupplierCallResult> {
  const permission = authorizeReview<SupplierCallResult>(state, role);
  if (permission) return permission;
  if (!isStrictIsoInstant(now)) return reject(state, "INVALID_INPUT", "Supplier result review time is invalid.");
  const context = findResultForStatuses(state, resultId, ["human_review"]);
  if ("ok" in context) return context;
  const retried: SupplierCallResult = { ...context.result, status: "pending", updatedAt: now };
  const staged: ErpState = { ...state, supplierResults: state.supplierResults.map((item) => item.id === resultId ? retried : item) };
  const next = appendErpAudit(staged, {
    entityType: "supplier_call_result", entityId: resultId, action: "supplier_result.review_retried",
    actorRole: role, actorId: `role:${role}`,
    detail: { scenario: retried.scenario, purchaseOrderId: retried.purchaseOrderId },
  }, now);
  return commitErpState(state, next, retried);
}
