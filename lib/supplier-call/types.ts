import type { SupplierCallScenario } from "../erp/types";

export type SupplierScenario = SupplierCallScenario;
export type SupplierCallProviderMode = "mock" | "live";

export interface SupplierTranscriptSegment {
  id: string;
  speaker: "AI" | "Supplier" | "System";
  text: string;
  stage: number;
  offsetSeconds: number;
}

export interface CreateSupplierCallInput {
  callId: string;
  supplierId: string;
  purchaseOrderId: string;
  phone: string;
  language: string;
  scenario: SupplierScenario;
  disclosure: string;
}

export interface CreateSupplierCallResult {
  callId: string;
  providerCallId: string;
  status: "creating" | "connecting";
  provider: "mock" | "calle";
}

export interface SupplierCallStatus {
  callId: string;
  status: "creating" | "connecting" | "active" | "completed" | "failed";
  durationSeconds: number;
}

export interface SupplierCallProvider {
  createCall(input: CreateSupplierCallInput): Promise<CreateSupplierCallResult>;
  getCall(callId: string): Promise<SupplierCallStatus>;
  endCall(callId: string): Promise<void>;
  getTranscript(callId: string): Promise<SupplierTranscriptSegment[]>;
}

export class SupplierCallProviderError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "SupplierCallProviderError";
  }
}
