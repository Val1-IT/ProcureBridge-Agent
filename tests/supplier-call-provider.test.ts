import { describe, expect, it } from "vitest";
import { MockSupplierCallProvider } from "../lib/supplier-call/mock-provider";
import { getSupplierScenarioTranscript, maskSensitiveNumericPatterns } from "../lib/supplier-call/scripts";
import type { SupplierScenario } from "../lib/supplier-call/types";

const input = {
  callId: "supplier-call-po-1",
  supplierId: "supplier-utama",
  purchaseOrderId: "po-router-replenishment",
  phone: "+62 811 1000 2000",
  language: "Bahasa Indonesia",
  scenario: "delivery_commitment" as const,
  disclosure: "Saya asisten suara AI Arvanta.",
};

describe("supplier call provider boundary", () => {
  it("creates deterministic mock calls without using global fetch", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("network must not be used"); };
    try {
      const provider = new MockSupplierCallProvider();
      const created = await provider.createCall(input);
      expect(created).toEqual({ callId: "supplier-call-po-1", providerCallId: "supplier_mock_supplier-call-po-1", status: "connecting", provider: "mock" });
      expect(await provider.getCall(input.callId)).toEqual({ callId: input.callId, status: "connecting", durationSeconds: 0 });
      expect((await provider.getTranscript(input.callId))[0].text).toMatch(/asisten suara AI/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("isolates call state between provider instances", async () => {
    const first = new MockSupplierCallProvider();
    const second = new MockSupplierCallProvider();
    await first.createCall(input);
    expect((await second.getCall(input.callId)).status).toBe("failed");
  });

  it("provides deterministic masked scripts for every supplier outcome", () => {
    const scenarios: SupplierScenario[] = ["delivery_commitment", "partial_delivery", "stock_unavailable", "price_discrepancy", "failed_contact"];
    for (const scenario of scenarios) {
      const first = getSupplierScenarioTranscript(scenario);
      expect(first).toEqual(getSupplierScenarioTranscript(scenario));
      expect(first.length).toBeGreaterThanOrEqual(4);
      expect(first[0].text).toMatch(/asisten suara AI/i);
    }
    expect(maskSensitiveNumericPatterns("OTP 123456 dan rekening 1234567890123")).toBe("OTP [MASKED] dan rekening [MASKED]");
  });

  it("masks common formatted phone, account, and order sequences from seven through nineteen digits", () => {
    expect(maskSensitiveNumericPatterns("Telepon +62 811-1000-2000, rekening 1234 5678 90, order 2026000123."))
      .toBe("Telepon [MASKED], rekening [MASKED], order [MASKED].");
    expect(maskSensitiveNumericPatterns("Referensi 123-4567 dan akun 1234.5678.9012"))
      .toBe("Referensi [MASKED] dan akun [MASKED]");
  });

  it("does not overmask small quantities or calendar dates", () => {
    expect(maskSensitiveNumericPatterns("Kirim 40 unit pada 2026-08-20, tindak lanjut 20-08-2026."))
      .toBe("Kirim 40 unit pada 2026-08-20, tindak lanjut 20-08-2026.");
  });

  it("ends only calls created by the same provider instance", async () => {
    const provider = new MockSupplierCallProvider();
    await provider.createCall(input);
    await provider.endCall(input.callId);
    expect((await provider.getCall(input.callId)).status).toBe("completed");
    await expect(provider.endCall("unknown-call")).rejects.toMatchObject({ code: "CALL_NOT_FOUND" });
  });
});
