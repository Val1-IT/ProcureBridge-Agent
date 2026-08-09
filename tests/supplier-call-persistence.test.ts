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

function createStateWithCompletedSupplierCall() {
  const state = createSeedState();
  const approved = saveSupplierCallApproval(state.erp, "approver", approvalInput, "2026-08-09T01:00:00.000Z");
  if (!approved.ok) throw new Error(approved.error.message);
  state.erp = approved.state;
  state.erp.supplierCalls[0] = {
    ...state.erp.supplierCalls[0], status: "completed", provider: "mock", providerCallId: "supplier_mock_supplier-call-po-1",
    calledLocalDate: "2026-08-09", updatedAt: "2026-08-09T03:00:00.000Z",
  };
  return state;
}

const result = {
  id: "supplier-result-1", supplierCallId: "supplier-call-po-1", supplierId: "supplier-utama", purchaseOrderId: "po-router-replenishment",
  status: "pending" as const, scenario: "delivery_commitment" as const, promisedDeliveryDate: "2026-08-15",
  createdAt: "2026-08-09T03:01:00.000Z", updatedAt: "2026-08-09T03:01:00.000Z",
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

  it.each([
    ["cross-linked supplier", { supplierId: "supplier-kertas" }],
    ["cross-linked purchase order", { purchaseOrderId: "po-second" }],
    ["mismatched scenario", { scenario: "stock_unavailable" as const }],
  ])("rejects supplier result with %s", (_label, patch) => {
    const state = createStateWithCompletedSupplierCall();
    state.erp.purchaseOrders.push({ ...state.erp.purchaseOrders[0], id: "po-second", orderNumber: "PO-2026-0002" });
    state.erp.supplierResults = [{ ...result, ...patch }];
    expect(loadDemoState(JSON.stringify(state)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("rejects duplicate supplier result IDs", () => {
    const state = createStateWithCompletedSupplierCall();
    state.erp.supplierResults = [
      { ...result, status: "rejected" },
      { ...result, status: "rejected", updatedAt: "2026-08-09T03:02:00.000Z" },
    ];
    expect(loadDemoState(JSON.stringify(state)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("allows rejected result history but at most one active or approved result per call", () => {
    const valid = createStateWithCompletedSupplierCall();
    valid.erp.supplierResults = [
      { ...result, id: "supplier-result-rejected", status: "rejected" },
      { ...result, id: "supplier-result-current", status: "pending", updatedAt: "2026-08-09T03:02:00.000Z" },
    ];
    expect(loadDemoState(JSON.stringify(valid)).recoveryReason).toBeNull();

    valid.erp.supplierResults.push({ ...result, id: "supplier-result-approved", status: "approved", updatedAt: "2026-08-09T03:03:00.000Z" });
    expect(loadDemoState(JSON.stringify(valid)).recoveryReason).toBe("INVALID_SCHEMA");
  });
});
