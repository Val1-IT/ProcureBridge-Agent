import { describe, expect, it } from "vitest";
import { createErpSeedState } from "../lib/erp/seed";
import type { ErpCommandResult } from "../lib/erp/errors";
import type { ErpState } from "../lib/erp/types";
import { nextDocumentNumber } from "../lib/erp/document-numbers";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  confirmPurchaseOrder,
  createPurchaseOrder,
  createPurchaseRequest,
  createRequestForQuotation,
  createSupplierQuotation,
  compareSupplierQuotations,
  selectSupplierQuotation,
  approveSupplierFollowUp,
  sendPurchaseOrder,
  submitPurchaseOrder,
  type PurchaseOrderInput,
} from "../lib/erp/commands/purchasing";
import { selectSupplierFollowUpQueue, selectSupplierQuotationComparison } from "../lib/erp/selectors";

const fixedNow = "2026-08-09T10:00:00.000Z";

const purchaseOrderInput: PurchaseOrderInput = {
  supplierId: "supplier-utama",
  lines: [{ productId: "product-scanner", quantity: 6, unitPrice: 550_000 }],
  confirmationDueAt: "2026-08-11T00:00:00.000Z",
};

function withApprovedPaperRequest(state: ErpState, quantity: number): ErpState {
  return {
    ...state,
    purchaseRequests: [...state.purchaseRequests, {
      id: "purchase-request-paper",
      requestNumber: "PR-TEST-PAPER",
      requesterRole: "procurement",
      sourceSalesOrderId: null,
      status: "approved",
      lines: [{ productId: "product-paper", quantity, unitPrice: 11_000 }],
      createdAt: fixedNow,
      updatedAt: fixedNow,
    }],
  };
}


describe("ERP purchasing commands", () => {
  it("moves a PO through approval, sending, confirmation, and cancellation with one audit per command", () => {
    const seed = createErpSeedState();
    const draft = createPurchaseOrder(seed, "procurement", purchaseOrderInput, fixedNow);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    const submitted = submitPurchaseOrder(draft.state, "procurement", draft.value.id, fixedNow);
    expect(submitted.ok && submitted.value.status).toBe("pending_approval");
    if (!submitted.ok) return;

    const approved = approvePurchaseOrder(submitted.state, "approver", submitted.value.id, fixedNow);
    expect(approved.ok && approved.value.status).toBe("sent");
    if (!approved.ok) return;

    const sent = sendPurchaseOrder(approved.state, "procurement", approved.value.id, fixedNow);
    expect(sent.ok && sent.value.status).toBe("sent");
    if (!sent.ok) return;

    const confirmed = confirmPurchaseOrder(sent.state, "procurement", sent.value.id, fixedNow);
    expect(confirmed.ok && confirmed.value.status).toBe("confirmed");
    if (!confirmed.ok) return;

    const cancelled = cancelPurchaseOrder(confirmed.state, "procurement", confirmed.value.id, fixedNow);
    expect(cancelled.ok && cancelled.value.status).toBe("cancelled");
    expect(cancelled.ok && cancelled.state.auditLogs.map((event) => event.action)).toEqual([
      "purchase_order.created",
      "purchase_order.submitted",
      "purchase_order.approved",
      "purchase_order.sent",
      "purchase_order.confirmed",
      "purchase_order.cancelled",
    ]);
    expect(cancelled.ok && cancelled.state.revision).toBe(6);
  });

  it("rejects missing masters, duplicate product lines, non-positive values, and inactive warehouses without mutation", () => {
    const seed = createErpSeedState();
    const inactiveWarehouse = {
      ...seed,
      warehouses: seed.warehouses.map((warehouse) => ({ ...warehouse, active: false })),
    };
    const invalidInputs: PurchaseOrderInput[] = [
      { ...purchaseOrderInput, supplierId: "missing-supplier" },
      { ...purchaseOrderInput, lines: [{ productId: "product-scanner", quantity: 1, unitPrice: 550_000 }, { productId: "product-scanner", quantity: 2, unitPrice: 550_000 }] },
      { ...purchaseOrderInput, lines: [{ productId: "product-scanner", quantity: 0, unitPrice: 550_000 }] },
      { ...purchaseOrderInput, lines: [{ productId: "product-scanner", quantity: 1, unitPrice: 0 }] },
    ];

    for (const input of invalidInputs) {
      const result = createPurchaseOrder(seed, "procurement", input, fixedNow);
      expect(result.ok).toBe(false);
      expect(result.state).toBe(seed);
    }

    const noWarehouse = createPurchaseOrder(inactiveWarehouse, "procurement", purchaseOrderInput, fixedNow);
    expect(noWarehouse.ok).toBe(false);
    expect(noWarehouse.state).toBe(inactiveWarehouse);
  });

  it("enforces purchase permissions and rejects a transition outside the lifecycle", () => {
    const seed = createErpSeedState();
    const forbidden = createPurchaseOrder(seed, "warehouse", purchaseOrderInput, fixedNow);
    expect(forbidden).toMatchObject({ ok: false, state: seed, error: { code: "FORBIDDEN" } });

    const invalidTransition = submitPurchaseOrder(seed, "procurement", "po-router-replenishment", fixedNow);
    expect(invalidTransition).toMatchObject({ ok: false, state: seed, error: { code: "INVALID_STATE" } });
  });

  it("numbers PR and PO documents from the highest matching number rather than collection length", () => {
    expect(nextDocumentNumber("PO", "2026-08-09T10:00:00.000Z", ["PO-2026-0001", "PO-2026-0041", "PO-2025-9999", "PR-2026-0100"])).toBe("PO-2026-0042");
    expect(nextDocumentNumber("PR", "2026-08-09T10:00:00.000Z", [])).toBe("PR-2026-0001");
  });

  it("creates purchase requests with validated unique lines and a deterministic number", () => {
    const seed = createErpSeedState();
    const request = createPurchaseRequest(seed, "procurement", {
      lines: [{ productId: "product-paper", quantity: 100, unitPrice: 11_000 }],
    }, fixedNow);

    expect(request.ok && request.value).toMatchObject({ requestNumber: "PR-2026-0001", requesterRole: "procurement", status: "draft" });
    expect(request.ok && request.state.auditLogs).toMatchObject([{ action: "purchase_request.created", entityId: request.ok ? request.value.id : "" }]);
  });

  it("returns deterministic follow-up reasons for confirmation, delivery, partial receipt, and due approved work", () => {
    const seed = createErpSeedState();
    const state = {
      ...seed,
      purchaseOrders: [
        ...seed.purchaseOrders,
        { ...seed.purchaseOrders[0], id: "po-promised", orderNumber: "PO-2026-0002", status: "confirmed" as const, confirmationDueAt: null, promisedDeliveryDate: "2026-08-08T00:00:00.000Z" },
        { ...seed.purchaseOrders[0], id: "po-partial", orderNumber: "PO-2026-0003", status: "partially_received" as const, confirmationDueAt: null, promisedDeliveryDate: "2026-08-12T00:00:00.000Z", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_050_000 }] },
      ],
      goodsReceipts: [{ id: "receipt-partial", receiptNumber: "GR-2026-0001", purchaseOrderId: "po-partial", warehouseId: "warehouse-jakarta", status: "posted" as const, lines: [{ productId: "product-router", quantity: 12, unitPrice: 1_050_000 }], createdAt: fixedNow, updatedAt: fixedNow }],
      followUps: [{ id: "follow-up-1", supplierId: "supplier-utama", customerId: null, purchaseOrderId: "po-promised", salesOrderId: null, dueAt: "2026-08-09T09:00:00.000Z", status: "open" as const, approvalStatus: "approved" as const, approvedBy: "role:approver", reason: "approved supplier contact", createdAt: fixedNow, updatedAt: fixedNow }],
    };

    expect(selectSupplierFollowUpQueue(state, fixedNow).map((item) => ({ orderNumber: item.purchaseOrder.orderNumber, reasons: item.reasons }))).toEqual([
      { orderNumber: "PO-2026-0001", reasons: ["confirmation_overdue"] },
      { orderNumber: "PO-2026-0002", reasons: ["delivery_overdue", "approved_follow_up_due"] },
      { orderNumber: "PO-2026-0003", reasons: ["partial_receipt_outstanding"] },
    ]);
  });

  it("compares competing supplier quotations deterministically and records an approved selection", () => {
    const seed = withApprovedPaperRequest(createErpSeedState(), 100);
    const rfq = createRequestForQuotation(seed, "procurement", { purchaseRequestId: "purchase-request-paper",
      supplierIds: ["supplier-utama", "supplier-kertas"],
      lines: [{ productId: "product-paper", quantity: 100 }],
    }, fixedNow);
    expect(rfq.ok).toBe(true);
    if (!rfq.ok) return;
    const firstQuote = createSupplierQuotation(rfq.state, "procurement", {
      requestForQuotationId: rfq.value.id,
      supplierId: "supplier-utama",
      lines: [{ productId: "product-paper", quantity: 100, unitPrice: 11_000 }],
      validUntil: "2026-08-20",
    }, fixedNow);
    expect(firstQuote.ok).toBe(true);
    if (!firstQuote.ok) return;
    const lowerQuote = createSupplierQuotation(firstQuote.state, "procurement", {
      requestForQuotationId: rfq.value.id,
      supplierId: "supplier-kertas",
      lines: [{ productId: "product-paper", quantity: 100, unitPrice: 10_500 }],
      validUntil: "2026-08-19",
    }, fixedNow);
    expect(lowerQuote.ok).toBe(true);
    if (!lowerQuote.ok) return;

    const compared = compareSupplierQuotations(lowerQuote.state, "procurement", rfq.value.id, fixedNow);
    expect(compared.ok && compared.value.map((item) => ({ supplierCode: item.supplier.code, totalAmount: item.totalAmount }))).toEqual([
      { supplierCode: "SUP-KERTAS", totalAmount: 1_050_000 },
      { supplierCode: "SUP-UTAMA", totalAmount: 1_100_000 },
    ]);
    if (!compared.ok) return;
    expect(selectSupplierQuotationComparison(compared.state, rfq.value.id).map((item) => item.rank)).toEqual([1, 2]);

    const selected = selectSupplierQuotation(compared.state, "approver", lowerQuote.value.id, fixedNow);
    expect(selected.ok && selected.state.requestForQuotations[0]).toMatchObject({ status: "selected", selectedQuotationId: lowerQuote.value.id });
    expect(selected.ok && selected.state.supplierQuotations.map((item) => item.status)).toEqual(["rejected", "selected"]);
    expect(selected.ok && selected.state.auditLogs.map((event) => event.action)).toEqual([
      "request_for_quotation.created",
      "supplier_quotation.created",
      "supplier_quotation.created",
      "request_for_quotation.compared",
      "supplier_quotation.selected",
    ]);
  });

  it("adds due approved follow-up work only after an approver explicitly approves it", () => {
    const seed = createErpSeedState();
    const withPendingFollowUp = {
      ...seed,
      followUps: [{ id: "follow-up-pending", supplierId: "supplier-utama", customerId: null, purchaseOrderId: "po-router-replenishment", salesOrderId: null, dueAt: "2026-08-09T09:00:00.000Z", status: "open" as const, approvalStatus: "pending" as const, approvedBy: null, reason: "contact supplier", createdAt: fixedNow, updatedAt: fixedNow }],
    };

    expect(selectSupplierFollowUpQueue(withPendingFollowUp, fixedNow)[0].reasons).toEqual(["confirmation_overdue"]);
    const approved = approveSupplierFollowUp(withPendingFollowUp, "approver", "follow-up-pending", fixedNow);
    expect(approved.ok && approved.value).toMatchObject({ approvalStatus: "approved", approvedBy: "role:approver" });
    expect(approved.ok && selectSupplierFollowUpQueue(approved.state, fixedNow)[0].reasons).toEqual(["confirmation_overdue", "approved_follow_up_due"]);
    expect(approved.ok && approved.state.auditLogs).toMatchObject([{ action: "supplier_follow_up.approved", entityId: "follow-up-pending" }]);
  });

  it("rejects invalid command timestamps without mutation instead of throwing", () => {
    const seed = createErpSeedState();

    expect(() => createPurchaseRequest(seed, "procurement", { lines: [{ productId: "product-paper", quantity: 1, unitPrice: 11_000 }] }, "not-a-date")).not.toThrow();
    expect(createPurchaseRequest(seed, "procurement", { lines: [{ productId: "product-paper", quantity: 1, unitPrice: 11_000 }] }, "not-a-date")).toMatchObject({ ok: false, state: seed, error: { code: "INVALID_INPUT" } });
    expect(createPurchaseOrder(seed, "procurement", purchaseOrderInput, "not-a-date")).toMatchObject({ ok: false, state: seed, error: { code: "INVALID_INPUT" } });
    expect(createRequestForQuotation(seed, "procurement", { purchaseRequestId: "missing-request", supplierIds: ["supplier-utama"], lines: [{ productId: "product-paper", quantity: 1 }] }, "not-a-date")).toMatchObject({ ok: false, state: seed, error: { code: "INVALID_INPUT" } });
  });

  it("rejects an invalid timestamp without mutation or audit from every timestamped purchasing command", () => {
    const seed = withApprovedPaperRequest(createErpSeedState(), 1);
    const draft = createPurchaseOrder(seed, "procurement", purchaseOrderInput, fixedNow);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const submitted = submitPurchaseOrder(draft.state, "procurement", draft.value.id, fixedNow);
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    const rfq = createRequestForQuotation(seed, "procurement", { purchaseRequestId: "purchase-request-paper", supplierIds: ["supplier-utama", "supplier-kertas"], lines: [{ productId: "product-paper", quantity: 1 }] }, fixedNow);
    expect(rfq.ok).toBe(true);
    if (!rfq.ok) return;
    const firstQuote = createSupplierQuotation(rfq.state, "procurement", { requestForQuotationId: rfq.value.id, supplierId: "supplier-utama", validUntil: "2026-08-20", lines: [{ productId: "product-paper", quantity: 1, unitPrice: 11_000 }] }, fixedNow);
    expect(firstQuote.ok).toBe(true);
    if (!firstQuote.ok) return;
    const secondQuote = createSupplierQuotation(firstQuote.state, "procurement", { requestForQuotationId: rfq.value.id, supplierId: "supplier-kertas", validUntil: "2026-08-20", lines: [{ productId: "product-paper", quantity: 1, unitPrice: 10_000 }] }, fixedNow);
    expect(secondQuote.ok).toBe(true);
    if (!secondQuote.ok) return;
    const compared = compareSupplierQuotations(secondQuote.state, "procurement", rfq.value.id, fixedNow);
    expect(compared.ok).toBe(true);
    if (!compared.ok) return;
    const followUpState = { ...seed, followUps: [{ id: "follow-up-time", supplierId: "supplier-utama", customerId: null, purchaseOrderId: "po-router-replenishment", salesOrderId: null, dueAt: fixedNow, status: "open" as const, approvalStatus: "pending" as const, approvedBy: null, reason: "contact supplier", createdAt: fixedNow, updatedAt: fixedNow }] };

    const results: Array<{ result: ErpCommandResult<unknown>; before: ErpState }> = [
      { result: createSupplierQuotation(rfq.state, "procurement", { requestForQuotationId: rfq.value.id, supplierId: "supplier-utama", validUntil: "2026-08-20", lines: [{ productId: "product-paper", quantity: 1, unitPrice: 11_000 }] }, "not-a-date"), before: rfq.state },
      { result: submitPurchaseOrder(draft.state, "procurement", draft.value.id, "not-a-date"), before: draft.state },
      { result: approvePurchaseOrder(submitted.state, "approver", submitted.value.id, "not-a-date"), before: submitted.state },
      { result: sendPurchaseOrder(seed, "procurement", "po-router-replenishment", "not-a-date"), before: seed },
      { result: confirmPurchaseOrder(seed, "procurement", "po-router-replenishment", "not-a-date"), before: seed },
      { result: cancelPurchaseOrder(seed, "procurement", "po-router-replenishment", "not-a-date"), before: seed },
      { result: compareSupplierQuotations(secondQuote.state, "procurement", rfq.value.id, "not-a-date"), before: secondQuote.state },
      { result: selectSupplierQuotation(compared.state, "approver", secondQuote.value.id, "not-a-date"), before: compared.state },
      { result: approveSupplierFollowUp(followUpState, "approver", "follow-up-time", "not-a-date"), before: followUpState },
    ];

    for (const { result, before } of results) {
      expect(result).toMatchObject({ ok: false, state: before, error: { code: "INVALID_INPUT" } });
      expect(result.state.auditLogs.length).toBe(before.auditLogs.length);
    }
  });

  it("accepts only complete selected-quotation provenance when creating a PO", () => {
    const seed = createErpSeedState();
    const request = createPurchaseRequest(seed, "procurement", { lines: [{ productId: "product-paper", quantity: 10, unitPrice: 10_000 }] }, fixedNow);
    expect(request.ok).toBe(true);
    if (!request.ok) return; request.state.purchaseRequests[0] = { ...request.state.purchaseRequests[0], status: "approved" };
    const rfq = createRequestForQuotation(request.state, "procurement", { purchaseRequestId: request.value.id, supplierIds: ["supplier-utama", "supplier-kertas"], lines: [{ productId: "product-paper", quantity: 10 }] }, fixedNow);
    expect(rfq.ok).toBe(true);
    if (!rfq.ok) return;
    const firstQuote = createSupplierQuotation(rfq.state, "procurement", { requestForQuotationId: rfq.value.id, supplierId: "supplier-utama", validUntil: "2026-08-20", lines: [{ productId: "product-paper", quantity: 10, unitPrice: 11_000 }] }, fixedNow);
    expect(firstQuote.ok).toBe(true);
    if (!firstQuote.ok) return;
    const selectedQuoteCandidate = createSupplierQuotation(firstQuote.state, "procurement", { requestForQuotationId: rfq.value.id, supplierId: "supplier-kertas", validUntil: "2026-08-20", lines: [{ productId: "product-paper", quantity: 10, unitPrice: 10_000 }] }, fixedNow);
    expect(selectedQuoteCandidate.ok).toBe(true);
    if (!selectedQuoteCandidate.ok) return;
    const compared = compareSupplierQuotations(selectedQuoteCandidate.state, "procurement", rfq.value.id, fixedNow);
    expect(compared.ok).toBe(true);
    if (!compared.ok) return;
    const selected = selectSupplierQuotation(compared.state, "approver", selectedQuoteCandidate.value.id, fixedNow);
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    const input: PurchaseOrderInput = { supplierId: "supplier-kertas", purchaseRequestId: request.value.id, warehouseId: "warehouse-jakarta", supplierQuotationId: selected.value.id, lines: [{ productId: "product-paper", quantity: 10, unitPrice: 10_000 }] };

    expect(createPurchaseOrder(selected.state, "procurement", input, fixedNow)).toMatchObject({ ok: true, value: { supplierQuotationId: selected.value.id, purchaseRequestId: request.value.id, warehouseId: "warehouse-jakarta" } });
    const wrongRequest = createPurchaseOrder(selected.state, "procurement", { ...input, purchaseRequestId: null }, fixedNow);
    const quoteOutsideRfq = { ...selected.state, supplierQuotations: selected.state.supplierQuotations.map((quotation) => quotation.id === selected.value.id ? { ...quotation, requestForQuotationId: "other-rfq" } : quotation) };
    const wrongRfq = createPurchaseOrder(quoteOutsideRfq, "procurement", input, fixedNow);
    const wrongWarehouseState = { ...selected.state, requestForQuotations: selected.state.requestForQuotations.map((item) => item.id === rfq.value.id ? { ...item, warehouseId: "warehouse-other" } : item) };
    const wrongWarehouse = createPurchaseOrder(wrongWarehouseState, "procurement", input, fixedNow);
    const wrongSupplier = createPurchaseOrder(selected.state, "procurement", { ...input, supplierId: "supplier-utama" }, fixedNow);
    const wrongLines = createPurchaseOrder(selected.state, "procurement", { ...input, lines: [{ productId: "product-paper", quantity: 9, unitPrice: 10_000 }] }, fixedNow);
    for (const result of [wrongRequest, wrongRfq, wrongWarehouse, wrongSupplier, wrongLines]) expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });
});
