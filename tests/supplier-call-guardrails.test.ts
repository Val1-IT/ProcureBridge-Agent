import { describe, expect, it } from "vitest";
import { saveSupplierCallApproval } from "../lib/erp/commands/supplier-calls";
import { evaluateSupplierCallEligibility } from "../lib/erp/guardrails/supplier-call";
import { createErpSeedState } from "../lib/erp/seed";
import type { SupplierCallApproval } from "../lib/erp/types";

const state = createErpSeedState();
const supplier = state.suppliers[0];
const purchaseOrder = state.purchaseOrders[0];
const approval: SupplierCallApproval = {
  id: "supplier-approval-call-po-1",
  supplierCallId: "supplier-call-po-1",
  supplierId: supplier.id,
  purchaseOrderId: purchaseOrder.id,
  status: "approved",
  objective: "Confirm delivery date for the router order",
  permittedProductIds: ["product-router"],
  maximumDeliveryDate: "2026-08-20",
  partialDeliveryAllowed: true,
  maximumUnitPriceIncreasePercent: 0,
  language: "Bahasa Indonesia",
  approvedAt: "2026-08-09T01:00:00.000Z",
  approvedBy: "Nadia Pratama",
  createdAt: "2026-08-09T01:00:00.000Z",
  updatedAt: "2026-08-09T01:00:00.000Z",
};

const eligibleInput = { supplier, purchaseOrder, approval, localTime: "10:00", callsToday: 0, openDispute: false };

describe("supplier call guardrails", () => {
  it.each([
    ["APPROVAL_INCOMPLETE", { approval: null }],
    ["INVALID_PHONE", { supplier: { ...supplier, phone: "123" } }],
    ["DO_NOT_CONTACT", { supplier: { ...supplier, doNotContact: true } }],
    ["OUTSIDE_CALLING_HOURS", { localTime: "19:00" }],
    ["ALREADY_CALLED_TODAY", { callsToday: 1 }],
    ["PURCHASE_ORDER_CLOSED", { purchaseOrder: { ...purchaseOrder, status: "completed" as const } }],
    ["INVALID_ORDER_DATA", { purchaseOrder: { ...purchaseOrder, lines: [] } }],
    ["OPEN_DISPUTE", { openDispute: true }],
  ])("blocks %s", (code, patch) => {
    expect(evaluateSupplierCallEligibility({ ...eligibleInput, ...patch }).codes).toContain(code);
  });

  it("requires an approved, matching, complete approval for all PO products", () => {
    const decision = evaluateSupplierCallEligibility({
      ...eligibleInput,
      approval: { ...approval, permittedProductIds: ["product-scanner"], maximumDeliveryDate: "" },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.codes).toEqual(["APPROVAL_INCOMPLETE"]);
  });

  it("allows a valid approved supplier call", () => {
    expect(evaluateSupplierCallEligibility(eligibleInput)).toEqual({ allowed: true, codes: [], reasons: [] });
  });
});

describe("saveSupplierCallApproval", () => {
  const input = {
    supplierCallId: "supplier-call-po-1",
    supplierId: supplier.id,
    purchaseOrderId: purchaseOrder.id,
    scenario: "delivery_commitment" as const,
    objective: "Confirm delivery date for the router order",
    permittedProductIds: ["product-router"],
    maximumDeliveryDate: "2026-08-20",
    partialDeliveryAllowed: true,
    maximumUnitPriceIncreasePercent: 0,
    language: "Bahasa Indonesia",
    approvedAt: "2026-08-09T01:00:00.000Z",
    approvedBy: "Nadia Pratama",
  };

  it("persists an approved draft and audit evidence for an authorized approver", () => {
    const result = saveSupplierCallApproval(createErpSeedState(), "approver", input, "2026-08-09T01:00:00.000Z");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.revision).toBe(1);
    expect(result.state.supplierCalls).toEqual([expect.objectContaining({ id: "supplier-call-po-1", status: "draft", provider: null })]);
    expect(result.state.supplierApprovals).toEqual([expect.objectContaining({ supplierCallId: "supplier-call-po-1", status: "approved", approvedBy: "Nadia Pratama" })]);
    expect(result.state.auditLogs).toEqual([expect.objectContaining({ action: "supplier_call.approved", actorRole: "approver" })]);
  });

  it("rejects roles without call approval permission without changing state", () => {
    const before = createErpSeedState();
    const result = saveSupplierCallApproval(before, "procurement", input, "2026-08-09T01:00:00.000Z");
    expect(result).toEqual({ ok: false, state: before, error: { code: "FORBIDDEN", message: "You do not have permission to approve supplier calls." } });
  });

  it("rejects incomplete approval boundaries", () => {
    const result = saveSupplierCallApproval(createErpSeedState(), "approver", { ...input, permittedProductIds: [], objective: "" }, "2026-08-09T01:00:00.000Z");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });
});
