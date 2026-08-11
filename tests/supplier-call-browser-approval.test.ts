import { describe, expect, it } from "vitest";
import { createErpCommandExecutor } from "../lib/erp/command-intents";
import type { SaveSupplierCallApprovalInput } from "../lib/erp/commands/supplier-calls";
import { createErpSeedState } from "../lib/erp/seed";
import type { ErpState } from "../lib/erp/types";
import {
  approveAndRegisterSupplierCall,
  isSupplierCallStartUnlocked,
  recordStartedSupplierCallAfterServerClaim,
  restartSupplierCallDemoSession,
} from "../lib/supplier-call/browser-approval";

const demoSessionId = "demo_browser_approval_workflow_12345";
const approval: SaveSupplierCallApprovalInput = {
  supplierCallId: "supplier-call-po-1",
  supplierId: "supplier-utama",
  purchaseOrderId: "po-router-replenishment",
  scenario: "delivery_commitment" as const,
  objective: "Confirm delivery date",
  permittedProductIds: ["product-router"],
  maximumDeliveryDate: "2026-08-20",
  partialDeliveryAllowed: true,
  maximumUnitPriceIncreasePercent: 0,
  language: "Bahasa Indonesia",
  approvedBy: "Nadia Pratama",
};

function localApprovalCommand(role: ErpState["activeRole"] = "approver") {
  let state = createErpSeedState();
  state.activeRole = role;
  const executor = createErpCommandExecutor(
    () => state,
    (_expectedRevision, next) => { state = next; return true; },
  );
  return {
    getState: () => state,
    saveApproval: async (input: SaveSupplierCallApprovalInput, now: string) => executor.saveSupplierCallApproval(input, now),
  };
}

describe("browser supplier-call approval binding", () => {
  it("keeps Start locked and exposes a safe error when server registration fails after local approval", async () => {
    const local = localApprovalCommand();

    const result = await approveAndRegisterSupplierCall({
      demoSessionId,
      approval,
      approvedAt: "2026-08-09T01:00:00.000Z",
      saveApproval: local.saveApproval,
      fetcher: async () => Response.json({ error: "Registration unavailable." }, { status: 502 }),
    });

    expect(local.getState().supplierApprovals).toHaveLength(1);
    expect(result).toEqual({ ok: false, approvalCapability: null, error: "Registration unavailable." });
    expect(isSupplierCallStartUnlocked(true, null, null)).toBe(false);
  });

  it("unlocks Start only after the exact locally approved scope is registered server-side", async () => {
    const local = localApprovalCommand();
    let registeredBody: unknown = null;
    const capability = "sca_12345678901234567890123456789012345678901234567890";

    const result = await approveAndRegisterSupplierCall({
      demoSessionId,
      approval,
      approvedAt: "2026-08-09T01:00:00.000Z",
      saveApproval: local.saveApproval,
      fetcher: async (_url, init) => {
        registeredBody = JSON.parse(String(init?.body));
        return Response.json({ code: "SUPPLIER_CALL_APPROVAL_REGISTERED", approvalCapability: capability }, { status: 201 });
      },
    });

    expect(registeredBody).toEqual({ demoSessionId, approvedAt: "2026-08-09T01:00:00.000Z", approval });
    expect(result).toEqual({ ok: true, approvalCapability: capability, error: null });
    if (!result.ok) throw new Error(result.error);
    const binding = { approvalCapability: result.approvalCapability, approvedAt: "2026-08-09T01:00:00.000Z" };
    expect(isSupplierCallStartUnlocked(true, binding, "2026-08-09T01:00:00.000Z")).toBe(true);
    expect(isSupplierCallStartUnlocked(true, binding, "2026-08-09T01:00:00.001Z")).toBe(false);
  });

  it("fails closed before POST when an authoritative approval replacement supersedes the in-memory token", () => {
    const oldBinding = { approvalCapability: "sca_12345678901234567890123456789012345678901234567890", approvedAt: "2026-08-09T01:00:00.000Z" };
    expect(isSupplierCallStartUnlocked(true, oldBinding, "2026-08-09T01:01:00.000Z")).toBe(false);
  });

  it("never registers server authority when the local approval command is rejected", async () => {
    const local = localApprovalCommand("viewer" as ErpState["activeRole"]);
    let registrations = 0;

    const result = await approveAndRegisterSupplierCall({
      demoSessionId,
      approval,
      approvedAt: "2026-08-09T01:00:00.000Z",
      saveApproval: local.saveApproval,
      fetcher: async () => { registrations += 1; return new Response(null, { status: 500 }); },
    });

    expect(registrations).toBe(0);
    expect(local.getState().supplierApprovals).toHaveLength(0);
    expect(result.ok).toBe(false);
    expect(result.approvalCapability).toBeNull();
    expect(isSupplierCallStartUnlocked(true, null, null)).toBe(false);
  });

  it("reconciles a successful server claim after one local CAS loss", async () => {
    let state = createErpSeedState();
    state.activeRole = "approver";
    const setup = createErpCommandExecutor(
      () => state,
      (_expectedRevision, next) => { state = next; return true; },
    );
    const approved = setup.saveSupplierCallApproval(approval, "2026-08-09T01:00:00.000Z");
    expect(approved.ok).toBe(true);

    let attempts = 0;
    const executor = createErpCommandExecutor(
      () => state,
      (_expectedRevision, next) => {
        attempts += 1;
        if (attempts === 1) return false;
        state = next;
        return true;
      },
    );
    const result = await recordStartedSupplierCallAfterServerClaim({
      callId: approval.supplierCallId,
      providerResult: { callId: approval.supplierCallId, provider: "mock", providerCallId: "mock-reconciled-call", status: "creating" },
      startedAt: "2026-08-10T03:00:00.000Z",
      recordStarted: async (callId, providerResult, now) => executor.recordSupplierCallStarted(callId, providerResult, now),
    });

    expect(result.ok).toBe(true);
    expect(attempts).toBe(2);
    expect(state.supplierCalls.find((call) => call.id === approval.supplierCallId)).toMatchObject({
      status: "active", providerCallId: "mock-reconciled-call",
    });
  });
  it("requests an in-process server replay reset without persisting authority", async () => {
    let request: { url: string; method?: string; body?: string } | null = null;
    const result = await restartSupplierCallDemoSession(demoSessionId, async (url, init) => {
      request = { url: String(url), method: init?.method, body: String(init?.body) };
      return new Response(null, { status: 204 });
    });

    expect(result).toEqual({ ok: true });
    expect(request).toEqual({
      url: "/api/supplier-calls/session",
      method: "PUT",
      body: JSON.stringify({ demoSessionId }),
    });
  });

  it("fails closed with a safe message when the server rejects replay reset", async () => {
    const result = await restartSupplierCallDemoSession(demoSessionId, async () => Response.json({
      error: "Supplier call replay is busy.",
      code: "SUPPLIER_CALL_RESET_BUSY",
    }, { status: 409 }));

    expect(result).toEqual({ ok: false, error: "Supplier call replay is busy." });
  });
});
