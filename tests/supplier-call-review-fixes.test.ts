import { describe, expect, it } from "vitest";
import { createSeedState } from "../lib/demo/seed";
import { demoReducer } from "../lib/demo/reducer";
import { getJakartaClock } from "../lib/supplier-call/jakarta-clock";
import { saveSupplierCallApproval } from "../lib/erp/commands/supplier-calls";
import { approveSupplierResult, completeSupplierCallSimulation, recordSupplierCallStarted } from "../lib/erp/commands/supplier-results";
import { getSupplierScenarioTranscript } from "../lib/supplier-call/scripts";
import { loadDemoState } from "../lib/demo/persistence";

function approved() {
  const state = createSeedState().erp;
  const saved = saveSupplierCallApproval(state, "approver", {
    supplierCallId: "supplier-call-po-1", supplierId: "supplier-utama", purchaseOrderId: "po-router-replenishment", scenario: "delivery_commitment",
    objective: "Confirm delivery", permittedProductIds: ["product-router"], maximumDeliveryDate: "2026-08-20",
    partialDeliveryAllowed: true, maximumUnitPriceIncreasePercent: 0, language: "Bahasa Indonesia", approvedBy: "Nadia",
  }, "2026-08-09T01:00:00.000Z");
  if (!saved.ok) throw new Error(saved.error.message);
  return saved.state;
}

describe("supplier call review fixes", () => {
  it("uses the actual Jakarta clock and not an approval-selected time", () => {
    expect(getJakartaClock(new Date("2026-08-09T12:00:00.000Z"))).toEqual({ date: "2026-08-09", time: "19:00" });
    const state = approved();
    const started = recordSupplierCallStarted(state, "approver", "supplier-call-po-1", {
      callId: "supplier-call-po-1", providerCallId: "supplier_mock_supplier-call-po-1", provider: "mock", status: "connecting",
    }, "2026-08-09T12:00:00.000Z");
    expect(started).toMatchObject({ ok: false, state, error: { code: "INVALID_STATE" } });
  });

  it("rotates an opaque demo session id on reset", () => {
    const before = createSeedState();
    const after = demoReducer(before, { type: "RESET" });
    expect(before.demoSessionId).toMatch(/^demo_[A-Za-z0-9_-]{20,100}$/);
    expect(after.demoSessionId).toMatch(/^demo_[A-Za-z0-9_-]{20,100}$/);
    expect(after.demoSessionId).not.toBe(before.demoSessionId);
  });

  it("migrates schema v9 to a fresh session and rejects malformed v10 session identity", () => {
    const legacy = createSeedState() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 9; delete legacy.demoSessionId;
    const migrated = loadDemoState(JSON.stringify(legacy));
    expect(migrated.recoveryReason).toBeNull();
    expect(migrated.state.demoSessionId).toMatch(/^demo_[A-Za-z0-9_-]{20,100}$/);
    const malformed = { ...createSeedState(), demoSessionId: "../../shared" };
    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("replaces a crafted valid-looking session id when migrating schema v9", () => {
    const injected = "demo_attacker_controlled_session_12345";
    const legacy = { ...createSeedState(injected), schemaVersion: 9 };
    const migrated = loadDemoState(JSON.stringify(legacy));
    expect(migrated.recoveryReason).toBeNull();
    expect(migrated.state.demoSessionId).toMatch(/^demo_[A-Za-z0-9_-]{20,100}$/);
    expect(migrated.state.demoSessionId).not.toBe(injected);
  });

  it("persists only the displayed prefix and creates human review when ended early", () => {
    const state = approved();
    const started = recordSupplierCallStarted(state, "approver", "supplier-call-po-1", {
      callId: "supplier-call-po-1", providerCallId: "supplier_mock_supplier-call-po-1", provider: "mock", status: "connecting",
    }, "2026-08-09T03:00:00.000Z");
    if (!started.ok) throw new Error(started.error.message);
    const visible = getSupplierScenarioTranscript("delivery_commitment").slice(0, 2);
    const ended = completeSupplierCallSimulation(started.state, "approver", "supplier-call-po-1", { visibleTranscript: visible, elapsedSeconds: visible.at(-1)!.offsetSeconds }, "2026-08-09T03:00:07.000Z");
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    expect(ended.state.supplierCalls[0]).toMatchObject({ status: "ended_early", transcript: visible, durationSeconds: 7 });
    expect(ended.value).toMatchObject({ status: "human_review", scenario: "failed_contact" });
  });

  it.each(["fully_received", "completed", "cancelled"] as const)("rejects approving a result after PO becomes %s without mutation", (status) => {
    const state = approved();
    const started = recordSupplierCallStarted(state, "approver", "supplier-call-po-1", { callId: "supplier-call-po-1", providerCallId: "supplier_mock_supplier-call-po-1", provider: "mock", status: "connecting" }, "2026-08-09T03:00:00.000Z");
    if (!started.ok) throw new Error(started.error.message);
    const transcript = getSupplierScenarioTranscript("delivery_commitment");
    const completed = completeSupplierCallSimulation(started.state, "approver", "supplier-call-po-1", { visibleTranscript: transcript, elapsedSeconds: transcript.at(-1)!.offsetSeconds }, "2026-08-09T03:01:00.000Z");
    if (!completed.ok) throw new Error(completed.error.message);
    const stale = { ...completed.state, purchaseOrders: completed.state.purchaseOrders.map((po) => ({ ...po, status })) };
    const result = approveSupplierResult(stale, "approver", completed.value.id, "2026-08-09T04:00:00.000Z");
    expect(result).toMatchObject({ ok: false, state: stale, error: { code: "INVALID_STATE" } });
  });

  it("rejects approving a result when a dispute was opened after the call", () => {
    const state = approved();
    const started = recordSupplierCallStarted(state, "approver", "supplier-call-po-1", { callId: "supplier-call-po-1", providerCallId: "supplier_mock_supplier-call-po-1", provider: "mock", status: "connecting" }, "2026-08-09T03:00:00.000Z");
    if (!started.ok) throw new Error(started.error.message);
    const transcript = getSupplierScenarioTranscript("delivery_commitment");
    const completed = completeSupplierCallSimulation(started.state, "approver", "supplier-call-po-1", { visibleTranscript: transcript, elapsedSeconds: transcript.at(-1)!.offsetSeconds }, "2026-08-09T03:01:00.000Z");
    if (!completed.ok) throw new Error(completed.error.message);
    const disputed = { ...completed.state, disputes: [{ id: "late-dispute", supplierId: "supplier-utama", customerId: null, purchaseOrderId: "po-router-replenishment", salesOrderId: null, status: "open" as const, reason: "Late issue", createdAt: "2026-08-09T03:30:00.000Z", updatedAt: "2026-08-09T03:30:00.000Z" }] };
    expect(approveSupplierResult(disputed, "approver", completed.value.id, "2026-08-09T04:00:00.000Z")).toMatchObject({ ok: false, state: disputed, error: { code: "INVALID_STATE" } });
  });
});
