import type { AuditLog, CallApproval, CallRecord, Customer, DisputeTicket, Invoice, PaymentCommitment } from "../domain/types";

export interface RecoveryRepository {
  listCustomers(): Promise<Customer[]>;
  listInvoices(): Promise<Invoice[]>;
  saveCall(call: CallRecord): Promise<void>;
  saveApproval(approval: CallApproval): Promise<void>;
  saveCommitment(commitment: PaymentCommitment): Promise<void>;
  saveDispute(dispute: DisputeTicket): Promise<void>;
  appendAuditLog(log: AuditLog): Promise<void>;
  claimWebhookEvent(eventId: string, callId: string, occurredAt: string): Promise<boolean>;
}
