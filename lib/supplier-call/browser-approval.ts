import type { SaveSupplierCallApprovalInput } from "../erp/commands/supplier-calls";
import type { ErpCommandResult } from "../erp/errors";
import type { SupplierCall, SupplierCallApproval } from "../erp/types";
import type { CreateSupplierCallResult } from "./types";

export interface ApproveAndRegisterSupplierCallInput {
  demoSessionId: string;
  approval: SaveSupplierCallApprovalInput;
  approvedAt: string;
  saveApproval: (
    approval: SaveSupplierCallApprovalInput,
    approvedAt: string,
  ) => Promise<ErpCommandResult<SupplierCallApproval>>;
  fetcher?: typeof fetch;
}

export type BrowserSupplierCallApprovalResult =
  | { ok: true; approvalCapability: string; error: null }
  | { ok: false; approvalCapability: null; error: string };

const capabilityPattern = /^sca_[A-Za-z0-9_-]{40,196}$/;

export interface BrowserSupplierCallApprovalBinding {
  approvalCapability: string;
  approvedAt: string;
}

function safeRegistrationError(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Unable to register supplier call approval.";
  const error = (value as Record<string, unknown>).error;
  return typeof error === "string" && error.trim() && error.length <= 240
    ? error
    : "Unable to register supplier call approval.";
}

export type BrowserSupplierCallReplayResult =
  | { ok: true }
  | { ok: false; error: string };

export async function restartSupplierCallDemoSession(
  demoSessionId: string,
  fetcher: typeof fetch = fetch,
): Promise<BrowserSupplierCallReplayResult> {
  try {
    const response = await fetcher("/api/supplier-calls/session", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ demoSessionId }),
    });
    if (response.status === 204) return { ok: true };
    let payload: unknown = null;
    try { payload = await response.json() as unknown; } catch { /* Keep the safe generic error. */ }
    return { ok: false, error: safeRegistrationError(payload) };
  } catch {
    return { ok: false, error: "Unable to reset Supplier Agent replay safely." };
  }
}

export async function approveAndRegisterSupplierCall(
  input: ApproveAndRegisterSupplierCallInput,
): Promise<BrowserSupplierCallApprovalResult> {
  const local = await input.saveApproval(input.approval, input.approvedAt);
  if (!local.ok) {
    return { ok: false, approvalCapability: null, error: local.error.message };
  }

  try {
    const response = await (input.fetcher ?? fetch)("/api/supplier-calls/approval", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        demoSessionId: input.demoSessionId,
        approvedAt: input.approvedAt,
        approval: input.approval,
      }),
    });
    const payload = await response.json() as unknown;
    if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, approvalCapability: null, error: safeRegistrationError(payload) };
    }
    const approvalCapability = (payload as Record<string, unknown>).approvalCapability;
    if (typeof approvalCapability !== "string" || !capabilityPattern.test(approvalCapability)) {
      return { ok: false, approvalCapability: null, error: "Unable to register supplier call approval." };
    }
    return { ok: true, approvalCapability, error: null };
  } catch {
    return { ok: false, approvalCapability: null, error: "Unable to register supplier call approval." };
  }
}

export function isSupplierCallStartUnlocked(
  locallyEligible: boolean,
  binding: BrowserSupplierCallApprovalBinding | null,
  authoritativeApprovedAt: string | null,
): boolean {
  return locallyEligible && binding !== null
    && binding.approvedAt === authoritativeApprovedAt
    && capabilityPattern.test(binding.approvalCapability);
}

export interface RecordStartedSupplierCallAfterServerClaimInput {
  callId: string;
  providerResult: CreateSupplierCallResult;
  startedAt: string;
  recordStarted: (
    callId: string,
    providerResult: CreateSupplierCallResult,
    startedAt: string,
  ) => Promise<ErpCommandResult<SupplierCall>>;
  maxAttempts?: number;
}

export async function recordStartedSupplierCallAfterServerClaim(
  input: RecordStartedSupplierCallAfterServerClaimInput,
): Promise<ErpCommandResult<SupplierCall>> {
  const maxAttempts = Math.max(1, Math.min(5, input.maxAttempts ?? 3));
  let result = await input.recordStarted(input.callId, input.providerResult, input.startedAt);
  for (let attempt = 1; !result.ok && result.error.code === "STALE_STATE" && attempt < maxAttempts; attempt += 1) {
    result = await input.recordStarted(input.callId, input.providerResult, input.startedAt);
  }
  return result;
}
