import { describe, expect, it } from "vitest";
import { CalleProvider, CalleProviderError, getCallProvider } from "../lib/calle/client";
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

  it("normalizes the base URL, encodes identifiers, and adds an internal correlation id", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const provider = new CalleProvider(
      { CALLE_API_URL: "https://api.example///", CALLE_API_KEY: "test-key", CALLE_AGENT_ID: "agent" },
      { fetchImpl: async (url, init) => { requests.push({ url: String(url), init }); return Response.json({ callId: "a/b", status: "active", durationSeconds: 1 }); }, correlationIdFactory: () => "corr-1" },
    );
    await provider.getCall("a/b");
    expect(requests[0].url).toBe("https://api.example/calls/a%2Fb");
    expect(new Headers(requests[0].init?.headers).get("x-arvanta-correlation-id")).toBe("corr-1");
  });

  it("aborts a timed-out request with a safe typed error", async () => {
    const provider = new CalleProvider(
      { CALLE_API_URL: "https://api.example", CALLE_API_KEY: "test-key", CALLE_AGENT_ID: "agent" },
      { timeoutMs: 5, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))); }) },
    );
    const error = await provider.getCall("call-1").then(() => { throw new Error("Expected timeout."); }, (value) => value as CalleProviderError);
    expect(error).toBeInstanceOf(CalleProviderError);
    expect(error).toMatchObject({ code: "REQUEST_TIMEOUT", retryable: true });
    expect(error.message).not.toContain("test-key");
  });

  it.each([
    [401, "AUTHENTICATION_FAILED", false],
    [403, "AUTHENTICATION_FAILED", false],
    [429, "RATE_LIMITED", true],
    [500, "PROVIDER_UNAVAILABLE", true],
  ] as const)("maps provider status %s to a safe error", async (status, code, retryable) => {
    let attempts = 0;
    const provider = new CalleProvider(
      { CALLE_API_URL: "https://api.example", CALLE_API_KEY: "test-key", CALLE_AGENT_ID: "agent" },
      { fetchImpl: async () => { attempts += 1; return new Response("provider secret detail", { status }); } },
    );
    const error = await provider.createCall({ callId: "call-1", customerId: "cust-1", invoiceId: "inv-1", phone: "+6200000000", language: "id", scenario: "promise_to_pay", disclosure: "AI" }).then(() => { throw new Error("Expected provider error."); }, (value) => value as CalleProviderError);
    expect(error).toMatchObject({ status, code, retryable });
    expect(error.message).not.toMatch(/provider secret detail|test-key/);
    expect(attempts).toBe(1);
  });

  it.each([
    ["not-json", "text/plain"],
    ["{broken", "application/json"],
  ])("rejects malformed provider responses safely", async (body, contentType) => {
    const provider = new CalleProvider(
      { CALLE_API_URL: "https://api.example", CALLE_API_KEY: "test-key", CALLE_AGENT_ID: "agent" },
      { fetchImpl: async () => new Response(body, { status: 200, headers: { "content-type": contentType } }) },
    );
    await expect(provider.getCall("call-1")).rejects.toMatchObject({ code: "MALFORMED_RESPONSE", retryable: false });
  });
});
