import type { AuditLog, CallApproval, CallRecord, DemoState, StructuredResult } from "../domain/types";

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 4 ? `+[MASKED] ${digits.slice(-4)}` : "[MASKED]";
}

function maskEmail(email: string): string {
  const [, domain = "demo.invalid"] = email.split("@");
  return `[MASKED]@${domain}`;
}

export interface DemoReport {
  label: "Demo Data";
  generatedAt: string;
  customer: { companyName: string; contactName: string; phone: string; email: string };
  invoice: { invoiceNumber: string; outstandingAmount: number; dueDate: string; daysOverdue: number };
  approval: CallApproval | null;
  callTimeline: Pick<CallRecord, "id" | "provider" | "status" | "startedAt" | "endedAt" | "durationSeconds">;
  transcriptSummary: string;
  structuredResult: StructuredResult | null;
  humanDecision: StructuredResult["reviewStatus"] | "unavailable";
  downstreamObject: unknown;
  auditEntries: AuditLog[];
}

export function buildDemoReport(state: DemoState, callId: string): DemoReport {
  const call = state.calls.find((item) => item.id === callId);
  if (!call) throw new Error("Call not found.");
  const customer = state.customers.find((item) => item.id === call.customerId);
  const invoice = state.invoices.find((item) => item.id === call.invoiceId);
  if (!customer || !invoice) throw new Error("Demo report source data is incomplete.");
  const result = state.pendingResults.find((item) => item.callId === callId) ?? null;
  const downstreamObject = state.paymentCommitments.find((item) => item.callId === callId)
    ?? state.disputes.find((item) => item.callId === callId)
    ?? (result?.callOutcome === "failed_contact" ? { type: "follow_up", scheduledAt: invoice.nextActionAt } : null);

  return {
    label: "Demo Data",
    generatedAt: new Date().toISOString(),
    customer: { companyName: customer.companyName, contactName: customer.contactName, phone: maskPhone(customer.phone), email: maskEmail(customer.email) },
    invoice: { invoiceNumber: invoice.invoiceNumber, outstandingAmount: invoice.outstandingAmount, dueDate: invoice.dueDate, daysOverdue: invoice.daysOverdue },
    approval: state.approvals.find((item) => item.callId === callId) ?? null,
    callTimeline: { id: call.id, provider: call.provider, status: call.status, startedAt: call.startedAt, endedAt: call.endedAt, durationSeconds: call.durationSeconds },
    transcriptSummary: call.aiSummary ?? call.transcript.map((item) => `${item.speaker}: ${item.text}`).join(" "),
    structuredResult: result,
    humanDecision: result?.reviewStatus ?? "unavailable",
    downstreamObject,
    auditEntries: state.auditLogs.filter((item) => item.entityId === callId || item.entityId === result?.id),
  };
}

export function renderDemoReportMarkdown(report: DemoReport): string {
  return [
    "# Arvanta ProcureBridge — Demo Report",
    "",
    `> ${report.label}. This report contains masked, simulated information only.`,
    "",
    `- Customer: ${report.customer.companyName} (${report.customer.contactName})`,
    `- Contact: ${report.customer.phone} / ${report.customer.email}`,
    `- Invoice: ${report.invoice.invoiceNumber}`,
    `- Outstanding: IDR ${report.invoice.outstandingAmount}`,
    `- Human decision: ${report.humanDecision}`,
    "",
    "## Approval",
    "```json",
    JSON.stringify(report.approval, null, 2),
    "```",
    "",
    "## Call timeline and transcript summary",
    "```json",
    JSON.stringify({ timeline: report.callTimeline, summary: report.transcriptSummary }, null, 2),
    "```",
    "",
    "## Structured result and downstream action",
    "```json",
    JSON.stringify({ structuredResult: report.structuredResult, downstreamObject: report.downstreamObject }, null, 2),
    "```",
    "",
    "## Audit entries",
    "```json",
    JSON.stringify(report.auditEntries, null, 2),
    "```",
  ].join("\n");
}

