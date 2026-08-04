import { MockCallProvider } from "./mock-provider";
import type { CallProvider, CallStatus, CreateCallInput, CreateCallResult } from "./types";
import type { TranscriptSegment } from "../domain/types";

export interface CalleEnvironment {
  CALLE_API_URL?: string;
  CALLE_API_KEY?: string;
  CALLE_AGENT_ID?: string;
}

export interface ProviderOptions {
  forceMock?: boolean;
}

export class CalleProvider implements CallProvider {
  constructor(private readonly config: Required<CalleEnvironment>) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.config.CALLE_API_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.CALLE_API_KEY}`,
        ...init?.headers,
      },
    });
    if (!response.ok) throw new Error(`CALL-E request failed with status ${response.status}.`);
    return response.json() as Promise<T>;
  }

  async createCall(input: CreateCallInput): Promise<CreateCallResult> {
    return this.request<CreateCallResult>("/calls", {
      method: "POST",
      body: JSON.stringify({ ...input, agentId: this.config.CALLE_AGENT_ID }),
    });
  }

  async getCall(callId: string): Promise<CallStatus> {
    return this.request<CallStatus>(`/calls/${encodeURIComponent(callId)}`);
  }

  async endCall(callId: string): Promise<void> {
    await this.request(`/calls/${encodeURIComponent(callId)}/end`, { method: "POST" });
  }

  async getTranscript(callId: string): Promise<TranscriptSegment[]> {
    return this.request<TranscriptSegment[]>(`/calls/${encodeURIComponent(callId)}/transcript`);
  }
}

export function getCallProviderMode(env: CalleEnvironment, options: ProviderOptions = {}): "mock" | "calle" {
  if (!options.forceMock && env.CALLE_API_URL && env.CALLE_API_KEY && env.CALLE_AGENT_ID) return "calle";
  return "mock";
}

export function getCallProvider(env: CalleEnvironment, options: ProviderOptions = {}): CallProvider {
  if (getCallProviderMode(env, options) === "calle") {
    return new CalleProvider(env as Required<CalleEnvironment>);
  }
  return new MockCallProvider();
}
