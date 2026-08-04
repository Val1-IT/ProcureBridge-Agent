import { describe, expect, it } from "vitest";
import { createSeedState } from "../lib/demo/seed";
import { evaluateCallEligibility } from "../lib/domain/guardrails";
import type { CallApproval, GuardrailInput } from "../lib/domain/types";

const approval: CallApproval = {
  callId: "call-test",
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

function input(overrides: Partial<GuardrailInput> = {}): GuardrailInput {
  const seed = createSeedState();
  return {
    customer: seed.customers[0],
    invoice: seed.invoices[0],
    approval,
    localTime: "10:00",
    callsToday: 0,
    openDispute: false,
    ...overrides,
  };
}

describe("call eligibility guardrails", () => {
  it("allows a fully approved eligible call", () => {
    expect(evaluateCallEligibility(input())).toEqual({ allowed: true, reasons: [], codes: [] });
  });

  it.each([
    ["approval", { approval: { ...approval, dataConfirmed: false } }, "APPROVAL_INCOMPLETE"],
    ["disclosure", { approval: { ...approval, aiDisclosureApproved: false } }, "AI_DISCLOSURE_REQUIRED"],
    ["consent", { customer: { ...input().customer, consentStatus: "missing" } }, "CONSENT_INVALID"],
    ["do not contact", { customer: { ...input().customer, doNotContact: true } }, "DO_NOT_CONTACT"],
    ["calling hours", { localTime: "21:15" }, "OUTSIDE_CALLING_HOURS"],
    ["daily limit", { callsToday: 1 }, "DAILY_CALL_LIMIT"],
    ["open dispute", { openDispute: true }, "OPEN_DISPUTE"],
    ["phone", { customer: { ...input().customer, phone: "" } }, "INVALID_PHONE"],
    ["invoice", { invoice: { ...input().invoice, outstandingAmount: 0 } }, "INVALID_INVOICE"],
  ])("blocks %s", (_name, overrides, code) => {
    const decision = evaluateCallEligibility(input(overrides as Partial<GuardrailInput>));
    expect(decision.allowed).toBe(false);
    expect(decision.codes).toContain(code);
  });
});
