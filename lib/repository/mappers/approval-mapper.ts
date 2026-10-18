import type { CallApproval } from "../../domain/types";
import { bool, numeric, record, text } from "./mapper-utils";

export interface ApprovalRow { call_id: string; objective: string; minimum_payment: number | string; extension_allowed: boolean; maximum_follow_up_date: string; language: string; call_time: string; ai_disclosure_approved: boolean; data_confirmed: boolean; approved_by: string; approved_at: string }

export function toApprovalRow(value: CallApproval): ApprovalRow {
  return { call_id: value.callId, objective: value.objective, minimum_payment: value.minimumPayment, extension_allowed: value.extensionAllowed, maximum_follow_up_date: value.maximumFollowUpDate, language: value.language, call_time: value.callTime, ai_disclosure_approved: value.aiDisclosureApproved, data_confirmed: value.dataConfirmed, approved_by: value.approvedBy, approved_at: value.approvedAt };
}

export function fromApprovalRow(input: unknown): CallApproval {
  const row = record(input, "approval");
  return { callId: text(row, "call_id", "approval"), objective: text(row, "objective", "approval"), minimumPayment: numeric(row, "minimum_payment", "approval"), extensionAllowed: bool(row, "extension_allowed", "approval"), maximumFollowUpDate: text(row, "maximum_follow_up_date", "approval"), language: text(row, "language", "approval"), callTime: text(row, "call_time", "approval").slice(0, 5), aiDisclosureApproved: bool(row, "ai_disclosure_approved", "approval"), dataConfirmed: bool(row, "data_confirmed", "approval"), approvedBy: text(row, "approved_by", "approval"), approvedAt: text(row, "approved_at", "approval") };
}
