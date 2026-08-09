import { getSupplierScenarioTranscript } from "./scripts";
import type { CreateSupplierCallInput, CreateSupplierCallResult, SupplierCallProvider, SupplierCallStatus, SupplierScenario, SupplierTranscriptSegment } from "./types";
import { SupplierCallProviderError } from "./types";

export class MockSupplierCallProvider implements SupplierCallProvider {
  private readonly states = new Map<string, SupplierCallStatus>();
  private readonly scenarios = new Map<string, SupplierScenario>();

  async createCall(input: CreateSupplierCallInput): Promise<CreateSupplierCallResult> {
    this.states.set(input.callId, { callId: input.callId, status: "connecting", durationSeconds: 0 });
    this.scenarios.set(input.callId, input.scenario);
    return { callId: input.callId, providerCallId: `supplier_mock_${input.callId}`, status: "connecting", provider: "mock" };
  }

  async getCall(callId: string): Promise<SupplierCallStatus> {
    return this.states.get(callId) ?? { callId, status: "failed", durationSeconds: 0 };
  }

  async endCall(callId: string): Promise<void> {
    const current = this.states.get(callId);
    if (!current) throw new SupplierCallProviderError("Supplier call was not found.", "CALL_NOT_FOUND");
    this.states.set(callId, { ...current, status: "completed" });
  }

  async getTranscript(callId: string): Promise<SupplierTranscriptSegment[]> {
    const scenario = this.scenarios.get(callId);
    if (!scenario) return [];
    return getSupplierScenarioTranscript(scenario);
  }
}
