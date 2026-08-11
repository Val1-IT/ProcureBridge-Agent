import { describe, expect, it } from "vitest";
import { POST as registerApproval } from "../app/api/supplier-calls/approval/route";
import { POST as startSupplierCall } from "../app/api/supplier-calls/route";
import { DELETE as invalidateSupplierCallSession, PUT as restartSupplierCallSession } from "../app/api/supplier-calls/session/route";
import {
  createCreateSupplierCallHandler,
  createInvalidateSupplierCallSessionHandler,
  createRestartSupplierCallSessionHandler,
  DemoSupplierCallAuthorizationRepository,
} from "../lib/server/supplier-call-authorization";

const approval = {
  supplierCallId: "supplier-call-po-1",
  supplierId: "supplier-utama",
  purchaseOrderId: "po-router-replenishment",
  scenario: "delivery_commitment",
  objective: "Confirm delivery date",
  permittedProductIds: ["product-router"],
  maximumDeliveryDate: "2026-08-20",
  partialDeliveryAllowed: true,
  maximumUnitPriceIncreasePercent: 0,
  language: "Bahasa Indonesia",
  approvedBy: "Nadia Pratama",
} as const;

let sessionSequence = 0;
function uniqueSession(label: string): string {
  sessionSequence += 1;
  return `demo_server_approval_${label}_${sessionSequence.toString().padStart(4, "0")}`;
}

function approvalRequest(demoSessionId: string, body: unknown = {
  demoSessionId,
  approvedAt: "2026-08-09T01:00:00.000Z",
  approval,
}): Request {
  return new Request("https://app.example/api/supplier-calls/approval", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function callRequest(demoSessionId: string, approvalCapability: string, overrides: Record<string, unknown> = {}): Request {
  return new Request("https://app.example/api/supplier-calls?forceMock=1", {
    method: "POST",
    headers: { "content-type": "application/json", "x-supplier-call-approval": approvalCapability },
    body: JSON.stringify({
      callId: approval.supplierCallId,
      supplierId: approval.supplierId,
      purchaseOrderId: approval.purchaseOrderId,
      demoSessionId,
      demoClockIso: "2026-08-10T03:00:00.000Z",
      ...overrides,
    }),
  });
}

function resetRequest(demoSessionId: string): Request {
  return new Request("https://app.example/api/supplier-calls/session", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ demoSessionId }),
  });
}

function replayRequest(demoSessionId: string, body: unknown = { demoSessionId }): Request {
  return new Request("https://app.example/api/supplier-calls/session", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function register(demoSessionId: string): Promise<string> {
  const response = await registerApproval(approvalRequest(demoSessionId));
  expect(response.status).toBe(201);
  const payload = await response.json() as { code?: string; approvalCapability?: string };
  expect(payload.code).toBe("SUPPLIER_CALL_APPROVAL_REGISTERED");
  expect(payload.approvalCapability).toMatch(/^sca_[A-Za-z0-9_-]{40,}$/);
  return payload.approvalCapability!;
}

describe("server-bound supplier-call approval", () => {
  it("registers an opaque exact-scope capability and requires it to start the call", async () => {
    const demoSessionId = uniqueSession("lifecycle");

    const capability = await register(demoSessionId);
    expect(capability).not.toContain(demoSessionId);
    expect(capability).not.toContain(approval.supplierCallId);

    const response = await startSupplierCall(callRequest(demoSessionId, capability));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ code: "SUPPLIER_CALL_CREATED", call: { callId: approval.supplierCallId, provider: "mock" } });
  });

  it("rejects a valid capability outside its exact demo-session scope", async () => {
    const registeredSession = uniqueSession("scope_a");
    const differentSession = uniqueSession("scope_b");
    const capability = await register(registeredSession);

    const response = await startSupplierCall(callRequest(differentSession, capability));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Server approval is required before a supplier call can start.",
      code: "SERVER_APPROVAL_REQUIRED",
    });
  });

  it("atomically consumes one approval capability across concurrent start requests", async () => {
    const demoSessionId = uniqueSession("concurrent");
    const capability = await register(demoSessionId);

    const responses = await Promise.all([
      startSupplierCall(callRequest(demoSessionId, capability)),
      startSupplierCall(callRequest(demoSessionId, capability)),
    ]);
    const statuses = responses.map((response) => response.status).sort((left, right) => left - right);

    expect(statuses).toEqual([201, 409]);
    const rejected = responses.find((response) => response.status === 409)!;
    expect(await rejected.json()).toEqual({
      error: "Server approval is required before a supplier call can start.",
      code: "SERVER_APPROVAL_REQUIRED",
    });
  });

  it("invalidates every pending approval for a reset session and rejects the retired capability", async () => {
    const demoSessionId = uniqueSession("reset");
    const capability = await register(demoSessionId);

    const reset = await invalidateSupplierCallSession(resetRequest(demoSessionId));
    expect(reset.status).toBe(204);
    const replay = await restartSupplierCallSession(replayRequest(demoSessionId));
    expect(replay.status).toBe(409);
    expect(await replay.json()).toEqual({ error: "Supplier call demo session is retired and cannot be replayed.", code: "SUPPLIER_CALL_SESSION_RETIRED" });

    // Reset is global: it must revoke a page-issued token even after that page has unmounted.
    const response = await startSupplierCall(callRequest(demoSessionId, capability));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Server approval is required before a supplier call can start.",
      code: "SERVER_APPROVAL_REQUIRED",
    });
  });

  it("treats reset of a session with no registered approval as a successful idempotent local cleanup", async () => {
    const reset = await invalidateSupplierCallSession(resetRequest(uniqueSession("empty_reset")));

    expect(reset.status).toBe(204);
  });

  it("rejects replay payloads with extra authority and production repositories", async () => {
    const demoSessionId = uniqueSession("replay_scope");
    const invalid = await restartSupplierCallSession(replayRequest(demoSessionId, { demoSessionId, erp: { activeRole: "admin" } }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "Invalid supplier call session request.", code: "INVALID_REQUEST" });

    const repository = new DemoSupplierCallAuthorizationRepository();
    Object.defineProperty(repository, "authorizationMode", { value: "production" });
    const productionRestart = createRestartSupplierCallSessionHandler({ repository });
    const rejected = await productionRestart(replayRequest(demoSessionId));

    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toEqual({ error: "Demo session replay is not authorized.", code: "DEMO_RESET_NOT_ALLOWED" });
  });

  it("returns reset-retry while a claimed provider attempt finishes exactly once", async () => {
    const demoSessionId = uniqueSession("claim_wins");
    const capability = "test_claim_wins_capability_12345678901234567890";
    const repository = new DemoSupplierCallAuthorizationRepository();
    const registered = await repository.registerSupplierCallApproval({
      demoSessionId,
      approvedAt: "2026-08-09T01:00:00.000Z",
      approval,
    }, capability);
    expect(registered.ok).toBe(true);
    let invocations = 0;
    let markProviderStarted!: () => void;
    let releaseProvider!: () => void;
    const providerStarted = new Promise<void>((resolve) => { markProviderStarted = resolve; });
    const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const start = createCreateSupplierCallHandler({
      repository,
      now: () => new Date("2026-08-10T03:00:00.000Z"),
      providerFactory: () => ({
        async createCall(input) {
          invocations += 1;
          markProviderStarted();
          await providerGate;
          return { callId: input.callId, providerCallId: `supplier_mock_${input.callId}`, status: "connecting", provider: "mock" };
        },
        async getCall(callId) { return { callId, status: "active", durationSeconds: 0 }; },
        async endCall() {},
        async getTranscript() { return []; },
      }),
    });
    const reset = createInvalidateSupplierCallSessionHandler({ repository });
    const restart = createRestartSupplierCallSessionHandler({ repository });

    const starting = start(callRequest(demoSessionId, capability));
    await providerStarted;
    const blockedRestart = await restart(replayRequest(demoSessionId));
    expect(blockedRestart.status).toBe(409);
    expect(await blockedRestart.json()).toEqual({ error: "Supplier call reset is busy; retry after the reserved attempt finishes.", code: "SUPPLIER_CALL_RESET_BUSY" });
    const blockedReset = await reset(resetRequest(demoSessionId));
    expect(blockedReset.status).toBe(409);
    expect(await blockedReset.json()).toEqual({ error: "Supplier call reset is busy; retry after the reserved attempt finishes.", code: "SUPPLIER_CALL_RESET_BUSY" });
    releaseProvider();
    expect((await starting).status).toBe(201);
    expect(invocations).toBe(1);
    expect((await reset(resetRequest(demoSessionId))).status).toBe(204);
  });

  it("lets reset win before claim so the retired capability never reaches the provider", async () => {
    const demoSessionId = uniqueSession("reset_wins");
    const capability = "test_reset_wins_capability_12345678901234567890";
    const repository = new DemoSupplierCallAuthorizationRepository();
    const registered = await repository.registerSupplierCallApproval({
      demoSessionId,
      approvedAt: "2026-08-09T01:00:00.000Z",
      approval,
    }, capability);
    expect(registered.ok).toBe(true);
    let invocations = 0;
    const start = createCreateSupplierCallHandler({
      repository,
      now: () => new Date("2026-08-10T03:00:00.000Z"),
      providerFactory: () => ({
        async createCall(input) { invocations += 1; return { callId: input.callId, providerCallId: `supplier_mock_${input.callId}`, status: "connecting", provider: "mock" }; },
        async getCall(callId) { return { callId, status: "active", durationSeconds: 0 }; },
        async endCall() {},
        async getTranscript() { return []; },
      }),
    });
    const reset = createInvalidateSupplierCallSessionHandler({ repository });

    expect((await reset(resetRequest(demoSessionId))).status).toBe(204);
    const response = await start(callRequest(demoSessionId, capability));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Server approval is required before a supplier call can start.", code: "SERVER_APPROVAL_REQUIRED" });
    expect(invocations).toBe(0);
  });

  it("rejects registration payloads containing browser snapshots or extra authority", async () => {
    const demoSessionId = uniqueSession("snapshot");
    const response = await registerApproval(approvalRequest(demoSessionId, {
      demoSessionId,
      approvedAt: "2026-08-09T01:00:00.000Z",
      approval,
      erp: { activeRole: "admin", suppliers: [{ phone: "secret" }] },
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid supplier call approval request.", code: "INVALID_REQUEST" });
  });
  it("clears completed call claims so the same guide session can replay deterministically", async () => {
    const demoSessionId = uniqueSession("guide_restart");
    const firstCapability = await register(demoSessionId);
    expect((await startSupplierCall(callRequest(demoSessionId, firstCapability))).status).toBe(201);

    const restarted = await restartSupplierCallSession(new Request("https://app.example/api/supplier-calls/session", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ demoSessionId }),
    }));
    expect(restarted.status).toBe(204);

    const replayCapability = await register(demoSessionId);
    expect((await startSupplierCall(callRequest(demoSessionId, replayCapability))).status).toBe(201);
  });
});
