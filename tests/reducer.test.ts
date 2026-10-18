import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createSeedState } from "../lib/demo/seed";
import { demoReducer } from "../lib/demo/reducer";
import type { CallApproval } from "../lib/domain/types";
import type { CallRecord } from "../lib/domain/types";

const approval: CallApproval = {
  callId: "call-sinar",
  objective: "Konfirmasi pembayaran parsial",
  minimumPayment: 5_000_000,
  extensionAllowed: true,
  maximumFollowUpDate: "2026-08-14",
  language: "Bahasa Indonesia",
  callTime: "10:00",
  aiDisclosureApproved: true,
  dataConfirmed: true,
  approvedBy: "Nadia Pratama",
  approvedAt: "2026-08-04T03:00:00.000Z",
};

const draftCall: CallRecord = {
  id: "call-sinar", customerId: "cust-sinar", invoiceId: "inv-sinar", provider: "mock", providerCallId: null,
  status: "draft", startedAt: null, endedAt: null, durationSeconds: 0, outcome: null, sentiment: null,
  recordingUrl: null, transcript: [], aiSummary: null, humanApprovedBy: null, humanApprovedAt: null, scenario: "promise_to_pay",
};

describe("demo store reducer", () => {
  it("records approval and its audit trail", () => {
    const registered = demoReducer(createSeedState(), { type: "REGISTER_CALL_DRAFT", call: draftCall });
    const state = demoReducer(registered, { type: "SAVE_APPROVAL", approval });
    expect(state.approvals).toEqual([approval]);
    expect(state.auditLogs.at(-1)?.action).toBe("call.approved");
    expect(state.calls[0].status).toBe("approved");
  });

  it("routes the full call happy path through transition events and audits each transition", () => {
    let state = demoReducer(createSeedState(), { type: "REGISTER_CALL_DRAFT", call: draftCall });
    const events = ["REQUEST_APPROVAL", "APPROVE", "CREATE_CALL", "CONNECT", "ACTIVATE", "COMPLETE", "EXTRACT_RESULT"] as const;
    for (const event of events) state = demoReducer(state, { type: "TRANSITION_CALL", callId: draftCall.id, event });
    expect(state.calls[0].status).toBe("result_pending_review");
    const transitionAudits = state.auditLogs.filter((log) => log.action === "call.transitioned");
    expect(transitionAudits).toHaveLength(events.length);
    expect(transitionAudits.at(-1)?.afterData).toMatchObject({ status: "result_pending_review", event: "EXTRACT_RESULT" });
  });

  it("does not mutate state or audit when a transition is illegal", () => {
    const state = demoReducer(createSeedState(), { type: "REGISTER_CALL_DRAFT", call: draftCall });
    const next = demoReducer(state, { type: "TRANSITION_CALL", callId: draftCall.id, event: "COMPLETE" });
    expect(next).toBe(state);
    expect(next.calls[0].status).toBe("draft");
  });

  it("keeps UI call status changes on the transition-event API", () => {
    for (const path of ["app/invoices/[invoiceId]/page.tsx", "app/calls/[callId]/page.tsx"]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("UPDATE_CALL_STATUS");
      expect(source).not.toContain("COMPLETE_CALL");
    }
  });

  it("keeps cross-page collections synchronized after approving a result", () => {
    const seed = createSeedState();
    const state = demoReducer(seed, { type: "APPROVE_RESULT", resultId: "result-dispute", actor: "Nadia Pratama" });
    expect(state.invoices[1].contactStatus).toBe("Disputed");
    expect(state.disputes).toHaveLength(1);
    expect(state.pendingResults[1].reviewStatus).toBe("approved");
  });

  it.each([
    ["APPROVE_RESULT", "result_approved"],
    ["REJECT_RESULT", "result_rejected"],
    ["HUMAN_REVIEW", "human_review"],
  ] as const)("keeps %s synchronized with the call lifecycle", (type, expectedStatus) => {
    const seed = createSeedState();
    seed.calls.push({ ...draftCall, status: "result_pending_review" });
    const next = demoReducer(seed, { type, resultId: "result-promise", actor: "Nadia Pratama" });
    expect(next.calls[0].status).toBe(expectedStatus);
  });

  it("resets every collection to seed data while rotating the browser session", () => {
    const changed = demoReducer(createSeedState(), { type: "APPROVE_RESULT", resultId: "result-promise", actor: "Nadia Pratama" });
    const reset = demoReducer(changed, { type: "RESET" });
    expect(reset.demoSessionId).not.toBe(changed.demoSessionId);
    expect({ ...reset, demoSessionId: "session" }).toEqual({ ...createSeedState(), demoSessionId: "session" });
  });
});
