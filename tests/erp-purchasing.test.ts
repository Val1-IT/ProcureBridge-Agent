import { describe, expect, it } from "vitest";
import { createErpSeedState } from "../lib/erp/seed";
import { nextDocumentNumber } from "../lib/erp/document-numbers";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  confirmPurchaseOrder,
  createPurchaseOrder,
  createPurchaseRequest,
  sendPurchaseOrder,
  submitPurchaseOrder,
  type PurchaseOrderInput,
} from "../lib/erp/commands/purchasing";
import { selectSupplierFollowUpQueue } from "../lib/erp/selectors";

const fixedNow = "2026-08-09T10:00:00.000Z";

const purchaseOrderInput: PurchaseOrderInput = {
  supplierId: "supplier-utama",
  lines: [{ productId: "product-scanner", quantity: 6, unitPrice: 550_000 }],
  confirmationDueAt: "2026-08-11T00:00:00.000Z",
};

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
      followUps: [{ id: "follow-up-1", supplierId: "supplier-utama", customerId: null, purchaseOrderId: "po-promised", salesOrderId: null, dueAt: "2026-08-09T09:00:00.000Z", status: "open" as const, reason: "approved supplier contact", createdAt: fixedNow, updatedAt: fixedNow }],
    };

    expect(selectSupplierFollowUpQueue(state, fixedNow).map((item) => ({ orderNumber: item.purchaseOrder.orderNumber, reasons: item.reasons }))).toEqual([
      { orderNumber: "PO-2026-0001", reasons: ["confirmation_overdue"] },
      { orderNumber: "PO-2026-0002", reasons: ["delivery_overdue", "approved_follow_up_due"] },
      { orderNumber: "PO-2026-0003", reasons: ["partial_receipt_outstanding"] },
    ]);
  });
});
