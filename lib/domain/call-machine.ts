import type { CallLifecycle } from "./types";

export type CallEvent =
  | "REQUEST_APPROVAL"
  | "APPROVE"
  | "BLOCK"
  | "CREATE_CALL"
  | "CONNECT"
  | "ACTIVATE"
  | "COMPLETE"
  | "FAIL"
  | "EXTRACT_RESULT"
  | "APPROVE_RESULT"
  | "REJECT_RESULT"
  | "MARK_HUMAN_REVIEW";

const transitions: Partial<Record<CallLifecycle, Partial<Record<CallEvent, CallLifecycle>>>> = {
  draft: { REQUEST_APPROVAL: "approval_pending", BLOCK: "blocked" },
  approval_pending: { APPROVE: "approved", BLOCK: "blocked" },
  approved: { CREATE_CALL: "creating", BLOCK: "blocked" },
  blocked: { REQUEST_APPROVAL: "approval_pending" },
  creating: { CONNECT: "connecting", FAIL: "failed" },
  connecting: { ACTIVATE: "active", FAIL: "failed" },
  active: { COMPLETE: "completed", FAIL: "failed" },
  completed: { EXTRACT_RESULT: "result_pending_review" },
  result_pending_review: {
    APPROVE_RESULT: "result_approved",
    REJECT_RESULT: "result_rejected",
    MARK_HUMAN_REVIEW: "human_review",
  },
};

export function transitionCall(state: CallLifecycle, event: CallEvent):
  | { ok: true; state: CallLifecycle }
  | { ok: false; state: CallLifecycle; reason: string } {
  const next = transitions[state]?.[event];
  if (!next) return { ok: false, state, reason: `Transisi ${state} → ${event} tidak diizinkan.` };
  return { ok: true, state: next };
}
