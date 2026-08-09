import { describe, expect, it } from "vitest";
import {
  approveSupplierResult,
  completeSupplierCallSimulation,
  editSupplierResult,
  markSupplierResultForHumanReview,
  recordSupplierCallStarted,
  rejectSupplierResult,
} from "../lib/erp/commands/supplier-results";
import { saveSupplierCallApproval } from "../lib/erp/commands/supplier-calls";
import { createErpSeedState } from "../lib/erp/seed";
import type { ErpRole, ErpState, SupplierCallResult, SupplierCallScenario } from "../lib/erp/types";

const approvedAt = "2026-08-09T01:00:00.000Z";
const startedAt = "2026-08-09T03:00:00.000Z";
const reviewedAt = "2026-08-09T04:00:00.000Z";

function stateWithResult(scenario: SupplierCallScenario = "delivery_commitment"): ErpState {
  const seed = createErpSeedState();
  const approval = saveSupplierCallApproval(seed, "approver", {
    supplierCallId: "supplier-call-po-1",
    supplierId: "supplier-utama",
    purchaseOrderId: "po-router-replenishment",
    scenario,
    objective: "Confirm the supplier commitment without changing ordered quantity or price.",
    permittedProductIds: ["product-router"],
    maximumDeliveryDate: "2026-08-20",
    partialDeliveryAllowed: true,
    maximumUnitPriceIncreasePercent: 0,
    language: "Bahasa Indonesia",
    approvedBy: "Nadia Pratama",
  }, approvedAt);
  if (!approval.ok) throw new Error(approval.error.message);
  const started = recordSupplierCallStarted(approval.state, "approver", "supplier-call-po-1", {
    callId: "supplier-call-po-1",
    providerCallId: "supplier_mock_supplier-call-po-1",
    provider: "mock",
    status: "connecting",
  }, "2026-08-09", startedAt);
  if (!started.ok) throw new Error(started.error.message);
  const completed = completeSupplierCallSimulation(started.state, "approver", "supplier-call-po-1", reviewedAt);
  if (!completed.ok) throw new Error(completed.error.message);
  return completed.state;
}

function pending(state: ErpState): SupplierCallResult {
  const result = state.supplierResults.find((item) => item.status === "pending");
  if (!result) throw new Error("Expected a pending supplier result.");
  return result;
}

describe("supplier result review commands", () => {
  it("re-checks the latest persisted guardrails before recording a provider start", () => {
    const seed = createErpSeedState();
    const approval = saveSupplierCallApproval(seed, "approver", {
      supplierCallId: "supplier-call-po-1", supplierId: "supplier-utama", purchaseOrderId: "po-router-replenishment", scenario: "delivery_commitment",
      objective: "Confirm delivery date", permittedProductIds: ["product-router"], maximumDeliveryDate: "2026-08-20", partialDeliveryAllowed: true,
      maximumUnitPriceIncreasePercent: 0, language: "Bahasa Indonesia", approvedBy: "Nadia Pratama",
    }, approvedAt);
    if (!approval.ok) throw new Error(approval.error.message);
    approval.state.suppliers[0] = { ...approval.state.suppliers[0], doNotContact: true };
    const started = recordSupplierCallStarted(approval.state, "approver", "supplier-call-po-1", {
      callId: "supplier-call-po-1", providerCallId: "supplier_mock_supplier-call-po-1", provider: "mock", status: "connecting",
    }, "2026-08-09", startedAt);
    expect(started).toMatchObject({ ok: false, state: approval.state, error: { code: "INVALID_STATE" } });
  });

  it("rejects live provider claims at the browser demo persistence boundary", () => {
    const seed = createErpSeedState();
    const approval = saveSupplierCallApproval(seed, "approver", {
      supplierCallId: "supplier-call-po-1", supplierId: "supplier-utama", purchaseOrderId: "po-router-replenishment", scenario: "delivery_commitment",
      objective: "Confirm delivery date", permittedProductIds: ["product-router"], maximumDeliveryDate: "2026-08-20", partialDeliveryAllowed: true,
      maximumUnitPriceIncreasePercent: 0, language: "Bahasa Indonesia", approvedBy: "Nadia Pratama",
    }, approvedAt);
    if (!approval.ok) throw new Error(approval.error.message);
    const started = recordSupplierCallStarted(approval.state, "approver", "supplier-call-po-1", {
      callId: "supplier-call-po-1", providerCallId: "calle_live_attempt", provider: "calle", status: "connecting",
    }, "2026-08-09", startedAt);
    expect(started).toMatchObject({ ok: false, state: approval.state, error: { code: "INVALID_STATE" } });
  });

  it("applies an approved delivery commitment exactly once", () => {
    const before = stateWithResult("delivery_commitment");
    const result = pending(before);
    const edited = editSupplierResult(before, "approver", result.id, {
      promisedDeliveryDate: "2026-08-12",
      followUpDate: "2026-08-12",
      summary: "Supplier committed to deliver the complete order on 12 August.",
    }, reviewedAt);
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;

    const first = approveSupplierResult(edited.state, "approver", result.id, "2026-08-09T04:05:00.000Z");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.purchaseOrders[0].promisedDeliveryDate).toBe("2026-08-12");
    expect(first.state.followUps).toEqual([expect.objectContaining({ purchaseOrderId: "po-router-replenishment", dueAt: "2026-08-12T09:00:00.000Z", approvalStatus: "approved" })]);
    expect(first.state.auditLogs.at(-1)).toMatchObject({ action: "supplier_result.approved", actorRole: "approver" });

    const second = approveSupplierResult(first.state, "approver", result.id, "2026-08-09T04:06:00.000Z");
    expect(second.ok).toBe(false);
    expect(second.state).toBe(first.state);
    expect(second.ok ? null : second.error.code).toBe("INVALID_STATE");
  });

  it("never changes stock, invoices, payments, quantities, or approved prices", () => {
    const before = stateWithResult("partial_delivery");
    const snapshot = {
      stockMovements: before.stockMovements,
      supplierInvoices: before.supplierInvoices,
      customerInvoices: before.customerInvoices,
      payments: before.payments,
      lines: before.purchaseOrders[0].lines,
      status: before.purchaseOrders[0].status,
    };
    const approved = approveSupplierResult(before, "approver", pending(before).id, reviewedAt);
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.state.stockMovements).toBe(snapshot.stockMovements);
    expect(approved.state.supplierInvoices).toBe(snapshot.supplierInvoices);
    expect(approved.state.customerInvoices).toBe(snapshot.customerInvoices);
    expect(approved.state.payments).toBe(snapshot.payments);
    expect(approved.state.purchaseOrders[0].lines).toBe(snapshot.lines);
    expect(approved.state.purchaseOrders[0].status).toBe(snapshot.status);
  });

  it.each(["stock_unavailable", "price_discrepancy"] as const)("turns an approved %s result into a dispute and human task", (scenario) => {
    const before = stateWithResult(scenario);
    const approved = approveSupplierResult(before, "approver", pending(before).id, reviewedAt);
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.state.disputes).toEqual([expect.objectContaining({ purchaseOrderId: "po-router-replenishment", status: "open" })]);
    expect(approved.state.followUps).toEqual([expect.objectContaining({ purchaseOrderId: "po-router-replenishment", approvalStatus: "pending", status: "open" })]);
    expect(approved.state.purchaseOrders[0]).toEqual(before.purchaseOrders[0]);
  });

  it("creates only a future policy-checked follow-up for failed contact", () => {
    const before = stateWithResult("failed_contact");
    const result = pending(before);
    const edited = editSupplierResult(before, "approver", result.id, { followUpDate: "2026-08-11" }, reviewedAt);
    if (!edited.ok) throw new Error(edited.error.message);
    const approved = approveSupplierResult(edited.state, "approver", result.id, "2026-08-09T04:05:00.000Z");
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.state.followUps).toEqual([expect.objectContaining({ dueAt: "2026-08-11T09:00:00.000Z", approvalStatus: "approved" })]);
    expect(approved.state.disputes).toEqual([]);
    expect(approved.state.purchaseOrders).toEqual(before.purchaseOrders);

    const blocked = stateWithResult("failed_contact");
    blocked.suppliers[0] = { ...blocked.suppliers[0], doNotContact: true };
    const rejected = approveSupplierResult(blocked, "approver", pending(blocked).id, reviewedAt);
    expect(rejected).toMatchObject({ ok: false, state: blocked, error: { code: "INVALID_STATE" } });
  });

  it("edits supported scenario fields but preserves immutable provider provenance", () => {
    const before = stateWithResult("delivery_commitment");
    const source = pending(before);
    const edited = editSupplierResult(before, "approver", source.id, {
      scenario: "price_discrepancy",
      promisedDeliveryDate: null,
      followUpDate: "2026-08-11",
      summary: "Supplier reported a price discrepancy that requires human review.",
      reason: "Quoted unit price differs from the approved purchase order.",
    }, reviewedAt);
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.value).toMatchObject({
      scenario: "price_discrepancy",
      sourceScenario: "delivery_commitment",
      sourceProvider: "mock",
      sourceProviderCallId: "supplier_mock_supplier-call-po-1",
    });
    expect(edited.state.auditLogs.at(-1)).toMatchObject({ action: "supplier_result.edited", detail: { fromScenario: "delivery_commitment", toScenario: "price_discrepancy" } });
  });

  it.each([
    ["unknown scenario", { scenario: "forged_scenario" }],
    ["unknown sentiment", { sentiment: "ecstatic" }],
    ["non-string summary", { summary: 42 }],
    ["invalid date type", { followUpDate: 123 }],
  ])("rejects a forged runtime edit with %s unchanged and without audit", (_label, forgedPatch) => {
    const before = stateWithResult("delivery_commitment");
    const auditCount = before.auditLogs.length;
    const result = editSupplierResult(before, "approver", pending(before).id, forgedPatch as never, reviewedAt);
    expect(result).toMatchObject({ ok: false, state: before, error: { code: "INVALID_INPUT" } });
    expect(result.state.auditLogs).toHaveLength(auditCount);
  });

  it("fails closed when result provenance does not match its completed call", () => {
    const before = stateWithResult();
    const result = pending(before);
    before.supplierResults = [{ ...result, sourceProviderCallId: "supplier_mock_tampered" }];
    const approved = approveSupplierResult(before, "approver", result.id, reviewedAt);
    expect(approved).toMatchObject({ ok: false, state: before, error: { code: "INVALID_STATE" } });
  });

  it.each([
    ["approve", (state: ErpState, role: ErpRole, id: string) => approveSupplierResult(state, role, id, reviewedAt)],
    ["edit", (state: ErpState, role: ErpRole, id: string) => editSupplierResult(state, role, id, { summary: "Edited summary" }, reviewedAt)],
    ["reject", (state: ErpState, role: ErpRole, id: string) => rejectSupplierResult(state, role, id, reviewedAt)],
    ["human review", (state: ErpState, role: ErpRole, id: string) => markSupplierResultForHumanReview(state, role, id, reviewedAt)],
  ])("enforces result-review permission for %s", (_label, command) => {
    const before = stateWithResult();
    expect(command(before, "procurement", pending(before).id)).toMatchObject({ ok: false, state: before, error: { code: "FORBIDDEN" } });
  });

  it("records reject and human-review decisions without downstream application", () => {
    const rejectedBefore = stateWithResult();
    const rejected = rejectSupplierResult(rejectedBefore, "approver", pending(rejectedBefore).id, reviewedAt);
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.value.status).toBe("rejected");
    expect(rejected.state.followUps).toEqual([]);
    expect(rejected.state.disputes).toEqual([]);
    expect(rejected.state.auditLogs.at(-1)?.action).toBe("supplier_result.rejected");

    const reviewBefore = stateWithResult();
    const reviewed = markSupplierResultForHumanReview(reviewBefore, "approver", pending(reviewBefore).id, reviewedAt);
    expect(reviewed.ok).toBe(true);
    if (!reviewed.ok) return;
    expect(reviewed.value.status).toBe("human_review");
    expect(reviewed.state.followUps).toEqual([]);
    expect(reviewed.state.disputes).toEqual([]);
    expect(reviewed.state.auditLogs.at(-1)?.action).toBe("supplier_result.human_review");
  });
});
