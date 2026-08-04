import { describe, expect, it } from "vitest";
import { createWebhookMemory, processWebhook } from "../lib/calle/webhook-handler";

const event = {
  eventId: "evt-001",
  type: "call.connected" as const,
  callId: "call-001",
  occurredAt: "2026-08-04T03:01:00.000Z",
  data: { providerCallId: "calle-001" },
};

describe("CALL-E webhook processing", () => {
  it("validates, deduplicates, and ignores out-of-order events", async () => {
    const memory = createWebhookMemory();
    expect(await processWebhook(event, { memory, signatureValid: true })).toMatchObject({ accepted: true, duplicate: false });
    expect(await processWebhook(event, { memory, signatureValid: true })).toMatchObject({ accepted: true, duplicate: true });
    expect(await processWebhook({ ...event, eventId: "evt-002", occurredAt: "2026-08-04T03:00:00.000Z" }, { memory, signatureValid: true })).toMatchObject({ accepted: true, ignoredAsStale: true });
    expect(memory.audit).toHaveLength(3);
  });

  it("returns safe errors for invalid signatures and payloads", async () => {
    expect(await processWebhook(event, { memory: createWebhookMemory(), signatureValid: false })).toEqual({ accepted: false, status: 401, error: "Invalid webhook signature." });
    expect(await processWebhook({ secret: "must-not-leak" }, { memory: createWebhookMemory(), signatureValid: true })).toEqual({ accepted: false, status: 400, error: "Invalid webhook payload." });
  });
});
