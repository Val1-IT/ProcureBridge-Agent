import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PayablesPage, { executeSupplierInvoiceCreation } from "../app/finance/payables/page";
import ReceivablesPage, { executeCustomerInvoiceCreation } from "../app/finance/receivables/page";
import PaymentsPage, { executePaymentRecording, PaymentConfirmationPanel } from "../app/finance/payments/page";
import { createSeedState } from "../lib/demo/seed";
import type { DemoState } from "../lib/domain/types";
import { createErpCommandExecutor } from "../lib/erp/command-intents";

const harness = vi.hoisted(() => ({ state: null as DemoState | null }));

vi.mock("@/components/demo-store-provider", () => ({
  useDemoStore: () => {
    if (!harness.state) throw new Error("Test DemoState was not configured.");
    return { state: harness.state };
  },
}));

vi.mock("@/components/erp-command-provider", () => ({
  useErpCommands: () => ({ run: () => { throw new Error("Render test must not execute commands."); } }),
}));

function financeState(): DemoState {
  const state = createSeedState();
  state.erp.activeRole = "finance";
  state.erp.goodsReceipts = [{
    id: "receipt-finance", receiptNumber: "GR-2026-0042", purchaseOrderId: state.erp.purchaseOrders[0].id,
    warehouseId: "warehouse-jakarta", status: "approved", lines: [{ productId: "product-router", quantity: 10, unitPrice: 1_050_000 }],
    createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z",
  }];
  state.erp.deliveryOrders = [{
    id: "delivery-finance", deliveryNumber: "DO-2026-0042", salesOrderId: state.erp.salesOrders[0].id,
    warehouseId: "warehouse-jakarta", status: "posted", lines: [{ productId: "product-router", quantity: 8, unitPrice: 1_500_000 }],
    createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z",
  }];
  state.erp.stockMovements.push(
    { id: "receipt-finance-movement", type: "receipt", productId: "product-router", warehouseId: "warehouse-jakarta", quantity: 10, direction: "in", sourceType: "goods_receipt", sourceId: "receipt-finance", actorRole: "warehouse", actorId: "role:warehouse", reason: "Approved GR-2026-0042", createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z" },
    { id: "delivery-finance-movement", type: "delivery", productId: "product-router", warehouseId: "warehouse-jakarta", quantity: 8, direction: "out", sourceType: "delivery_order", sourceId: "delivery-finance", actorRole: "warehouse", actorId: "role:warehouse", reason: "Completed DO-2026-0042", createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:00:00.000Z" },
  );
  state.erp.supplierInvoices = [{
    id: "supplier-invoice", invoiceNumber: "SINV-2026-0001", purchaseOrderId: state.erp.purchaseOrders[0].id, salesOrderId: null,
    supplierId: "supplier-utama", customerId: null, sourceDocumentIds: ["receipt-finance"], status: "partially_paid",
    lines: [{ productId: "product-router", quantity: 10, unitPrice: 1_050_000 }], totalAmount: 10_500_000, dueDate: "2026-09-08",
    createdAt: "2026-08-10T10:00:00.000Z", updatedAt: "2026-08-11T10:00:00.000Z",
  }];
  state.erp.customerInvoices = [{
    id: "customer-invoice", invoiceNumber: "CINV-2026-0001", purchaseOrderId: null, salesOrderId: state.erp.salesOrders[0].id,
    supplierId: null, customerId: "erp-customer-sinar", sourceDocumentIds: ["delivery-finance"], status: "unpaid",
    lines: [{ productId: "product-router", quantity: 8, unitPrice: 1_500_000 }], totalAmount: 12_000_000, dueDate: "2026-09-08",
    createdAt: "2026-08-10T10:00:00.000Z", updatedAt: "2026-08-10T10:00:00.000Z",
  }];
  state.erp.payments = [{
    id: "payment", paymentNumber: "PAY-2026-0001", invoiceId: "supplier-invoice", direction: "payable", supplierId: "supplier-utama", customerId: null,
    amount: 5_000_000, paymentDate: "2026-08-11", status: "posted", createdAt: "2026-08-11T10:00:00.000Z", updatedAt: "2026-08-11T10:00:00.000Z",
  }];
  return state;
}

describe("finance pages", () => {
  beforeEach(() => { harness.state = financeState(); });

  it("renders payable counterparty, source, due, original, paid, remaining, and status", () => {
    const html = renderToStaticMarkup(createElement(PayablesPage));

    expect(html).toContain("Payables");
    expect(html).toContain("PT Teknologi Utama");
    expect(html).toContain("GR-2026-0042");
    expect(html).toContain("Original total");
    expect(html).toContain("Paid");
    expect(html).toContain("Remaining");
    expect(html).toContain("partially paid");
    expect(html).toContain("Demo Data");
  });

  it("renders receivable counterparty, source, due, original, paid, remaining, and status", () => {
    const html = renderToStaticMarkup(createElement(ReceivablesPage));

    expect(html).toContain("Receivables");
    expect(html).toContain("PT Sinar Jaya Retail");
    expect(html).toContain("DO-2026-0042");
    expect(html).toContain("Original total");
    expect(html).toContain("Paid");
    expect(html).toContain("Remaining");
    expect(html).toContain("unpaid");
  });

  it("shows a preview-first payment form and an explicit confirmation panel", () => {
    const page = renderToStaticMarkup(createElement(PaymentsPage));
    const panel = renderToStaticMarkup(createElement(PaymentConfirmationPanel, {
      invoiceNumber: "SINV-2026-0001",
      counterpartyName: "PT Teknologi Utama",
      direction: "payable",
      amount: 5_000_000,
      remainingBefore: 10_500_000,
      remainingAfter: 5_500_000,
      onConfirm: () => undefined,
      onCancel: () => undefined,
    }));

    expect(page).toContain("Preview payment");
    expect(page).not.toContain("Confirm payment");
    expect(panel).toContain("Payment preview");
    expect(panel).toContain("Remaining before");
    expect(panel).toContain("Remaining after");
    expect(panel).toContain("Confirm payment");
    expect(panel).toContain("Cancel preview");
  });

  it("routes invoice and payment mutations through closed named ERP commands", async () => {
    let erp = financeState().erp;
    erp.supplierInvoices = [];
    erp.customerInvoices = [];
    erp.payments = [];
    erp.purchaseOrders[0].status = "partially_received";
    erp.salesOrders[0] = { ...erp.salesOrders[0], status: "partially_delivered", lines: [{ ...erp.salesOrders[0].lines[0], deliveredQuantity: 8 }] };
    const commands = createErpCommandExecutor(() => erp, (_expected, next) => { erp = next; return true; });

    const payable = await executeSupplierInvoiceCreation(async (input, now) => commands.recordSupplierInvoice(input, now), { purchaseOrderId: erp.purchaseOrders[0].id, sourceDocumentIds: ["receipt-finance"], dueDate: "2026-09-08" }, "2026-08-10T10:00:00.000Z");
    const receivable = await executeCustomerInvoiceCreation(async (input, now) => commands.createCustomerInvoice(input, now), { salesOrderId: erp.salesOrders[0].id, sourceDocumentIds: ["delivery-finance"], dueDate: "2026-09-08" }, "2026-08-10T10:00:00.000Z");
    const payment = await executePaymentRecording(async (input, now) => commands.recordPayment(input, now), { invoiceId: payable.ok ? payable.value.id : "missing", direction: "payable", amount: 5_000_000 }, "2026-08-11T10:00:00.000Z");

    expect(payable).toMatchObject({ ok: true, value: { totalAmount: 10_500_000 } });
    expect(receivable).toMatchObject({ ok: true, value: { totalAmount: 12_000_000 } });
    expect(payment).toMatchObject({ ok: true, value: { amount: 5_000_000 } });
  });
});
