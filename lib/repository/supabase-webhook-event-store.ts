import type { WebhookAuditEntry, WebhookEvent, WebhookEventStore } from "../calle/webhook-handler";

interface Config { url: string; serviceRoleKey: string }
class StoreRequestError extends Error { constructor(readonly status: number) { super("Supabase webhook store request failed."); } }

export class SupabaseWebhookEventStore implements WebhookEventStore {
  constructor(private readonly config: Config) {
    if (!config.url || !config.serviceRoleKey) throw new Error("Supabase server credentials are required.");
  }
  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${this.config.url.replace(/\/+$/, "")}/rest/v1/${path}`, { ...init, headers: { apikey: this.config.serviceRoleKey, authorization: `Bearer ${this.config.serviceRoleKey}`, "content-type": "application/json", ...init?.headers } });
    if (!response.ok) throw new StoreRequestError(response.status);
    if (response.status === 204) return undefined;
    return response.json();
  }
  async claimEvent(event: WebhookEvent): Promise<boolean> {
    try {
      await this.request("webhook_events", { method: "POST", body: JSON.stringify({ event_id: event.eventId, call_id: event.callId, event_type: event.type, occurred_at: event.occurredAt }), headers: { Prefer: "return=minimal" } });
      return true;
    } catch (error) {
      if (error instanceof StoreRequestError && error.status === 409) return false;
      throw error;
    }
  }
  async getLatestOccurredAt(callId: string): Promise<number | null> {
    const rows = await this.request(`webhook_call_state?call_id=eq.${encodeURIComponent(callId)}&select=latest_occurred_at&limit=1`);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const value = (rows[0] as Record<string, unknown>).latest_occurred_at;
    return typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
  }
  async setLatestOccurredAt(callId: string, value: number): Promise<void> {
    await this.request("webhook_call_state", { method: "POST", body: JSON.stringify({ call_id: callId, latest_occurred_at: new Date(value).toISOString() }), headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
  }
  async appendAudit(entry: WebhookAuditEntry): Promise<void> {
    await this.request("audit_logs", { method: "POST", body: JSON.stringify({ entity_type: "call", entity_id: entry.callId ?? "unknown", action: entry.action, actor_type: "provider", actor_id: "calle-webhook", before_data: null, after_data: { eventId: entry.eventId }, api_request_id: entry.eventId, guardrail_violations: [] }), headers: { Prefer: "return=minimal" } });
  }
}
