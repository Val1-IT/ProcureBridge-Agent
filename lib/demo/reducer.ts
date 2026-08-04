import { createSeedState } from "./seed";
import { applyApprovedResult, markResultForReview, rejectResult } from "../domain/results";
import type { AuditLog, CallApproval, CallLifecycle, CallRecord, DemoState, StructuredResult, TranscriptSegment } from "../domain/types";

export type DemoAction =
  | { type: "HYDRATE"; state: DemoState }
  | { type: "RESET" }
  | { type: "SAVE_APPROVAL"; approval: CallApproval }
  | { type: "CREATE_CALL"; call: CallRecord }
  | { type: "UPDATE_CALL_STATUS"; callId: string; status: CallLifecycle; durationSeconds?: number }
  | { type: "SET_TRANSCRIPT"; callId: string; transcript: TranscriptSegment[] }
  | { type: "COMPLETE_CALL"; callId: string; outcome: string; summary: string; sentiment: string }
  | { type: "EDIT_RESULT"; resultId: string; patch: Partial<StructuredResult> }
  | { type: "APPROVE_RESULT"; resultId: string; actor: string }
  | { type: "REJECT_RESULT"; resultId: string; actor: string }
  | { type: "HUMAN_REVIEW"; resultId: string; actor: string }
  | { type: "SET_FAST_MODE"; value: boolean }
  | { type: "SELECT_SCENARIO"; scenario: DemoState["demo"]["selectedScenario"] }
  | { type: "ADD_AUDIT"; audit: AuditLog };

function touch(state: DemoState): DemoState {
  return { ...state, updatedAt: new Date().toISOString() };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "HYDRATE":
      return action.state;
    case "RESET":
      return createSeedState();
    case "SAVE_APPROVAL": {
      const approvals = [...state.approvals.filter((item) => item.callId !== action.approval.callId), action.approval];
      return touch({
        ...state,
        approvals,
        auditLogs: [
          ...state.auditLogs,
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
    case "CREATE_CALL":
      return touch({
        ...state,
        calls: [...state.calls.filter((call) => call.id !== action.call.id), action.call],
        auditLogs: [...state.auditLogs, {
          id: `audit-call-created-${Date.now()}`,
          entityType: "call",
          entityId: action.call.id,
          action: "call.created",
          actorType: "system",
          actorId: "mock-calle-adapter",
          beforeData: null,
          afterData: { provider: action.call.provider, scenario: action.call.scenario },
          createdAt: new Date().toISOString(),
          apiRequestId: `req_demo_${action.call.id}`,
        }],
      });
    case "UPDATE_CALL_STATUS":
      return touch({ ...state, calls: state.calls.map((call) => call.id === action.callId ? {
        ...call,
        status: action.status,
        durationSeconds: action.durationSeconds ?? call.durationSeconds,
        startedAt: action.status === "active" && !call.startedAt ? new Date().toISOString() : call.startedAt,
      } : call) });
    case "SET_TRANSCRIPT":
      return touch({ ...state, calls: state.calls.map((call) => call.id === action.callId ? { ...call, transcript: action.transcript } : call) });
    case "COMPLETE_CALL":
      return touch({
        ...state,
        calls: state.calls.map((call) => call.id === action.callId ? {
          ...call,
          status: "result_pending_review",
          endedAt: new Date().toISOString(),
          outcome: action.outcome,
          aiSummary: action.summary,
          sentiment: action.sentiment,
        } : call),
        auditLogs: [...state.auditLogs, {
          id: `audit-call-completed-${Date.now()}`,
          entityType: "call",
          entityId: action.callId,
          action: "call.completed",
          actorType: "provider",
          actorId: "mock-calle-provider",
          beforeData: { status: "active" },
          afterData: { status: "result_pending_review", outcome: action.outcome },
          createdAt: new Date().toISOString(),
          apiRequestId: `req_demo_${action.callId}`,
        }],
      });
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
      return result ? applyApprovedResult(state, result, action.actor) : state;
    }
    case "REJECT_RESULT":
      return rejectResult(state, action.resultId, action.actor);
    case "HUMAN_REVIEW":
      return markResultForReview(state, action.resultId, action.actor);
    case "SET_FAST_MODE":
      return touch({ ...state, demo: { ...state.demo, fastMode: action.value } });
    case "SELECT_SCENARIO":
      return touch({ ...state, demo: { ...state.demo, selectedScenario: action.scenario } });
    case "ADD_AUDIT":
      return touch({ ...state, auditLogs: [...state.auditLogs, action.audit] });
  }
}
