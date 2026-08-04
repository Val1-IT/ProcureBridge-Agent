import { describe, expect, it } from "vitest";
import { CalleProvider, getCallProvider } from "../lib/calle/client";
import { MockCallProvider, getScenarioTranscript, maskSensitiveData } from "../lib/calle/mock-provider";

describe("CALL-E provider boundary", () => {
  it("defaults to mock provider without credentials", () => {
    expect(getCallProvider({})).toBeInstanceOf(MockCallProvider);
  });

  it("selects the live adapter only with complete credentials", () => {
    expect(getCallProvider({ CALLE_API_URL: "https://api.call-e.example", CALLE_API_KEY: "demo-key", CALLE_AGENT_ID: "agent-1" })).toBeInstanceOf(CalleProvider);
  });

  it("provides staged transcripts for every scenario and masks sensitive numbers", () => {
    for (const scenario of ["promise_to_pay", "invoice_dispute", "failed_contact"] as const) {
      const transcript = getScenarioTranscript(scenario);
      expect(transcript.length).toBeGreaterThanOrEqual(5);
      expect(transcript[0].text).toMatch(/asisten suara AI/i);
    }
    expect(maskSensitiveData("OTP 123456 dan kartu 4111111111111111")).toBe("OTP [MASKED] dan kartu [MASKED]");
  });
});
