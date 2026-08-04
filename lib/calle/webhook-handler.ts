export type WebhookEventType = "call.started" | "call.connected" | "transcript.updated" | "call.completed" | "call.failed" | "analysis.completed";

export interface WebhookEvent { eventId: string; type: WebhookEventType; callId: string; occurredAt: string; data: Record<string, unknown> }
export interface WebhookAuditEntry { eventId: string; action: string; callId?: string }

export interface WebhookEventStore {
  claimEvent(event: WebhookEvent): Promise<boolean>;
  getLatestOccurredAt(callId: string): Promise<number | null>;
  setLatestOccurredAt(callId: string, value: number): Promise<void>;
  appendAudit(entry: WebhookAuditEntry): Promise<void>;
}

export class InMemoryWebhookEventStore implements WebhookEventStore {
  readonly seenEventIds = new Set<string>();
  readonly latestByCall = new Map<string, number>();
  readonly audit: WebhookAuditEntry[] = [];
  async claimEvent(event: WebhookEvent) { if (this.seenEventIds.has(event.eventId)) return false; this.seenEventIds.add(event.eventId); return true; }
  async getLatestOccurredAt(callId: string) { return this.latestByCall.get(callId) ?? null; }
  async setLatestOccurredAt(callId: string, value: number) { this.latestByCall.set(callId, value); }
  async appendAudit(entry: WebhookAuditEntry) { this.audit.push(entry); }
}

export function createWebhookMemory(): InMemoryWebhookEventStore { return new InMemoryWebhookEventStore(); }

function isWebhookEvent(input: unknown): input is WebhookEvent {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  const allowed: WebhookEventType[] = ["call.started", "call.connected", "transcript.updated", "call.completed", "call.failed", "analysis.completed"];
  return typeof value.eventId === "string" && Boolean(value.eventId.trim()) && typeof value.callId === "string" && Boolean(value.callId.trim()) && typeof value.occurredAt === "string" && allowed.includes(value.type as WebhookEventType) && Boolean(value.data) && typeof value.data === "object" && !Array.isArray(value.data) && Number.isFinite(Date.parse(value.occurredAt));
}

export async function processWebhook(
  input: unknown,
  context: { store: WebhookEventStore; signatureValid: boolean },
): Promise<
  | { accepted: false; status: 400 | 401 | 500; error: string }
  | { accepted: true; duplicate: boolean; ignoredAsStale?: boolean }
> {
  if (!context.signatureValid) return { accepted: false, status: 401, error: "Invalid webhook signature." };
  if (!isWebhookEvent(input)) return { accepted: false, status: 400, error: "Invalid webhook payload." };
  try {
    if (!await context.store.claimEvent(input)) {
      await context.store.appendAudit({ eventId: input.eventId, action: "webhook.duplicate", callId: input.callId });
      return { accepted: true, duplicate: true };
    }
    const occurredAt = Date.parse(input.occurredAt);
    const latest = await context.store.getLatestOccurredAt(input.callId) ?? 0;
    if (occurredAt < latest) {
      await context.store.appendAudit({ eventId: input.eventId, action: "webhook.out_of_order", callId: input.callId });
      return { accepted: true, duplicate: false, ignoredAsStale: true };
    }
    await context.store.setLatestOccurredAt(input.callId, occurredAt);
    await context.store.appendAudit({ eventId: input.eventId, action: `webhook.${input.type}`, callId: input.callId });
    return { accepted: true, duplicate: false };
  } catch {
    return { accepted: false, status: 500, error: "Unable to process webhook." };
  }
}
