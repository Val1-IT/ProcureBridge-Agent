import type { ContactStatus, Invoice, RiskLevel } from "../../domain/types";
import { arrayValue, enumText, MapperError, nullableText, numeric, record, text } from "./mapper-utils";

const disputeToRow = { None: "none", Open: "open", Resolved: "resolved" } as const;
const disputeFromRow = { none: "None", open: "Open", resolved: "Resolved" } as const;
const contactToRow: Record<ContactStatus, string> = { "Ready to Call": "ready_to_call", Scheduled: "scheduled", "Promise to Pay": "promise_to_pay", Disputed: "disputed", "Human Review": "human_review", Paid: "paid", "Do Not Contact": "do_not_contact" };
const contactFromRow = Object.fromEntries(Object.entries(contactToRow).map(([domain, db]) => [db, domain])) as Record<string, ContactStatus>;
const riskToRow: Record<RiskLevel, string> = { Low: "low", Medium: "medium", High: "high" };
const riskFromRow = { low: "Low", medium: "Medium", high: "High" } as const;

export interface InvoiceRow {
  id: string; customer_id: string; invoice_number: string; original_amount: number | string; outstanding_amount: number | string;
  due_date: string; days_overdue: number | string; status: Invoice["status"]; dispute_status: "none" | "open" | "resolved";
  last_contact_at: string | null; next_action_at: string | null; contact_status: string; recommended_action: string; product: string;
  scenario: Invoice["scenario"]; risk_level: "low" | "medium" | "high"; payment_history: unknown[]; contact_history: unknown[];
}

export function toInvoiceRow(invoice: Invoice): InvoiceRow {
  return { id: invoice.id, customer_id: invoice.customerId, invoice_number: invoice.invoiceNumber, original_amount: invoice.originalAmount, outstanding_amount: invoice.outstandingAmount, due_date: invoice.dueDate, days_overdue: invoice.daysOverdue, status: invoice.status, dispute_status: disputeToRow[invoice.disputeStatus], last_contact_at: invoice.lastContactAt, next_action_at: invoice.nextActionAt, contact_status: contactToRow[invoice.contactStatus], recommended_action: invoice.recommendedAction, product: invoice.product, scenario: invoice.scenario, risk_level: riskToRow[invoice.riskLevel] as InvoiceRow["risk_level"], payment_history: invoice.paymentHistory, contact_history: invoice.contactHistory };
}

export function fromInvoiceRow(input: unknown): Invoice {
  const row = record(input, "invoice");
  const paymentHistory = arrayValue(row, "payment_history", "invoice").map((item) => { const value = record(item, "invoice payment history"); return { date: text(value, "date", "invoice payment history"), amount: numeric(value, "amount", "invoice payment history"), note: text(value, "note", "invoice payment history") }; });
  const contactHistory = arrayValue(row, "contact_history", "invoice").map((item) => { const value = record(item, "invoice contact history"); return { date: text(value, "date", "invoice contact history"), channel: text(value, "channel", "invoice contact history"), note: text(value, "note", "invoice contact history") }; });
  const contactStatusDb = text(row, "contact_status", "invoice");
  const contactStatus = contactFromRow[contactStatusDb];
  if (!contactStatus) throw new MapperError("invoice", "contact_status is unsupported");
  return { id: text(row, "id", "invoice"), customerId: text(row, "customer_id", "invoice"), invoiceNumber: text(row, "invoice_number", "invoice"), originalAmount: numeric(row, "original_amount", "invoice"), outstandingAmount: numeric(row, "outstanding_amount", "invoice"), dueDate: text(row, "due_date", "invoice"), daysOverdue: numeric(row, "days_overdue", "invoice"), status: enumText(row, "status", ["overdue", "partially_paid", "paid"] as const, "invoice"), disputeStatus: disputeFromRow[enumText(row, "dispute_status", ["none", "open", "resolved"] as const, "invoice")], lastContactAt: nullableText(row, "last_contact_at", "invoice"), nextActionAt: nullableText(row, "next_action_at", "invoice"), contactStatus, recommendedAction: text(row, "recommended_action", "invoice"), product: text(row, "product", "invoice"), scenario: enumText(row, "scenario", ["promise_to_pay", "invoice_dispute", "failed_contact"] as const, "invoice"), riskLevel: riskFromRow[enumText(row, "risk_level", ["low", "medium", "high"] as const, "invoice")], paymentHistory, contactHistory };
}
