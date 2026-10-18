import { describe, expect, it } from "vitest";
import { transitionCall } from "../lib/domain/call-machine";

describe("call lifecycle state machine", () => {
  it("follows the approved happy path", () => {
    let state = "draft" as const;
    for (const event of [
      "REQUEST_APPROVAL",
      "APPROVE",
      "CREATE_CALL",
      "CONNECT",
      "ACTIVATE",
      "COMPLETE",
      "EXTRACT_RESULT",
      "APPROVE_RESULT",
    ] as const) {
      const result = transitionCall(state, event);
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state as typeof state;
    }
    expect(state).toBe("result_approved");
  });

  it("rejects starting a call before approval", () => {
    expect(transitionCall("draft", "CREATE_CALL")).toEqual({
      ok: false,
      state: "draft",
      reason: "Transisi draft → CREATE_CALL tidak diizinkan.",
    });
  });

  it.each([
    ["approved", "COMPLETE"],
    ["completed", "APPROVE_RESULT"],
    ["completed", "COMPLETE"],
    ["failed", "CONNECT"],
  ] as const)("rejects illegal %s -> %s transitions", (state, event) => {
    const result = transitionCall(state, event);
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
  });
});
