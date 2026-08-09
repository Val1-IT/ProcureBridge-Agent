import { describe, expect, it } from "vitest";
import { approveGoodsReceipt, createGoodsReceipt } from "../lib/erp/commands/inventory";
import { completeDelivery, createDeliveryOrder } from "../lib/erp/commands/sales";
import {
  createCustomerInvoice,
  recordPayment,
  recordSupplierInvoice,
} from "../lib/erp/commands/finance";
import { createErpSeedState } from "../lib/erp/seed";
import {
  selectPayableBalance,
  selectReceivableBalance,
} from "../lib/erp/selectors-finance";
import { selectPhysicalStock } from "../lib/erp/selectors";
import type { ErpState } from "../lib/erp/types";

const fixedNow = "2026-08-09T10:00:00.000Z";
const later = "2026-08-09T11:00:00.000Z";

function withApprovedReceipt(quantity = 10): { state: ErpState; receiptId: string } {
  const state = createErpSeedState();
  state.purchaseOrders[0] = { ...state.purchaseOrders[0], status: "confirmed" };
  const draft = createGoodsReceipt(state, "warehouse", {
    purchaseOrderId: state.purchaseOrders[0].id,
    lines: [{ productId: "product-router", quantity }],
  }, fixedNow);
  if (!draft.ok) throw new Error(draft.error.message);
  const approved = approveGoodsReceipt(draft.state, "warehouse", draft.value.id, later);
  if (!approved.ok) throw new Error(approved.error.message);
  return { state: approved.state, receiptId: approved.value.id };
}

function withPostedDelivery(quantity = 8, orderQuantity = 20): { state: ErpState; deliveryId: string } {
  const state = createErpSeedState();
  state.salesOrders[0] = {
    ...state.salesOrders[0],
    status: "confirmed",
    lines: [{ ...state.salesOrders[0].lines[0], quantity: orderQuantity, deliveredQuantity: 0 }],
  };
  const draft = createDeliveryOrder(state, "warehouse", {
    salesOrderId: state.salesOrders[0].id,
    lines: [{ productId: "product-router", quantity }],
  }, fixedNow);
  if (!draft.ok) throw new Error(draft.error.message);
  const posted = completeDelivery(draft.state, "warehouse", draft.value.id, later);
  if (!posted.ok) throw new Error(posted.error.message);
  return { state: posted.state, deliveryId: posted.value.id };
}

describe("finance invoice eligibility", () => {
  it("creates a payable from exact approved receipt evidence without changing inventory", () => {
    const fixture = withApprovedReceipt();
    const beforeMovements = structuredClone(fixture.state.stockMovements);
    const beforeStock = selectPhysicalStock(fixture.state, "product-router");

    const result = recordSupplierInvoice(fixture.state, "finance", {
      purchaseOrderId: fixture.state.purchaseOrders[0].id,
      sourceDocumentIds: [fixture.receiptId],
      dueDate: "2026-09-08",
    }, "2026-08-10T10:00:00.000Z");

    expect(result).toMatchObject({
      ok: true,
      value: {
        invoiceNumber: "SINV-2026-0001",
        supplierId: "supplier-utama",
        customerId: null,
        totalAmount: 10_500_000,
        status: "unpaid",
        sourceDocumentIds: [fixture.receiptId],
        lines: [{ productId: "product-router", quantity: 10, unitPrice: 1_050_000 }],
      },
    });
    expect(selectPhysicalStock(result.state, "product-router")).toBe(beforeStock);
    expect(result.state.stockMovements).toEqual(beforeMovements);
    expect(result.state.auditLogs.at(-1)).toMatchObject({ action: "supplier_invoice.recorded", actorRole: "finance" });
  });

  it("creates a receivable from exact posted delivery evidence without changing inventory", () => {
    const fixture = withPostedDelivery();
    const beforeMovements = structuredClone(fixture.state.stockMovements);
    const beforeStock = selectPhysicalStock(fixture.state, "product-router");

    const result = createCustomerInvoice(fixture.state, "admin", {
      salesOrderId: fixture.state.salesOrders[0].id,
      sourceDocumentIds: [fixture.deliveryId],
      dueDate: "2026-09-08",
    }, "2026-08-10T10:00:00.000Z");

    expect(result).toMatchObject({
      ok: true,
      value: {
        invoiceNumber: "CINV-2026-0001",
        supplierId: null,
        customerId: "erp-customer-sinar",
        totalAmount: 12_000_000,
        status: "unpaid",
        sourceDocumentIds: [fixture.deliveryId],
        lines: [{ productId: "product-router", quantity: 8, unitPrice: 1_500_000 }],
      },
    });
    expect(selectPhysicalStock(result.state, "product-router")).toBe(beforeStock);
    expect(result.state.stockMovements).toEqual(beforeMovements);
  });

  it("prevents source quantities from being invoiced twice", () => {
    const payable = withApprovedReceipt();
    const firstPayable = recordSupplierInvoice(payable.state, "finance", {
      purchaseOrderId: payable.state.purchaseOrders[0].id,
      sourceDocumentIds: [payable.receiptId],
      dueDate: "2026-09-08",
    }, "2026-08-10T10:00:00.000Z");
    if (!firstPayable.ok) throw new Error(firstPayable.error.message);

    const duplicatePayable = recordSupplierInvoice(firstPayable.state, "finance", {
      purchaseOrderId: payable.state.purchaseOrders[0].id,
      sourceDocumentIds: [payable.receiptId],
      dueDate: "2026-09-09",
    }, "2026-08-11T10:00:00.000Z");

    const receivable = withPostedDelivery();
    const firstReceivable = createCustomerInvoice(receivable.state, "finance", {
      salesOrderId: receivable.state.salesOrders[0].id,
      sourceDocumentIds: [receivable.deliveryId],
      dueDate: "2026-09-08",
    }, "2026-08-10T10:00:00.000Z");
    if (!firstReceivable.ok) throw new Error(firstReceivable.error.message);
    const duplicateReceivable = createCustomerInvoice(firstReceivable.state, "finance", {
      salesOrderId: receivable.state.salesOrders[0].id,
      sourceDocumentIds: [receivable.deliveryId],
      dueDate: "2026-09-09",
    }, "2026-08-11T10:00:00.000Z");

    expect(duplicatePayable).toMatchObject({ ok: false, state: firstPayable.state, error: { code: "INVALID_STATE" } });
    expect(duplicateReceivable).toMatchObject({ ok: false, state: firstReceivable.state, error: { code: "INVALID_STATE" } });
  });

  it("rejects draft, cancelled, unrelated, duplicate, and unauthorized invoice sources atomically", () => {
    const supplierFixture = withApprovedReceipt();
    const draftReceiptState = structuredClone(supplierFixture.state);
    draftReceiptState.goodsReceipts[0].status = "draft";
    const duplicateSource = [supplierFixture.receiptId, supplierFixture.receiptId];
    const customerFixture = withPostedDelivery();
    const cancelledDeliveryState = structuredClone(customerFixture.state);
    cancelledDeliveryState.deliveryOrders[0].status = "cancelled";

    expect(recordSupplierInvoice(draftReceiptState, "finance", { purchaseOrderId: draftReceiptState.purchaseOrders[0].id, sourceDocumentIds: [supplierFixture.receiptId], dueDate: "2026-09-08" }, later)).toMatchObject({ ok: false, state: draftReceiptState });
    expect(recordSupplierInvoice(supplierFixture.state, "sales", { purchaseOrderId: supplierFixture.state.purchaseOrders[0].id, sourceDocumentIds: [supplierFixture.receiptId], dueDate: "2026-09-08" }, later)).toMatchObject({ ok: false, state: supplierFixture.state, error: { code: "FORBIDDEN" } });
    expect(recordSupplierInvoice(supplierFixture.state, "finance", { purchaseOrderId: "missing", sourceDocumentIds: [supplierFixture.receiptId], dueDate: "2026-09-08" }, later)).toMatchObject({ ok: false, state: supplierFixture.state, error: { code: "NOT_FOUND" } });
    expect(recordSupplierInvoice(supplierFixture.state, "finance", { purchaseOrderId: supplierFixture.state.purchaseOrders[0].id, sourceDocumentIds: duplicateSource, dueDate: "2026-09-08" }, later)).toMatchObject({ ok: false, state: supplierFixture.state, error: { code: "INVALID_INPUT" } });
    expect(createCustomerInvoice(cancelledDeliveryState, "finance", { salesOrderId: cancelledDeliveryState.salesOrders[0].id, sourceDocumentIds: [customerFixture.deliveryId], dueDate: "2026-09-08" }, later)).toMatchObject({ ok: false, state: cancelledDeliveryState });
    expect(createCustomerInvoice(customerFixture.state, "warehouse", { salesOrderId: customerFixture.state.salesOrders[0].id, sourceDocumentIds: [customerFixture.deliveryId], dueDate: "2026-09-08" }, later)).toMatchObject({ ok: false, state: customerFixture.state, error: { code: "FORBIDDEN" } });
  });

  it("rejects impossible due dates and source documents whose operational evidence was tampered", () => {
    const supplierFixture = withApprovedReceipt();
    const wrongReceiptMovement = structuredClone(supplierFixture.state);
    wrongReceiptMovement.stockMovements.at(-1)!.quantity += 1;
    const customerFixture = withPostedDelivery();
    const wrongDeliveryPrice = structuredClone(customerFixture.state);
    wrongDeliveryPrice.deliveryOrders[0].lines[0].unitPrice += 1;

    expect(recordSupplierInvoice(supplierFixture.state, "finance", { purchaseOrderId: supplierFixture.state.purchaseOrders[0].id, sourceDocumentIds: [supplierFixture.receiptId], dueDate: "2026-02-31" }, "2026-02-01T10:00:00.000Z")).toMatchObject({ ok: false, state: supplierFixture.state, error: { code: "INVALID_INPUT" } });
    expect(recordSupplierInvoice(wrongReceiptMovement, "finance", { purchaseOrderId: wrongReceiptMovement.purchaseOrders[0].id, sourceDocumentIds: [supplierFixture.receiptId], dueDate: "2026-09-08" }, later)).toMatchObject({ ok: false, state: wrongReceiptMovement, error: { code: "INVALID_STATE" } });
    expect(createCustomerInvoice(wrongDeliveryPrice, "finance", { salesOrderId: wrongDeliveryPrice.salesOrders[0].id, sourceDocumentIds: [customerFixture.deliveryId], dueDate: "2026-09-08" }, later)).toMatchObject({ ok: false, state: wrongDeliveryPrice, error: { code: "INVALID_STATE" } });
  });

  it("rejects a movement-matched over-quantity approved receipt without mutation", () => {
    const fixture = withApprovedReceipt();
    const state = structuredClone(fixture.state);
    state.goodsReceipts[0].lines[0].quantity = 41;
    state.stockMovements.find((movement) => movement.sourceId === fixture.receiptId)!.quantity = 41;
    state.purchaseOrders[0].status = "fully_received";
    const auditCount = state.auditLogs.length;

    const result = recordSupplierInvoice(state, "finance", { purchaseOrderId: state.purchaseOrders[0].id, sourceDocumentIds: [fixture.receiptId], dueDate: "2026-09-08" }, "2026-08-10T10:00:00.000Z");

    expect(result).toMatchObject({ ok: false, state, error: { code: "INVALID_STATE" } });
    expect(result.state).toBe(state);
    expect(result.state.supplierInvoices).toHaveLength(0);
    expect(result.state.auditLogs).toHaveLength(auditCount);
  });

  it("rejects aggregate approved receipt overflow and inconsistent purchase-order receipt status", () => {
    const fixture = withApprovedReceipt();
    const overflow = structuredClone(fixture.state);
    overflow.goodsReceipts.push({ ...overflow.goodsReceipts[0], id: "overflow-receipt", receiptNumber: "GR-2026-0002", lines: [{ ...overflow.goodsReceipts[0].lines[0], quantity: 31 }] });
    overflow.stockMovements.push({ ...overflow.stockMovements.find((movement) => movement.sourceId === fixture.receiptId)!, id: "overflow-receipt-movement", sourceId: "overflow-receipt", quantity: 31 });
    overflow.purchaseOrders[0].status = "fully_received";
    const inconsistent = structuredClone(fixture.state);
    inconsistent.purchaseOrders[0].status = "fully_received";

    expect(recordSupplierInvoice(overflow, "finance", { purchaseOrderId: overflow.purchaseOrders[0].id, sourceDocumentIds: [fixture.receiptId], dueDate: "2026-09-08" }, "2026-08-10T10:00:00.000Z")).toMatchObject({ ok: false, state: overflow, error: { code: "INVALID_STATE" } });
    expect(recordSupplierInvoice(inconsistent, "finance", { purchaseOrderId: inconsistent.purchaseOrders[0].id, sourceDocumentIds: [fixture.receiptId], dueDate: "2026-09-08" }, "2026-08-10T10:00:00.000Z")).toMatchObject({ ok: false, state: inconsistent, error: { code: "INVALID_STATE" } });
  });

  it("rejects a movement-matched over-quantity posted delivery without mutation", () => {
    const fixture = withPostedDelivery();
    const state = structuredClone(fixture.state);
    state.deliveryOrders[0].lines[0].quantity = 21;
    state.stockMovements.find((movement) => movement.sourceId === fixture.deliveryId)!.quantity = 21;
    state.salesOrders[0].lines[0].deliveredQuantity = 21;
    state.salesOrders[0].status = "fully_delivered";
    const auditCount = state.auditLogs.length;

    const result = createCustomerInvoice(state, "finance", { salesOrderId: state.salesOrders[0].id, sourceDocumentIds: [fixture.deliveryId], dueDate: "2026-09-08" }, "2026-08-10T10:00:00.000Z");

    expect(result).toMatchObject({ ok: false, state, error: { code: "INVALID_STATE" } });
    expect(result.state).toBe(state);
    expect(result.state.customerInvoices).toHaveLength(0);
    expect(result.state.auditLogs).toHaveLength(auditCount);
  });

  it("rejects aggregate posted delivery overflow and inconsistent Sales Order delivery status", () => {
    const fixture = withPostedDelivery();
    const overflow = structuredClone(fixture.state);
    overflow.deliveryOrders.push({ ...overflow.deliveryOrders[0], id: "overflow-delivery", deliveryNumber: "DO-2026-0002", lines: [{ ...overflow.deliveryOrders[0].lines[0], quantity: 13 }] });
    overflow.stockMovements.push({ ...overflow.stockMovements.find((movement) => movement.sourceId === fixture.deliveryId)!, id: "overflow-delivery-movement", sourceId: "overflow-delivery", quantity: 13, reason: "Completed DO-2026-0002" });
    overflow.salesOrders[0].lines[0].deliveredQuantity = 21;
    overflow.salesOrders[0].status = "fully_delivered";
    const inconsistent = structuredClone(fixture.state);
    inconsistent.salesOrders[0].status = "fully_delivered";

    expect(createCustomerInvoice(overflow, "finance", { salesOrderId: overflow.salesOrders[0].id, sourceDocumentIds: [fixture.deliveryId], dueDate: "2026-09-08" }, "2026-08-10T10:00:00.000Z")).toMatchObject({ ok: false, state: overflow, error: { code: "INVALID_STATE" } });
    expect(createCustomerInvoice(inconsistent, "finance", { salesOrderId: inconsistent.salesOrders[0].id, sourceDocumentIds: [fixture.deliveryId], dueDate: "2026-09-08" }, "2026-08-10T10:00:00.000Z")).toMatchObject({ ok: false, state: inconsistent, error: { code: "INVALID_STATE" } });
  });

  it("rejects normalized impossible command instants for invoices and payments", () => {
    const supplierFixture = withApprovedReceipt();
    const impossibleInvoiceTime = recordSupplierInvoice(supplierFixture.state, "finance", { purchaseOrderId: supplierFixture.state.purchaseOrders[0].id, sourceDocumentIds: [supplierFixture.receiptId], dueDate: "2026-09-08" }, "2026-02-31T10:00:00.000Z");
    const invoice = recordSupplierInvoice(supplierFixture.state, "finance", { purchaseOrderId: supplierFixture.state.purchaseOrders[0].id, sourceDocumentIds: [supplierFixture.receiptId], dueDate: "2026-09-08" }, "2026-08-10T10:00:00.000Z");
    if (!invoice.ok) throw new Error(invoice.error.message);

    const impossiblePaymentTime = recordPayment(invoice.state, "finance", { invoiceId: invoice.value.id, amount: 1, direction: "payable" }, "2026-02-31T10:00:00.000Z");

    expect(impossibleInvoiceTime).toMatchObject({ ok: false, state: supplierFixture.state, error: { code: "INVALID_INPUT" } });
    expect(impossiblePaymentTime).toMatchObject({ ok: false, state: invoice.state, error: { code: "INVALID_INPUT" } });
  });

  it("completes fully covered source lifecycles without fabricating stock movements", () => {
    const payable = withApprovedReceipt(40);
    const payableMovementCount = payable.state.stockMovements.length;
    const supplierInvoice = recordSupplierInvoice(payable.state, "finance", { purchaseOrderId: payable.state.purchaseOrders[0].id, sourceDocumentIds: [payable.receiptId], dueDate: "2026-09-08" }, "2026-08-10T10:00:00.000Z");
    expect(supplierInvoice).toMatchObject({ ok: true, state: { purchaseOrders: [{ status: "completed" }] } });
    expect(supplierInvoice.state.stockMovements).toHaveLength(payableMovementCount);

    const receivable = withPostedDelivery(20, 20);
    const receivableMovementCount = receivable.state.stockMovements.length;
    const customerInvoice = createCustomerInvoice(receivable.state, "finance", { salesOrderId: receivable.state.salesOrders[0].id, sourceDocumentIds: [receivable.deliveryId], dueDate: "2026-09-08" }, "2026-08-10T10:00:00.000Z");
    expect(customerInvoice).toMatchObject({ ok: true, state: { salesOrders: [{ status: "invoiced" }] } });
    expect(customerInvoice.state.stockMovements).toHaveLength(receivableMovementCount);
  });
});

describe("finance payments and balances", () => {
  function payableState() {
    const fixture = withApprovedReceipt();
    const result = recordSupplierInvoice(fixture.state, "finance", { purchaseOrderId: fixture.state.purchaseOrders[0].id, sourceDocumentIds: [fixture.receiptId], dueDate: "2026-09-08" }, "2026-08-10T10:00:00.000Z");
    if (!result.ok) throw new Error(result.error.message);
    return result;
  }

  it("records partial payment, derives the counterparty, and prevents overpayment", () => {
    const invoice = payableState();
    const partial = recordPayment(invoice.state, "finance", { invoiceId: invoice.value.id, amount: 5_000_000, direction: "payable" }, "2026-08-11T10:00:00.000Z");

    expect(partial).toMatchObject({
      ok: true,
      value: { direction: "payable", supplierId: "supplier-utama", customerId: null, amount: 5_000_000, status: "posted" },
      state: { supplierInvoices: [{ status: "partially_paid" }] },
    });
    expect(partial.ok && selectPayableBalance(partial.state, invoice.value.id)).toBe(5_500_000);
    if (!partial.ok) return;
    const excessive = recordPayment(partial.state, "finance", { invoiceId: invoice.value.id, amount: 5_500_001, direction: "payable" }, "2026-08-12T10:00:00.000Z");
    expect(excessive).toMatchObject({ ok: false, state: partial.state, error: { code: "INVALID_INPUT" } });
  });

  it("marks an invoice paid at zero balance and counts only posted non-voided payments", () => {
    const invoice = payableState();
    const partial = recordPayment(invoice.state, "finance", { invoiceId: invoice.value.id, amount: 5_000_000, direction: "payable" }, "2026-08-11T10:00:00.000Z");
    if (!partial.ok) throw new Error(partial.error.message);
    const paid = recordPayment(partial.state, "admin", { invoiceId: invoice.value.id, amount: 5_500_000, direction: "payable" }, "2026-08-12T10:00:00.000Z");

    expect(paid).toMatchObject({ ok: true, state: { supplierInvoices: [{ status: "paid" }] } });
    expect(paid.ok && selectPayableBalance(paid.state, invoice.value.id)).toBe(0);
    if (!paid.ok) return;
    const voided = structuredClone(paid.state);
    voided.payments[0].status = "cancelled";
    expect(selectPayableBalance(voided, invoice.value.id)).toBe(5_000_000);
  });

  it("records receivable payment and completes a fully invoiced Sales Order", () => {
    const fixture = withPostedDelivery(20, 20);
    const invoice = createCustomerInvoice(fixture.state, "finance", { salesOrderId: fixture.state.salesOrders[0].id, sourceDocumentIds: [fixture.deliveryId], dueDate: "2026-09-08" }, "2026-08-10T10:00:00.000Z");
    if (!invoice.ok) throw new Error(invoice.error.message);

    const paid = recordPayment(invoice.state, "finance", { invoiceId: invoice.value.id, amount: 30_000_000, direction: "receivable" }, "2026-08-11T10:00:00.000Z");

    expect(paid).toMatchObject({ ok: true, value: { supplierId: null, customerId: "erp-customer-sinar" }, state: { customerInvoices: [{ status: "paid" }], salesOrders: [{ status: "completed" }] } });
    expect(paid.ok && selectReceivableBalance(paid.state, invoice.value.id)).toBe(0);
  });

  it("rejects non-positive, wrong-direction, unauthorized, cancelled, and mismatched-counterparty payments atomically", () => {
    const invoice = payableState();
    const cancelled = structuredClone(invoice.state);
    cancelled.supplierInvoices[0].status = "cancelled";
    const mismatched = structuredClone(invoice.state);
    mismatched.supplierInvoices[0].supplierId = "supplier-kertas";

    expect(recordPayment(invoice.state, "finance", { invoiceId: invoice.value.id, amount: 0, direction: "payable" }, later)).toMatchObject({ ok: false, state: invoice.state, error: { code: "INVALID_INPUT" } });
    expect(recordPayment(invoice.state, "finance", { invoiceId: invoice.value.id, amount: 1, direction: "receivable" }, later)).toMatchObject({ ok: false, state: invoice.state, error: { code: "INVALID_INPUT" } });
    expect(recordPayment(invoice.state, "sales", { invoiceId: invoice.value.id, amount: 1, direction: "payable" }, later)).toMatchObject({ ok: false, state: invoice.state, error: { code: "FORBIDDEN" } });
    expect(recordPayment(cancelled, "finance", { invoiceId: invoice.value.id, amount: 1, direction: "payable" }, later)).toMatchObject({ ok: false, state: cancelled, error: { code: "INVALID_STATE" } });
    expect(recordPayment(mismatched, "finance", { invoiceId: invoice.value.id, amount: 1, direction: "payable" }, later)).toMatchObject({ ok: false, state: mismatched, error: { code: "INVALID_STATE" } });
  });

  it("fails closed when stored invoice totals or statuses disagree with payment evidence", () => {
    const invoice = payableState();
    const wrongTotal = structuredClone(invoice.state);
    wrongTotal.supplierInvoices[0].totalAmount += 1;
    const wrongStatus = structuredClone(invoice.state);
    wrongStatus.supplierInvoices[0].status = "paid";

    expect(recordPayment(wrongTotal, "finance", { invoiceId: invoice.value.id, amount: 1, direction: "payable" }, later)).toMatchObject({ ok: false, state: wrongTotal, error: { code: "INVALID_STATE" } });
    expect(recordPayment(wrongStatus, "finance", { invoiceId: invoice.value.id, amount: 1, direction: "payable" }, later)).toMatchObject({ ok: false, state: wrongStatus, error: { code: "INVALID_STATE" } });
  });
});
