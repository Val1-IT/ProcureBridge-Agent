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

export interface CalleProviderOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  correlationIdFactory?: () => string;
}

export class CalleProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly status?: number,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = "CalleProviderError";
  }
}

function normalizeBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new CalleProviderError("CALL-E configuration is invalid.", "INVALID_CONFIGURATION", false);
  }
}

function providerError(status: number, correlationId: string): CalleProviderError {
  if (status === 401 || status === 403) return new CalleProviderError(`CALL-E request failed with status ${status}.`, "AUTHENTICATION_FAILED", false, status, correlationId);
  if (status === 429) return new CalleProviderError(`CALL-E request failed with status ${status}.`, "RATE_LIMITED", true, status, correlationId);
  if (status >= 500) return new CalleProviderError(`CALL-E request failed with status ${status}.`, "PROVIDER_UNAVAILABLE", true, status, correlationId);
  return new CalleProviderError(`CALL-E request failed with status ${status}.`, "REQUEST_REJECTED", false, status, correlationId);
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export class CalleProvider implements CallProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly correlationIdFactory: () => string;

  constructor(private readonly config: Required<CalleEnvironment>, options: CalleProviderOptions = {}) {
    this.baseUrl = normalizeBaseUrl(config.CALLE_API_URL);
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.correlationIdFactory = options.correlationIdFactory ?? (() => globalThis.crypto?.randomUUID?.() ?? `corr-${Date.now()}`);
  }

  private async request<T>(path: string, init: RequestInit | undefined, validate: (value: unknown) => T): Promise<T> {
    const correlationId = this.correlationIdFactory();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.CALLE_API_KEY}`,
          "x-arvanta-correlation-id": correlationId,
          ...init?.headers,
        },
      });
      if (!response.ok) throw providerError(response.status, correlationId);
      if (response.status === 204) return validate(undefined);
      let parsed: unknown;
      try {
        const body = await response.text();
        parsed = body ? JSON.parse(body) : undefined;
      } catch {
        throw new CalleProviderError("CALL-E returned an invalid response.", "MALFORMED_RESPONSE", false, response.status, correlationId);
      }
      try { return validate(parsed); } catch (error) {
        if (error instanceof CalleProviderError) throw error;
        throw new CalleProviderError("CALL-E returned an invalid response.", "MALFORMED_RESPONSE", false, response.status, correlationId);
      }
    } catch (error) {
      if (error instanceof CalleProviderError) throw error;
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw new CalleProviderError("CALL-E request timed out.", "REQUEST_TIMEOUT", true, undefined, correlationId);
      throw new CalleProviderError("CALL-E request could not be completed.", "NETWORK_ERROR", true, undefined, correlationId);
    } finally {
      clearTimeout(timeout);
    }
  }

  async createCall(input: CreateCallInput): Promise<CreateCallResult> {
    return this.request<CreateCallResult>("/calls", {
      method: "POST",
      body: JSON.stringify({ ...input, agentId: this.config.CALLE_AGENT_ID }),
    }, (value) => {
      const row = objectValue(value);
      if (!row || typeof row.callId !== "string" || typeof row.providerCallId !== "string" || !["creating", "connecting"].includes(String(row.status)) || !["mock", "calle"].includes(String(row.provider))) throw new Error("invalid create response");
      return row as unknown as CreateCallResult;
    });
  }

  async getCall(callId: string): Promise<CallStatus> {
    return this.request<CallStatus>(`/calls/${encodeURIComponent(callId)}`, undefined, (value) => {
      const row = objectValue(value);
      if (!row || typeof row.callId !== "string" || !["creating", "connecting", "active", "completed", "failed"].includes(String(row.status)) || typeof row.durationSeconds !== "number") throw new Error("invalid call response");
      return row as unknown as CallStatus;
    });
  }

  async endCall(callId: string): Promise<void> {
    await this.request(`/calls/${encodeURIComponent(callId)}/end`, { method: "POST" }, () => undefined);
  }

  async getTranscript(callId: string): Promise<TranscriptSegment[]> {
    return this.request<TranscriptSegment[]>(`/calls/${encodeURIComponent(callId)}/transcript`, undefined, (value) => {
      if (!Array.isArray(value)) throw new Error("invalid transcript response");
      return value as TranscriptSegment[];
    });
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
