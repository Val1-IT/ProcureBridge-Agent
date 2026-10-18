import type { PaymentCommitment } from "../../domain/types";
import { enumText, nullableText, numeric, record, text } from "./mapper-utils";

const toStatus: Record<PaymentCommitment["status"], string> = { Upcoming: "upcoming", "Due Today": "due_today", Fulfilled: "fulfilled", "Partially Fulfilled": "partially_fulfilled", "Broken Promise": "broken_promise", Rescheduled: "rescheduled", Cancelled: "cancelled" };
const fromStatus = Object.fromEntries(Object.entries(toStatus).map(([domain, db]) => [db, domain])) as Record<string, PaymentCommitment["status"]>;

export interface CommitmentRow { id: string; customer_id: string; invoice_id: string; call_id: string; promised_amount: number | string; promised_date: string; actual_amount: number | string; status: string; follow_up_date: string | null; follow_up_status: string; assigned_owner: string }

export function toCommitmentRow(value: PaymentCommitment): CommitmentRow {
  return { id: value.id, customer_id: value.customerId, invoice_id: value.invoiceId, call_id: value.callId, promised_amount: value.promisedAmount, promised_date: value.promisedDate, actual_amount: value.actualAmount, status: toStatus[value.status], follow_up_date: value.followUpDate, follow_up_status: value.followUpStatus, assigned_owner: value.assignedOwner };
}

export function fromCommitmentRow(input: unknown): PaymentCommitment {
  const row = record(input, "payment commitment");
  const dbStatus = enumText(row, "status", Object.values(toStatus) as string[], "payment commitment");
  return { id: text(row, "id", "payment commitment"), customerId: text(row, "customer_id", "payment commitment"), invoiceId: text(row, "invoice_id", "payment commitment"), callId: text(row, "call_id", "payment commitment"), promisedAmount: numeric(row, "promised_amount", "payment commitment"), promisedDate: text(row, "promised_date", "payment commitment"), actualAmount: numeric(row, "actual_amount", "payment commitment"), status: fromStatus[dbStatus], followUpDate: nullableText(row, "follow_up_date", "payment commitment"), followUpStatus: text(row, "follow_up_status", "payment commitment"), assignedOwner: text(row, "assigned_owner", "payment commitment") };
}
