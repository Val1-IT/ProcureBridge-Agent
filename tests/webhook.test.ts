import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryWebhookEventStore, processWebhook, type WebhookAuditEntry, type WebhookEvent, type WebhookEventStore } from "../lib/calle/webhook-handler";
import { verifyPlaceholderHmac } from "../lib/calle/webhook-signature";
import { POST as webhookPost } from "../app/api/calle/webhook/route";

const event: WebhookEvent = { eventId: "evt-001", type: "call.connected", callId: "call-001", occurredAt: "2026-08-04T03:01:00.000Z", data: { providerCallId: "calle-001" } };

describe("CALL-E webhook processing", () => {
  it("validates, deduplicates, and ignores out-of-order events", async () => {
    const store = new InMemoryWebhookEventStore();
    expect(await processWebhook(event, { store, signatureValid: true })).toMatchObject({ accepted: true, duplicate: false });
    expect(await processWebhook(event, { store, signatureValid: true })).toMatchObject({ accepted: true, duplicate: true });
    expect(await processWebhook({ ...event, eventId: "evt-002", occurredAt: "2026-08-04T03:00:00.000Z" }, { store, signatureValid: true })).toMatchObject({ accepted: true, ignoredAsStale: true });
    expect(store.audit).toHaveLength(3);
  });

  it.each([
    [{ ...event, eventId: "" }, "Invalid webhook payload."],
    [{ ...event, occurredAt: "not-a-date" }, "Invalid webhook payload."],
    [{ secret: "must-not-leak" }, "Invalid webhook payload."],
  ])("returns a safe error for malformed input", async (payload, error) => {
    expect(await processWebhook(payload, { store: new InMemoryWebhookEventStore(), signatureValid: true })).toEqual({ accepted: false, status: 400, error });
  });

  it("returns a safe error for an invalid signature", async () => {
    expect(await processWebhook(event, { store: new InMemoryWebhookEventStore(), signatureValid: false })).toEqual({ accepted: false, status: 401, error: "Invalid webhook signature." });
  });

  it("keeps deduplication and ordering state across handler restarts with a durable store", async () => {
    const backend = { seen: new Set<string>(), latest: new Map<string, number>(), audit: [] as WebhookAuditEntry[] };
    class FakeDurableStore implements WebhookEventStore {
      async claimEvent(value: WebhookEvent) { if (backend.seen.has(value.eventId)) return false; backend.seen.add(value.eventId); return true; }
      async getLatestOccurredAt(callId: string) { return backend.latest.get(callId) ?? null; }
      async setLatestOccurredAt(callId: string, value: number) { backend.latest.set(callId, value); }
      async appendAudit(value: WebhookAuditEntry) { backend.audit.push(value); }
    }
    await processWebhook(event, { store: new FakeDurableStore(), signatureValid: true });
    expect(await processWebhook(event, { store: new FakeDurableStore(), signatureValid: true })).toMatchObject({ accepted: true, duplicate: true });
    expect(await processWebhook({ ...event, eventId: "evt-old", occurredAt: "2026-08-04T03:00:00.000Z" }, { store: new FakeDurableStore(), signatureValid: true })).toMatchObject({ ignoredAsStale: true });
  });

  it("verifies the documented raw-body HMAC placeholder with timing-safe comparison", () => {
    const raw = JSON.stringify(event);
    const signature = `sha256=${createHmac("sha256", "test-secret").update(raw).digest("hex")}`;
    expect(verifyPlaceholderHmac(raw, signature, "test-secret")).toBe(true);
    expect(verifyPlaceholderHmac(raw, "sha256=00", "test-secret")).toBe(false);
  });

  it("returns a safe response for malformed JSON", async () => {
    const response = await webhookPost(new Request("https://app.example/api/calle/webhook", { method: "POST", body: "{broken" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid webhook payload." });
  });
});
