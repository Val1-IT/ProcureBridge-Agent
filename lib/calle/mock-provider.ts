import type { ScenarioKey, TranscriptSegment } from "../domain/types";
import type { CallProvider, CallStatus, CreateCallInput, CreateCallResult } from "./types";
import { demoTranscripts } from "../demo/call-scripts";

const callStates = new Map<string, CallStatus>();
const callScenarios = new Map<string, ScenarioKey>();

export function maskSensitiveData(text: string): string {
  return text.replace(/\b\d{6}\b/g, "[MASKED]").replace(/\b\d{13,19}\b/g, "[MASKED]");
}

export function getScenarioTranscript(scenario: ScenarioKey): TranscriptSegment[] {
  return demoTranscripts[scenario].map((segment) => ({ ...segment, text: maskSensitiveData(segment.text) }));
}

export class MockCallProvider implements CallProvider {
  async createCall(input: CreateCallInput): Promise<CreateCallResult> {
    callStates.set(input.callId, { callId: input.callId, status: "connecting", durationSeconds: 0 });
    callScenarios.set(input.callId, input.scenario);
    return { callId: input.callId, providerCallId: `mock_${input.callId}`, status: "connecting", provider: "mock" };
  }

  async getCall(callId: string): Promise<CallStatus> {
    return callStates.get(callId) ?? { callId, status: "failed", durationSeconds: 0 };
  }

  async endCall(callId: string): Promise<void> {
    const current = await this.getCall(callId);
    callStates.set(callId, { ...current, status: "completed" });
  }

  async getTranscript(callId: string): Promise<TranscriptSegment[]> {
    return getScenarioTranscript(callScenarios.get(callId) ?? "promise_to_pay");
  }
}
