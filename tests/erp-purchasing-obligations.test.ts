import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PurchaseOrdersPage from "../app/purchasing/orders/page";
import { LineItemsEditor } from "../components/erp/line-items-editor";
import { createSeedState } from "../lib/demo/seed";
import type { DemoState } from "../lib/domain/types";
import { createGoodsReceipt } from "../lib/erp/commands/inventory";
import {
  createPurchaseOrder,
  createPurchaseRequest,
  createRequestForQuotation,
  createSupplierQuotation,
  selectSupplierQuotation,
} from "../lib/erp/commands/purchasing";
import { evaluateSupplierCallEligibility } from "../lib/erp/guardrails/supplier-call";
import { createErpSeedState } from "../lib/erp/seed";
import type {
  ErpState,
  PurchaseOrder,
  QuantityLine,
  SupplierCallApproval,
} from "../lib/erp/types";

const fixedNow = "2026-08-09T10:00:00.000Z";
const authoritativeDemoNow = "2026-08-10T03:00:00.000Z";

const pageHarness = vi.hoisted(() => ({ state: null as DemoState | null }));

vi.mock("@/components/demo-store-provider", () => ({
  useDemoStore: () => {
    if (!pageHarness.state) throw new Error("Test DemoState was not configured.");
    return { state: pageHarness.state };
  },
}));

vi.mock("@/components/erp-command-provider", () => ({
  useErpCommands: () => ({
    run: () => { throw new Error("Render test must not execute commands."); },
    createPurchaseOrder: () => { throw new Error("Render test must not execute commands."); },
  }),
}));

function approvedRequestState(lines: QuantityLine[] = [{ productId: "product-paper", quantity: 10, unitPrice: 11_000 }]): ErpState {
  const state = createErpSeedState();
  state.purchaseRequests = [{
    id: "request-paper",
    requestNumber: "PR-2026-0001",
    requesterRole: "procurement",
    sourceSalesOrderId: null,
    status: "approved",
    lines: lines.map((line) => ({ ...line })),
    createdAt: fixedNow,
    updatedAt: fixedNow,
  }];
  return state;
}

function addSelectedSourcing(
  state: ErpState,
  prefix: string,
  supplierId: string,
  quantity = 10,
): { purchaseRequestId: string; requestForQuotationId: string; quotationId: string; lines: QuantityLine[] } {
  const purchaseRequestId = `request-${prefix}`;
  const requestForQuotationId = `rfq-${prefix}`;
  const quotationId = `quotation-${prefix}`;
  const lines = [{ productId: "product-paper", quantity, unitPrice: 11_000 }];
  state.purchaseRequests.push({
    id: purchaseRequestId,
    requestNumber: `PR-${prefix.toUpperCase()}`,
    requesterRole: "procurement",
    sourceSalesOrderId: null,
    status: "approved",
    lines: lines.map((line) => ({ ...line })),
    createdAt: fixedNow,
    updatedAt: fixedNow,
  });
  state.requestForQuotations.push({
    id: requestForQuotationId,
    rfqNumber: `RFQ-${prefix.toUpperCase()}`,
    purchaseRequestId,
    warehouseId: "warehouse-jakarta",
    requestedSupplierIds: [supplierId],
    selectedQuotationId: quotationId,
    status: "selected",
    quoteDueAt: "2026-08-10T00:00:00.000Z",
    lines: lines.map(({ productId, quantity: lineQuantity }) => ({ productId, quantity: lineQuantity })),
    createdAt: fixedNow,
    updatedAt: fixedNow,
  });
  state.supplierQuotations.push({
    id: quotationId,
    quotationNumber: `SQ-${prefix.toUpperCase()}`,
    requestForQuotationId,
    supplierId,
    status: "selected",
    validUntil: "2026-08-20",
    lines: lines.map((line) => ({ ...line })),
    createdAt: fixedNow,
    updatedAt: fixedNow,
  });
  return { purchaseRequestId, requestForQuotationId, quotationId, lines };
}

function selectedQuotationState(quantity = 10): { state: ErpState; source: ReturnType<typeof addSelectedSourcing> } {
  const state = createErpSeedState();
  const source = addSelectedSourcing(state, "paper", "supplier-kertas", quantity);
  return { state, source };
}

function comparedQuotationState(validUntil: string, quantity = 10): ErpState {
  const state = approvedRequestState([{ productId: "product-paper", quantity, unitPrice: 11_000 }]);
  state.requestForQuotations = [{
    id: "rfq-paper",
    rfqNumber: "RFQ-2026-0001",
    purchaseRequestId: "request-paper",
    warehouseId: "warehouse-jakarta",
    requestedSupplierIds: ["supplier-utama", "supplier-kertas"],
    selectedQuotationId: null,
    status: "compared",
    quoteDueAt: "2026-08-10T00:00:00.000Z",
    lines: [{ productId: "product-paper", quantity }],
    createdAt: fixedNow,
    updatedAt: fixedNow,
  }];
  state.supplierQuotations = [
    {
      id: "quotation-expiring",
      quotationNumber: "SQ-2026-0001",
      requestForQuotationId: "rfq-paper",
      supplierId: "supplier-utama",
      status: "submitted",
      validUntil,
      lines: [{ productId: "product-paper", quantity, unitPrice: 11_000 }],
      createdAt: fixedNow,
      updatedAt: fixedNow,
    },
    {
      id: "quotation-other",
      quotationNumber: "SQ-2026-0002",
      requestForQuotationId: "rfq-paper",
      supplierId: "supplier-kertas",
      status: "submitted",
      validUntil: "2026-08-20",
      lines: [{ productId: "product-paper", quantity, unitPrice: 12_000 }],
      createdAt: fixedNow,
      updatedAt: fixedNow,
    },
  ];
  return state;
}

function quotationPurchaseOrder(state: ErpState, quotationId: string, status: PurchaseOrder["status"]): PurchaseOrder {
  const quotation = state.supplierQuotations.find((item) => item.id === quotationId)!;
  const rfq = state.requestForQuotations.find((item) => item.id === quotation.requestForQuotationId)!;
  return {
    id: `po-${status}`,
    orderNumber: `PO-${status.toUpperCase()}`,
    supplierId: quotation.supplierId,
    purchaseRequestId: rfq.purchaseRequestId,
    supplierQuotationId: quotation.id,
    warehouseId: rfq.warehouseId,
    status,
    lines: quotation.lines.map((line) => ({ ...line })),
    confirmationDueAt: null,
    promisedDeliveryDate: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
  };
}

function createFromSelected(state: ErpState, source: ReturnType<typeof addSelectedSourcing>) {
  const quotation = state.supplierQuotations.find((item) => item.id === source.quotationId)!;
  return createPurchaseOrder(state, "procurement", {
    supplierId: quotation.supplierId,
    purchaseRequestId: source.purchaseRequestId,
    supplierQuotationId: source.quotationId,
    warehouseId: "warehouse-jakarta",
    lines: source.lines,
  }, fixedNow);
}

describe("purchasing sourcing obligations", () => {
  it("requires every RFQ to name an existing approved purchase request", () => {
    const withoutRequest = createRequestForQuotation(createErpSeedState(), "procurement", {
      supplierIds: ["supplier-utama"],
      lines: [{ productId: "product-paper", quantity: 10 }],
    } as never, fixedNow);
    const missingState = createErpSeedState();
    const missing = createRequestForQuotation(missingState, "procurement", {
      purchaseRequestId: "missing-request",
      supplierIds: ["supplier-utama"],
      lines: [{ productId: "product-paper", quantity: 10 }],
    }, fixedNow);
    const draftState = approvedRequestState();
    draftState.purchaseRequests[0] = { ...draftState.purchaseRequests[0], status: "draft" };
    const draft = createRequestForQuotation(draftState, "procurement", {
      purchaseRequestId: "request-paper",
      supplierIds: ["supplier-utama"],
      lines: [{ productId: "product-paper", quantity: 10 }],
    }, fixedNow);

    expect(withoutRequest).toMatchObject({ ok: false, state: expect.any(Object), error: { code: "INVALID_INPUT" } });
    expect(missing).toMatchObject({ ok: false, state: missingState, error: { code: "NOT_FOUND" } });
    expect(draft).toMatchObject({ ok: false, state: draftState, error: { code: "INVALID_STATE" } });
  });

  it("requires RFQ product quantities to equal the approved purchase-request demand exactly", () => {
    const state = approvedRequestState([
      { productId: "product-paper", quantity: 10, unitPrice: 11_000 },
      { productId: "product-scanner", quantity: 2, unitPrice: 550_000 },
    ]);
    const base = { purchaseRequestId: "request-paper", supplierIds: ["supplier-utama"] };
    const wrongQuantity = createRequestForQuotation(state, "procurement", { ...base, lines: [{ productId: "product-paper", quantity: 9 }, { productId: "product-scanner", quantity: 2 }] }, fixedNow);
    const missingLine = createRequestForQuotation(state, "procurement", { ...base, lines: [{ productId: "product-paper", quantity: 10 }] }, fixedNow);
    const substitutedProduct = createRequestForQuotation(state, "procurement", { ...base, lines: [{ productId: "product-paper", quantity: 10 }, { productId: "product-router", quantity: 2 }] }, fixedNow);
    const exact = createRequestForQuotation(state, "procurement", { ...base, lines: [{ productId: "product-scanner", quantity: 2 }, { productId: "product-paper", quantity: 10 }] }, fixedNow);

    for (const result of [wrongQuantity, missingLine, substitutedProduct]) {
      expect(result).toMatchObject({ ok: false, state, error: { code: "INVALID_INPUT" } });
    }
    expect(exact).toMatchObject({ ok: true, value: { purchaseRequestId: "request-paper" } });
  });

  it("does not open a second active RFQ for the same approved demand", () => {
    const state = approvedRequestState();
    const input = { purchaseRequestId: "request-paper", supplierIds: ["supplier-utama"], lines: [{ productId: "product-paper", quantity: 10 }] };
    const first = createRequestForQuotation(state, "procurement", input, fixedNow);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const duplicate = createRequestForQuotation(first.state, "procurement", input, fixedNow);

    expect(duplicate).toMatchObject({ ok: false, state: first.state, error: { code: "INVALID_STATE" } });
  });

  it("rechecks quotation expiry at selection against the authoritative demo instant", () => {
    const state = comparedQuotationState("2026-08-09");

    const result = selectSupplierQuotation(state, "approver", "quotation-expiring", authoritativeDemoNow);

    expect(result).toMatchObject({ ok: false, state, error: { code: "INVALID_STATE" } });
    expect(result.state.auditLogs).toHaveLength(0);
  });

  it("keeps a quotation valid throughout its inclusive valid-through date", () => {
    const state = comparedQuotationState("2026-08-10");

    const result = selectSupplierQuotation(state, "approver", "quotation-expiring", authoritativeDemoNow);

    expect(result).toMatchObject({ ok: true, value: { id: "quotation-expiring", status: "selected" } });
    expect(result.state.auditLogs.at(-1)?.action).toBe("supplier_quotation.selected");
  });

  it.each(["draft", "sent", "fully_received", "completed"] as const)("prevents a selected quotation from backing another PO while a %s/full PO consumes it", (status) => {
    const { state, source } = selectedQuotationState();
    state.purchaseOrders.push(quotationPurchaseOrder(state, source.quotationId, status));

    const result = createFromSelected(state, source);

    expect(result).toMatchObject({ ok: false, state, error: { code: "INVALID_STATE" } });
  });

  it.each(["rejected", "cancelled"] as const)("allows a selected quotation to be reused after its only PO is %s", (status) => {
    const { state, source } = selectedQuotationState();
    state.purchaseOrders.push(quotationPurchaseOrder(state, source.quotationId, status));

    expect(createFromSelected(state, source)).toMatchObject({ ok: true, value: { supplierQuotationId: source.quotationId } });
  });

  it("hides a consumed selected quotation from the actual purchase-order page", () => {
    const demo = createSeedState();
    const consumed = addSelectedSourcing(demo.erp, "consumed", "supplier-utama");
    addSelectedSourcing(demo.erp, "available", "supplier-kertas");
    demo.erp.purchaseOrders.push(quotationPurchaseOrder(demo.erp, consumed.quotationId, "completed"));
    pageHarness.state = demo;

    const html = renderToStaticMarkup(createElement(PurchaseOrdersPage));

    expect(html).toContain("SQ-AVAILABLE");
    expect(html).not.toContain("SQ-CONSUMED");
  });
});

describe("canonical purchasing quantities", () => {

  it.each([
    ["fractional", 10.5],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1],
  ])("rejects %s purchasing unit prices", (_kind, unitPrice) => {
    const state = createErpSeedState();
    expect(createPurchaseRequest(state, "procurement", { lines: [{ productId: "product-paper", quantity: 1, unitPrice }] }, fixedNow))
      .toMatchObject({ ok: false, state, error: { code: "INVALID_INPUT" } });
  });

  it("rejects fractional purchase-request quantities", () => {
    const state = createErpSeedState();
    expect(createPurchaseRequest(state, "procurement", { lines: [{ productId: "product-paper", quantity: 1.5, unitPrice: 11_000 }] }, fixedNow)).toMatchObject({ ok: false, state, error: { code: "INVALID_INPUT" } });
  });

  it("rejects fractional RFQ quantities", () => {
    const state = approvedRequestState([{ productId: "product-paper", quantity: 1.5, unitPrice: 11_000 }]);
    expect(createRequestForQuotation(state, "procurement", { purchaseRequestId: "request-paper", supplierIds: ["supplier-utama"], lines: [{ productId: "product-paper", quantity: 1.5 }] }, fixedNow)).toMatchObject({ ok: false, state, error: { code: "INVALID_INPUT" } });
  });

  it("rejects fractional supplier-quotation quantities", () => {
    const state = approvedRequestState([{ productId: "product-paper", quantity: 1.5, unitPrice: 11_000 }]);
    state.requestForQuotations = [{
      id: "rfq-paper", rfqNumber: "RFQ-2026-0001", purchaseRequestId: "request-paper", warehouseId: "warehouse-jakarta",
      requestedSupplierIds: ["supplier-utama"], selectedQuotationId: null, status: "open", quoteDueAt: "2026-08-10T00:00:00.000Z",
      lines: [{ productId: "product-paper", quantity: 1.5 }], createdAt: fixedNow, updatedAt: fixedNow,
    }];

    expect(createSupplierQuotation(state, "procurement", {
      requestForQuotationId: "rfq-paper", supplierId: "supplier-utama", validUntil: "2026-08-20",
      lines: [{ productId: "product-paper", quantity: 1.5, unitPrice: 11_000 }],
    }, fixedNow)).toMatchObject({ ok: false, state, error: { code: "INVALID_INPUT" } });
  });

  it("rejects fractional purchase-order quantities", () => {
    const { state, source } = selectedQuotationState(1.5);
    expect(createFromSelected(state, source)).toMatchObject({ ok: false, state, error: { code: "INVALID_INPUT" } });
  });

  it("rejects unsafe whole receipt quantities at the canonical downstream boundary", () => {
    const state = createErpSeedState();
    const unsafeQuantity = Number.MAX_SAFE_INTEGER + 1;
    state.purchaseOrders[0] = { ...state.purchaseOrders[0], status: "confirmed", lines: [{ ...state.purchaseOrders[0].lines[0], quantity: unsafeQuantity }] };

    const result = createGoodsReceipt(state, "warehouse", {
      purchaseOrderId: state.purchaseOrders[0].id,
      lines: [{ productId: "product-router", quantity: unsafeQuantity }],
    }, fixedNow);

    expect(result).toMatchObject({ ok: false, state, error: { code: "INVALID_INPUT" } });
  });

  it("keeps the supplier-agent guardrail aligned to positive safe whole PO quantities", () => {
    const state = createErpSeedState();
    const purchaseOrder = { ...state.purchaseOrders[0], lines: [{ ...state.purchaseOrders[0].lines[0], quantity: 0.5 }] };
    const approval: SupplierCallApproval = {
      id: "approval-paper", supplierCallId: "call-paper", supplierId: purchaseOrder.supplierId, purchaseOrderId: purchaseOrder.id,
      status: "approved", objective: "Confirm delivery", permittedProductIds: ["product-router"], maximumDeliveryDate: "2026-08-20",
      partialDeliveryAllowed: true, maximumUnitPriceIncreasePercent: 0, language: "Bahasa Indonesia", approvedAt: fixedNow,
      approvedBy: "Nadia Pratama", createdAt: fixedNow, updatedAt: fixedNow,
    };

    expect(evaluateSupplierCallEligibility({
      supplier: state.suppliers[0], purchaseOrder, approval, localTime: "10:00", callsToday: 0, openDispute: false,
    }).codes).toContain("INVALID_ORDER_DATA");
  });

  it("renders quantity inputs with an explicit whole-unit step", () => {
    const state = createErpSeedState();
    const html = renderToStaticMarkup(createElement(LineItemsEditor, {
      products: state.products,
      lines: [{ productId: "product-router", quantity: 2, unitPrice: 1_050_000 }],
      onChange: () => undefined,
    }));

    expect(html).toMatch(/aria-label="Jumlah Router Bisnis"[^>]*step="1"/);
  });
});

beforeEach(() => {
  pageHarness.state = createSeedState();
});
