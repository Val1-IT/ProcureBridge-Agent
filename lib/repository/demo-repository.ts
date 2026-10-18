import type { DemoState } from "../domain/types";
import type { RecoveryRepository } from "./types";

export class DemoRecoveryRepository implements RecoveryRepository {
  constructor(private state: DemoState) {}
  async listCustomers() { return structuredClone(this.state.customers); }
  async listInvoices() { return structuredClone(this.state.invoices); }
  async saveCall(call: DemoState["calls"][number]) { this.state.calls = [...this.state.calls.filter((item) => item.id !== call.id), call]; }
  async saveApproval(approval: DemoState["approvals"][number]) { this.state.approvals = [...this.state.approvals.filter((item) => item.callId !== approval.callId), approval]; }
  async saveCommitment(commitment: DemoState["paymentCommitments"][number]) { this.state.paymentCommitments = [...this.state.paymentCommitments.filter((item) => item.id !== commitment.id), commitment]; }
  async saveDispute(dispute: DemoState["disputes"][number]) { this.state.disputes = [...this.state.disputes.filter((item) => item.id !== dispute.id), dispute]; }
  async appendAuditLog(log: DemoState["auditLogs"][number]) { this.state.auditLogs = [...this.state.auditLogs, log]; }
  async claimWebhookEvent(eventId: string) { return !this.state.auditLogs.some((item) => item.apiRequestId === eventId); }
}
