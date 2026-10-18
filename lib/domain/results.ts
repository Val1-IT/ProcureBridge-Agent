import type { AuditLog, DemoState, DisputeTicket, PaymentCommitment, StructuredResult } from "./types";

function audit(result: StructuredResult, actor: string, action: string): AuditLog {
  return {
    id: `audit-${result.id}-${action}-${Date.now()}`,
    entityType: "call_result",
    entityId: result.id,
    action,
    actorType: "human",
    actorId: actor,
    beforeData: { reviewStatus: "pending" },
    afterData: { outcome: result.callOutcome },
    createdAt: new Date().toISOString(),
  };
}

function setReviewStatus(state: DemoState, resultId: string, reviewStatus: StructuredResult["reviewStatus"]): StructuredResult[] {
  return state.pendingResults.map((result) => result.id === resultId ? { ...result, reviewStatus } : result);
}

export function validateStructuredResult(result: StructuredResult): string[] {
  const issues: string[] = [];
  if (result.confidenceScore < 0.8) issues.push("Confidence di bawah 0,80.");
  if (result.callOutcome === "promise_to_pay" && (!result.promisedAmount || !result.promisedDate)) {
    issues.push("Promise-to-pay harus menyebutkan nominal dan tanggal secara eksplisit.");
  }
  return issues;
}

export function applyApprovedResult(state: DemoState, result: StructuredResult, actor: string): DemoState {
  const current = state.pendingResults.find((item) => item.id === result.id);
  if (!current || current.reviewStatus !== "pending" || result.reviewStatus !== "pending") return state;
  if (current.callId !== result.callId || current.customerId !== result.customerId || current.invoiceId !== result.invoiceId) return state;
  if (result.humanReviewRequired || validateStructuredResult(result).length > 0) return state;
  const sourceInvoice = state.invoices.find((item) => item.id === result.invoiceId && item.customerId === result.customerId);
  if (!sourceInvoice) return state;
  if (result.callOutcome === "promise_to_pay" && state.paymentCommitments.some((item) => item.id === `ptp-${result.id}` || item.callId === result.callId)) return state;
  if (result.callOutcome === "dispute" && state.disputes.some((item) => item.id === `dispute-${result.id}` || item.callId === result.callId)) return state;
  const next: DemoState = {
    ...state,
    updatedAt: new Date().toISOString(),
    invoices: state.invoices.map((invoice) => ({ ...invoice })),
    pendingResults: setReviewStatus(state, result.id, "approved"),
    paymentCommitments: [...state.paymentCommitments],
    disputes: [...state.disputes],
    auditLogs: [...state.auditLogs, audit(result, actor, "structured_result.approved")],
  };
  const invoice = next.invoices.find((item) => item.id === result.invoiceId);
  if (!invoice) return next;

  if (result.callOutcome === "promise_to_pay" && result.promisedAmount && result.promisedDate) {
    const commitment: PaymentCommitment = {
      id: `ptp-${result.id}`,
      customerId: result.customerId,
      invoiceId: result.invoiceId,
      callId: result.callId,
      promisedAmount: result.promisedAmount,
      promisedDate: result.promisedDate,
      actualAmount: 0,
      status: "Upcoming",
      followUpDate: result.followUpDate,
      followUpStatus: "Scheduled",
      assignedOwner: actor,
    };
    next.paymentCommitments.push(commitment);
    invoice.contactStatus = "Promise to Pay";
    invoice.nextActionAt = result.followUpDate ? `${result.followUpDate}T09:00:00+07:00` : null;
  }

  if (result.callOutcome === "dispute") {
    const dispute: DisputeTicket = {
      id: `dispute-${result.id}`,
      customerId: result.customerId,
      invoiceId: result.invoiceId,
      callId: result.callId,
      category: result.disputeCategory ?? "Sengketa lainnya",
      description: result.summary,
      requestedEvidence: "Surat jalan, bukti penerimaan, dan rincian kuantitas barang",
      assignedTo: "Dimas — Order Operations",
      status: "Open",
      dueDate: "2026-08-07",
      followUpDate: result.followUpDate,
    };
    next.disputes.push(dispute);
    invoice.contactStatus = "Disputed";
    invoice.disputeStatus = "Open";
    invoice.recommendedAction = "Tahan panggilan; selesaikan dispute ticket";
  }

  if (result.callOutcome === "failed_contact") {
    invoice.contactStatus = "Scheduled";
    invoice.nextActionAt = "2026-08-05T09:30:00+07:00";
    invoice.recommendedAction = "Panggil ulang setelah verifikasi call policy";
  }
  return next;
}

export function rejectResult(state: DemoState, resultId: string, actor: string): DemoState {
  const result = state.pendingResults.find((item) => item.id === resultId);
  if (!result || result.reviewStatus !== "pending") return state;
  return {
    ...state,
    updatedAt: new Date().toISOString(),
    pendingResults: setReviewStatus(state, resultId, "rejected"),
    auditLogs: [...state.auditLogs, audit(result, actor, "structured_result.rejected")],
  };
}

export function markResultForReview(state: DemoState, resultId: string, actor: string): DemoState {
  const result = state.pendingResults.find((item) => item.id === resultId);
  if (!result || result.reviewStatus !== "pending") return state;
  return {
    ...state,
    updatedAt: new Date().toISOString(),
    invoices: state.invoices.map((invoice) => invoice.id === result.invoiceId ? { ...invoice, contactStatus: "Human Review" } : invoice),
    pendingResults: setReviewStatus(state, resultId, "human_review"),
    auditLogs: [...state.auditLogs, audit(result, actor, "structured_result.human_review")],
  };
}
