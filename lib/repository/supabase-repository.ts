import type { AuditLog, CallApproval, CallRecord, Customer, DisputeTicket, Invoice, PaymentCommitment } from "../domain/types";
import type { RecoveryRepository } from "./types";
import { fromCustomerRow } from "./mappers/customer-mapper";
import { fromInvoiceRow } from "./mappers/invoice-mapper";
import { toCallRow } from "./mappers/call-mapper";
import { toApprovalRow } from "./mappers/approval-mapper";
import { toCommitmentRow } from "./mappers/commitment-mapper";
import { toDisputeRow } from "./mappers/dispute-mapper";
import { toAuditLogRow } from "./mappers/audit-log-mapper";

interface SupabaseRepositoryConfig { url: string; serviceRoleKey: string }

export class SupabaseRecoveryRepository implements RecoveryRepository {
  constructor(private readonly config: SupabaseRepositoryConfig) {
    if (!config.url || !config.serviceRoleKey) throw new Error("Supabase server credentials are required.");
  }

  private async request<T>(table: string, init?: RequestInit): Promise<T> {
    const baseUrl = this.config.url.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/rest/v1/${table}`, {
      ...init,
      headers: {
        apikey: this.config.serviceRoleKey,
        authorization: `Bearer ${this.config.serviceRoleKey}`,
        "content-type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) throw new Error(`Supabase repository request failed with status ${response.status}.`);
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async listCustomers(): Promise<Customer[]> {
    const rows = await this.request<unknown>("customers?select=*");
    if (!Array.isArray(rows)) throw new Error("Supabase repository returned an invalid customer collection.");
    return rows.map(fromCustomerRow);
  }
  async listInvoices(): Promise<Invoice[]> {
    const rows = await this.request<unknown>("invoices?select=*");
    if (!Array.isArray(rows)) throw new Error("Supabase repository returned an invalid invoice collection.");
    return rows.map(fromInvoiceRow);
  }
  async saveCall(call: CallRecord): Promise<void> { await this.upsert("calls", toCallRow(call)); }
  async saveApproval(approval: CallApproval): Promise<void> { await this.upsert("call_approvals", toApprovalRow(approval)); }
  async saveCommitment(commitment: PaymentCommitment): Promise<void> { await this.upsert("payment_commitments", toCommitmentRow(commitment)); }
  async saveDispute(dispute: DisputeTicket): Promise<void> { await this.upsert("disputes", toDisputeRow(dispute)); }
  async appendAuditLog(log: AuditLog): Promise<void> { await this.request("audit_logs", { method: "POST", body: JSON.stringify(toAuditLogRow(log)), headers: { Prefer: "return=minimal" } }); }

  private async upsert(table: string, value: unknown): Promise<void> {
    await this.request(table, { method: "POST", body: JSON.stringify(value), headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
  }

  async claimWebhookEvent(eventId: string, callId: string, occurredAt: string): Promise<boolean> {
    try {
      await this.request("webhook_events", { method: "POST", body: JSON.stringify({ event_id: eventId, call_id: callId, occurred_at: occurredAt }), headers: { Prefer: "return=minimal" } });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes("409")) return false;
      throw error;
    }
  }
}
