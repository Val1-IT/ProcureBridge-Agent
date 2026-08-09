import { describe, expect, it } from "vitest";
import { saveSupplierCallApproval } from "../lib/erp/commands/supplier-calls";
import { createSeedState } from "../lib/demo/seed";
import { loadDemoState } from "../lib/demo/persistence";

const approvalInput = {
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
  callTime: "10:00",
  approvedBy: "Nadia Pratama",
};

describe("supplier call schema v8 persistence", () => {
  it("migrates empty schema v7 supplier call collections into schema v8", () => {
    const legacy = createSeedState();
    legacy.schemaVersion = 7;
    const loaded = loadDemoState(JSON.stringify(legacy));
    expect(loaded.recoveryReason).toBeNull();
    expect(loaded.state.schemaVersion).toBe(8);
  });

  it("fails closed instead of inventing v8 approval and call provenance for stored v7 call records", () => {
    const legacy = createSeedState();
    legacy.schemaVersion = 7;
    legacy.erp.supplierCalls.push({
      id: "legacy-call", supplierId: "supplier-utama", purchaseOrderId: "po-router-replenishment", status: "draft", scenario: "delivery_commitment",
      createdAt: "2026-08-09T01:00:00.000Z", updatedAt: "2026-08-09T01:00:00.000Z",
    } as never);
    expect(loadDemoState(JSON.stringify(legacy)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("round trips a complete v8 approval and rejects malformed approval scope", () => {
    const state = createSeedState();
    const approved = saveSupplierCallApproval(state.erp, "approver", approvalInput, "2026-08-09T01:00:00.000Z");
    if (!approved.ok) throw new Error(approved.error.message);
    state.schemaVersion = 8;
    state.erp = approved.state;
    expect(loadDemoState(JSON.stringify(state)).recoveryReason).toBeNull();

    state.erp.supplierApprovals[0] = { ...state.erp.supplierApprovals[0], permittedProductIds: ["product-scanner"] };
    expect(loadDemoState(JSON.stringify(state)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("requires matching approval provenance for active persisted calls", () => {
    const state = createSeedState();
    const approved = saveSupplierCallApproval(state.erp, "approver", approvalInput, "2026-08-09T01:00:00.000Z");
    if (!approved.ok) throw new Error(approved.error.message);
    state.erp = approved.state;
    state.erp.supplierCalls[0] = {
      ...state.erp.supplierCalls[0], status: "active", provider: "mock", providerCallId: "supplier_mock_supplier-call-po-1",
      calledLocalDate: "2026-08-09", updatedAt: "2026-08-09T03:00:00.000Z",
    };
    expect(loadDemoState(JSON.stringify(state)).recoveryReason).toBeNull();
    state.erp.supplierApprovals = [];
    expect(loadDemoState(JSON.stringify(state)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it.each([
    ["invalid call time", { callTime: "99:99" }],
    ["blank objective", { objective: "   " }],
    ["blank approver", { approvedBy: "   " }],
  ])("rejects persisted approval with %s", (_label, patch) => {
    const state = createSeedState();
    const approved = saveSupplierCallApproval(state.erp, "approver", approvalInput, "2026-08-09T01:00:00.000Z");
    if (!approved.ok) throw new Error(approved.error.message);
    state.erp = approved.state;
    state.erp.supplierApprovals[0] = { ...state.erp.supplierApprovals[0], ...patch };
    expect(loadDemoState(JSON.stringify(state)).recoveryReason).toBe("INVALID_SCHEMA");
  });
});
