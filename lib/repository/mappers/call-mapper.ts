import type { CallLifecycle, CallRecord, TranscriptSegment } from "../../domain/types";
import { arrayValue, enumText, nullableText, numeric, record, text } from "./mapper-utils";

const callStates = ["draft", "approval_pending", "approved", "blocked", "creating", "connecting", "active", "completed", "failed", "result_pending_review", "result_approved", "human_review", "result_rejected"] as const satisfies readonly CallLifecycle[];

export interface CallRow {
  id: string; customer_id: string; invoice_id: string; provider: CallRecord["provider"]; provider_call_id: string | null;
  status: CallLifecycle; started_at: string | null; ended_at: string | null; duration_seconds: number | string; outcome: string | null;
  sentiment: string | null; recording_url: string | null; transcript: unknown[]; ai_summary: string | null;
  human_approved_by: string | null; human_approved_at: string | null; scenario: CallRecord["scenario"];
}

export function toCallRow(call: CallRecord): CallRow {
  return { id: call.id, customer_id: call.customerId, invoice_id: call.invoiceId, provider: call.provider, provider_call_id: call.providerCallId, status: call.status, started_at: call.startedAt, ended_at: call.endedAt, duration_seconds: call.durationSeconds, outcome: call.outcome, sentiment: call.sentiment, recording_url: call.recordingUrl, transcript: call.transcript, ai_summary: call.aiSummary, human_approved_by: call.humanApprovedBy, human_approved_at: call.humanApprovedAt, scenario: call.scenario };
}

function transcriptSegment(input: unknown): TranscriptSegment {
  const row = record(input, "transcript segment");
  const sentiment = row.sentiment === undefined ? undefined : enumText(row, "sentiment", ["neutral", "cooperative", "concerned", "frustrated"] as const, "transcript segment");
  return { id: text(row, "id", "transcript segment"), speaker: enumText(row, "speaker", ["AI", "Customer", "System"] as const, "transcript segment"), text: text(row, "text", "transcript segment"), stage: numeric(row, "stage", "transcript segment"), offsetSeconds: numeric(row, "offsetSeconds", "transcript segment"), ...(sentiment ? { sentiment } : {}) };
}

export function fromCallRow(input: unknown): CallRecord {
  const row = record(input, "call");
  return { id: text(row, "id", "call"), customerId: text(row, "customer_id", "call"), invoiceId: text(row, "invoice_id", "call"), provider: enumText(row, "provider", ["mock", "calle"] as const, "call"), providerCallId: nullableText(row, "provider_call_id", "call"), status: enumText(row, "status", callStates, "call"), startedAt: nullableText(row, "started_at", "call"), endedAt: nullableText(row, "ended_at", "call"), durationSeconds: numeric(row, "duration_seconds", "call"), outcome: nullableText(row, "outcome", "call"), sentiment: nullableText(row, "sentiment", "call"), recordingUrl: nullableText(row, "recording_url", "call"), transcript: arrayValue(row, "transcript", "call").map(transcriptSegment), aiSummary: nullableText(row, "ai_summary", "call"), humanApprovedBy: nullableText(row, "human_approved_by", "call"), humanApprovedAt: nullableText(row, "human_approved_at", "call"), scenario: enumText(row, "scenario", ["promise_to_pay", "invoice_dispute", "failed_contact"] as const, "call") };
}
