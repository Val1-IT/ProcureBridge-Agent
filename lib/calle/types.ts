import type { ScenarioKey, TranscriptSegment } from "../domain/types";

export interface CreateCallInput {
  callId: string;
  customerId: string;
  invoiceId: string;
  phone: string;
  language: string;
  scenario: ScenarioKey;
  disclosure: string;
}

export interface CreateCallResult {
  callId: string;
  providerCallId: string;
  status: "creating" | "connecting";
  provider: "mock" | "calle";
}

export interface CallStatus {
  callId: string;
  status: "creating" | "connecting" | "active" | "completed" | "failed";
  durationSeconds: number;
}

export interface CallProvider {
  createCall(input: CreateCallInput): Promise<CreateCallResult>;
  getCall(callId: string): Promise<CallStatus>;
  endCall(callId: string): Promise<void>;
  getTranscript(callId: string): Promise<TranscriptSegment[]>;
}
