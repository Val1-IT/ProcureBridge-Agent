export type WebhookEventType =
  | "call.started"
  | "call.connected"
  | "transcript.updated"
  | "call.completed"
  | "call.failed"
  | "analysis.completed";

export interface WebhookEvent {
  eventId: string;
  type: WebhookEventType;
  callId: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

export interface WebhookMemory {
  seenEventIds: Set<string>;
  latestByCall: Map<string, number>;
  audit: Array<{ eventId: string; action: string; callId?: string }>;
}

export function createWebhookMemory(): WebhookMemory {
  return { seenEventIds: new Set(), latestByCall: new Map(), audit: [] };
}

function isWebhookEvent(input: unknown): input is WebhookEvent {
  if (!input || typeof input !== "object") return false;
  const value = input as Record<string, unknown>;
  const allowed = ["call.started", "call.connected", "transcript.updated", "call.completed", "call.failed", "analysis.completed"];
  return typeof value.eventId === "string" && typeof value.callId === "string" && typeof value.occurredAt === "string" && allowed.includes(String(value.type)) && typeof value.data === "object" && value.data !== null && Number.isFinite(Date.parse(value.occurredAt));
}

export async function processWebhook(
  input: unknown,
  context: { memory: WebhookMemory; signatureValid: boolean },
): Promise<
  | { accepted: false; status: 400 | 401; error: string }
  | { accepted: true; duplicate: boolean; ignoredAsStale?: boolean }
> {
  if (!context.signatureValid) return { accepted: false, status: 401, error: "Invalid webhook signature." };
  if (!isWebhookEvent(input)) return { accepted: false, status: 400, error: "Invalid webhook payload." };
  if (context.memory.seenEventIds.has(input.eventId)) {
    context.memory.audit.push({ eventId: input.eventId, action: "webhook.duplicate", callId: input.callId });
    return { accepted: true, duplicate: true };
  }
  context.memory.seenEventIds.add(input.eventId);
  const occurredAt = Date.parse(input.occurredAt);
  const latest = context.memory.latestByCall.get(input.callId) ?? 0;
  if (occurredAt < latest) {
    context.memory.audit.push({ eventId: input.eventId, action: "webhook.out_of_order", callId: input.callId });
    return { accepted: true, duplicate: false, ignoredAsStale: true };
  }
  context.memory.latestByCall.set(input.callId, occurredAt);
  context.memory.audit.push({ eventId: input.eventId, action: `webhook.${input.type}`, callId: input.callId });
  return { accepted: true, duplicate: false };
}
