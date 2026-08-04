import { describe, expect, it } from "vitest";
import { createSeedState } from "../lib/demo/seed";
import { demoReducer } from "../lib/demo/reducer";
import type { CallApproval } from "../lib/domain/types";

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

describe("demo store reducer", () => {
  it("records approval and its audit trail", () => {
    const state = demoReducer(createSeedState(), { type: "SAVE_APPROVAL", approval });
    expect(state.approvals).toEqual([approval]);
    expect(state.auditLogs.at(-1)?.action).toBe("call.approved");
  });

  it("keeps cross-page collections synchronized after approving a result", () => {
    const seed = createSeedState();
    const state = demoReducer(seed, { type: "APPROVE_RESULT", resultId: "result-dispute", actor: "Nadia Pratama" });
    expect(state.invoices[1].contactStatus).toBe("Disputed");
    expect(state.disputes).toHaveLength(1);
    expect(state.pendingResults[1].reviewStatus).toBe("approved");
  });

  it("resets every collection to deterministic seed data", () => {
    const changed = demoReducer(createSeedState(), { type: "APPROVE_RESULT", resultId: "result-promise", actor: "Nadia Pratama" });
    expect(demoReducer(changed, { type: "RESET" })).toEqual(createSeedState());
  });
});
