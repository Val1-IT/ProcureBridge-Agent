import { createSeedState } from "./seed";
import { createDemoSessionId } from "./session";
import { applyApprovedResult, markResultForReview, rejectResult } from "../domain/results";
import { transitionCall, type CallEvent } from "../domain/call-machine";
import type { AuditLog, CallApproval, CallRecord, DemoState, StructuredResult, TranscriptSegment } from "../domain/types";
import type { SimulationSpeed } from "./simulation";

export type DemoAction =
  | { type: "RESET" }
  | { type: "REGISTER_CALL_DRAFT"; call: CallRecord }
  | { type: "SAVE_APPROVAL"; approval: CallApproval }
  | { type: "TRANSITION_CALL"; callId: string; event: CallEvent }
  | { type: "ATTACH_PROVIDER_CALL"; callId: string; provider: CallRecord["provider"]; providerCallId: string }
  | { type: "SET_CALL_DURATION"; callId: string; durationSeconds: number }
  | { type: "SET_CALL_OUTCOME"; callId: string; outcome: string; summary: string; sentiment: string }
  | { type: "SET_TRANSCRIPT"; callId: string; transcript: TranscriptSegment[] }
  | { type: "EDIT_RESULT"; resultId: string; patch: Partial<StructuredResult> }
  | { type: "APPROVE_RESULT"; resultId: string; actor: string }
  | { type: "REJECT_RESULT"; resultId: string; actor: string }
  | { type: "HUMAN_REVIEW"; resultId: string; actor: string }
  | { type: "SET_FAST_MODE"; value: boolean }
  | { type: "SET_SIMULATION_SPEED"; value: SimulationSpeed }
  | { type: "SELECT_SCENARIO"; scenario: DemoState["demo"]["selectedScenario"] }
  | { type: "ADD_AUDIT"; audit: AuditLog };

function touch(state: DemoState): DemoState {
  return { ...state, updatedAt: new Date().toISOString() };
}

function applyCallTransition(state: DemoState, callId: string, event: CallEvent): DemoState {
  const call = state.calls.find((item) => item.id === callId);
  if (!call) return state;
  const transition = transitionCall(call.status, event);
  if (!transition.ok) return state;
  const changedAt = new Date().toISOString();
  return touch({
    ...state,
    calls: state.calls.map((item) => item.id === callId ? {
      ...item,
      status: transition.state,
      startedAt: transition.state === "active" && !item.startedAt ? changedAt : item.startedAt,
      endedAt: transition.state === "completed" ? changedAt : item.endedAt,
    } : item),
    auditLogs: [...state.auditLogs, {
      id: `audit-transition-${callId}-${event}-${Date.now()}`,
      entityType: "call",
      entityId: callId,
      action: "call.transitioned",
      actorType: "system",
      actorId: "call-lifecycle-machine",
      beforeData: { status: call.status },
      afterData: { status: transition.state, event },
      createdAt: changedAt,
    }],
  });
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "RESET":
      return createSeedState(createDemoSessionId());
    case "REGISTER_CALL_DRAFT":
      if (action.call.status !== "draft" || state.calls.some((call) => call.id === action.call.id)) return state;
      return touch({ ...state, calls: [...state.calls, action.call] });
    case "SAVE_APPROVAL": {
      const call = state.calls.find((item) => item.id === action.approval.callId);
      if (!call) return state;
      let transitioned = state;
      if (call.status === "draft" || call.status === "blocked") transitioned = applyCallTransition(transitioned, call.id, "REQUEST_APPROVAL");
      const pendingCall = transitioned.calls.find((item) => item.id === call.id);
      if (pendingCall?.status === "approval_pending") transitioned = applyCallTransition(transitioned, call.id, "APPROVE");
      const approvedCall = transitioned.calls.find((item) => item.id === call.id);
      if (approvedCall?.status !== "approved") return state;
      const approvals = [...state.approvals.filter((item) => item.callId !== action.approval.callId), action.approval];
      return touch({
        ...transitioned,
        approvals,
        calls: transitioned.calls.map((item) => item.id === call.id ? { ...item, humanApprovedBy: action.approval.approvedBy, humanApprovedAt: action.approval.approvedAt } : item),
        auditLogs: [
          ...transitioned.auditLogs,
          {
            id: `audit-approval-${action.approval.callId}-${Date.now()}`,
            entityType: "call",
            entityId: action.approval.callId,
            action: "call.approved",
            actorType: "human",
            actorId: action.approval.approvedBy,
            beforeData: null,
            afterData: action.approval,
            createdAt: action.approval.approvedAt,
          },
        ],
      });
    }
    case "TRANSITION_CALL":
      return applyCallTransition(state, action.callId, action.event);
    case "ATTACH_PROVIDER_CALL":
      return touch({ ...state, calls: state.calls.map((call) => call.id === action.callId ? { ...call, provider: action.provider, providerCallId: action.providerCallId } : call) });
    case "SET_CALL_DURATION":
      return touch({ ...state, calls: state.calls.map((call) => call.id === action.callId ? { ...call, durationSeconds: Math.max(call.durationSeconds, action.durationSeconds) } : call) });
    case "SET_CALL_OUTCOME":
      return touch({ ...state, calls: state.calls.map((call) => call.id === action.callId ? { ...call, outcome: action.outcome, aiSummary: action.summary, sentiment: action.sentiment } : call) });
    case "SET_TRANSCRIPT":
      return touch({ ...state, calls: state.calls.map((call) => call.id === action.callId ? { ...call, transcript: action.transcript } : call) });
    case "EDIT_RESULT":
      return touch({
        ...state,
        pendingResults: state.pendingResults.map((result) => result.id === action.resultId ? { ...result, ...action.patch } : result),
        auditLogs: [...state.auditLogs, {
          id: `audit-result-edited-${Date.now()}`,
          entityType: "call_result",
          entityId: action.resultId,
          action: "structured_result.edited",
          actorType: "human",
          actorId: "Nadia Pratama",
          beforeData: null,
          afterData: action.patch,
          createdAt: new Date().toISOString(),
        }],
      });
    case "APPROVE_RESULT": {
      const result = state.pendingResults.find((item) => item.id === action.resultId);
      if (!result) return state;
      const applied = applyApprovedResult(state, result, action.actor);
      return applied === state ? state : applyCallTransition(applied, result.callId, "APPROVE_RESULT");
    }
    case "REJECT_RESULT": {
      const result = state.pendingResults.find((item) => item.id === action.resultId);
      if (!result) return state;
      const rejected = rejectResult(state, action.resultId, action.actor);
      return rejected === state ? state : applyCallTransition(rejected, result.callId, "REJECT_RESULT");
    }
    case "HUMAN_REVIEW": {
      const result = state.pendingResults.find((item) => item.id === action.resultId);
      if (!result) return state;
      const reviewed = markResultForReview(state, action.resultId, action.actor);
      return reviewed === state ? state : applyCallTransition(reviewed, result.callId, "MARK_HUMAN_REVIEW");
    }
    case "SET_FAST_MODE":
      return touch({ ...state, demo: { ...state.demo, simulationSpeed: action.value ? "fast_demo" : "real_time" } });
    case "SET_SIMULATION_SPEED":
      return touch({ ...state, demo: { ...state.demo, simulationSpeed: action.value } });
    case "SELECT_SCENARIO":
      return touch({ ...state, demo: { ...state.demo, selectedScenario: action.scenario } });
    case "ADD_AUDIT":
      return touch({ ...state, auditLogs: [...state.auditLogs, action.audit] });
    default:
      return state;
  }
}
