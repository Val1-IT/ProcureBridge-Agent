import { validateApproval } from "./approval";
import type { GuardrailDecision, GuardrailInput } from "./types";

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function evaluateCallEligibility(input: GuardrailInput): GuardrailDecision {
  const codes: string[] = [];
  const reasons: string[] = [];
  const block = (code: string, reason: string) => {
    if (!codes.includes(code)) {
      codes.push(code);
      reasons.push(reason);
    }
  };

  const approvalIssues = validateApproval(input.approval);
  if (approvalIssues.length) block("APPROVAL_INCOMPLETE", approvalIssues.map((issue) => issue.message).join(" "));
  if (!input.approval?.aiDisclosureApproved) block("AI_DISCLOSURE_REQUIRED", "Pelanggan harus diberi tahu bahwa penelepon adalah AI.");
  if (input.customer.consentStatus !== "granted") block("CONSENT_INVALID", "Consent panggilan belum valid.");
  if (input.customer.doNotContact) block("DO_NOT_CONTACT", "Customer berstatus Do Not Contact.");
  const now = toMinutes(input.localTime);
  if (now < toMinutes(input.customer.allowedCallStart) || now > toMinutes(input.customer.allowedCallEnd)) {
    block("OUTSIDE_CALLING_HOURS", `Panggilan hanya diizinkan pukul ${input.customer.allowedCallStart}–${input.customer.allowedCallEnd}.`);
  }
  if (input.callsToday >= 1) block("DAILY_CALL_LIMIT", "Maksimal satu panggilan per customer per hari.");
  if (input.openDispute || input.invoice.disputeStatus === "Open") block("OPEN_DISPUTE", "Invoice memiliki sengketa aktif dan ditahan dari penagihan.");
  if (!/^\+?[0-9][0-9\s-]{7,}$/.test(input.customer.phone)) block("INVALID_PHONE", "Nomor telepon customer tidak valid.");
  if (input.invoice.outstandingAmount <= 0 || !input.invoice.invoiceNumber || input.invoice.status === "paid") block("INVALID_INVOICE", "Data invoice tidak memenuhi syarat panggilan.");

  return { allowed: codes.length === 0, reasons, codes };
}
