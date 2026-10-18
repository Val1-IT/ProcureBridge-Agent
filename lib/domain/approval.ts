import type { CallApproval } from "./types";

export interface ApprovalIssue {
  field: keyof CallApproval;
  message: string;
}

export function validateApproval(approval: CallApproval | null): ApprovalIssue[] {
  if (!approval) return [{ field: "callId", message: "Human approval belum dibuat." }];
  const issues: ApprovalIssue[] = [];
  if (!approval.objective.trim()) issues.push({ field: "objective", message: "Tujuan panggilan wajib dipilih." });
  if (!Number.isFinite(approval.minimumPayment) || approval.minimumPayment < 0) issues.push({ field: "minimumPayment", message: "Batas pembayaran sebagian tidak valid." });
  if (!approval.maximumFollowUpDate) issues.push({ field: "maximumFollowUpDate", message: "Tanggal follow-up maksimum wajib diisi." });
  if (!approval.language) issues.push({ field: "language", message: "Bahasa panggilan wajib dipilih." });
  if (!/^\d{2}:\d{2}$/.test(approval.callTime)) issues.push({ field: "callTime", message: "Waktu panggilan wajib diisi." });
  if (!approval.aiDisclosureApproved) issues.push({ field: "aiDisclosureApproved", message: "Disclosure AI wajib disetujui." });
  if (!approval.dataConfirmed) issues.push({ field: "dataConfirmed", message: "Konfirmasi kebenaran data wajib diberikan." });
  if (!approval.approvedBy.trim()) issues.push({ field: "approvedBy", message: "Nama approver wajib diisi." });
  return issues;
}
