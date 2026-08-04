import type { DisputeTicket } from "../../domain/types";
import { enumText, nullableText, record, text } from "./mapper-utils";

const statusToRow: Record<DisputeTicket["status"], string> = { Open: "open", Investigating: "investigating", Resolved: "resolved" };
const statusFromRow = { open: "Open", investigating: "Investigating", resolved: "Resolved" } as const;

export interface DisputeRow { id: string; customer_id: string; invoice_id: string; call_id: string; category: string; description: string; requested_evidence: string; assigned_to: string; status: "open" | "investigating" | "resolved"; due_date: string; follow_up_date: string | null }

export function toDisputeRow(value: DisputeTicket): DisputeRow {
  return { id: value.id, customer_id: value.customerId, invoice_id: value.invoiceId, call_id: value.callId, category: value.category, description: value.description, requested_evidence: value.requestedEvidence, assigned_to: value.assignedTo, status: statusToRow[value.status] as DisputeRow["status"], due_date: value.dueDate, follow_up_date: value.followUpDate };
}

export function fromDisputeRow(input: unknown): DisputeTicket {
  const row = record(input, "dispute");
  return { id: text(row, "id", "dispute"), customerId: text(row, "customer_id", "dispute"), invoiceId: text(row, "invoice_id", "dispute"), callId: text(row, "call_id", "dispute"), category: text(row, "category", "dispute"), description: text(row, "description", "dispute"), requestedEvidence: text(row, "requested_evidence", "dispute"), assignedTo: text(row, "assigned_to", "dispute"), status: statusFromRow[enumText(row, "status", ["open", "investigating", "resolved"] as const, "dispute")], dueDate: text(row, "due_date", "dispute"), followUpDate: nullableText(row, "follow_up_date", "dispute") };
}
