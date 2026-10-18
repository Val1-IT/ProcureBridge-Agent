import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentStatusTimeline } from "../components/erp/document-status-timeline";
import { LineItemsEditor } from "../components/erp/line-items-editor";
import { createErpSeedState } from "../lib/erp/seed";
import {
  buildPurchaseOrderDetailModel,
  buildPurchaseOrderRows,
  buildPurchaseRequestRows,
  buildReceiptPreparationRows,
  selectReceiptPreparationFromSearchParams,
  buildSupplierFollowUpRows,
  executePurchaseOrderAction,
  filterPurchaseOrderRows,
} from "../lib/erp/purchasing-view-model";
import type { ErpState, PurchaseOrder } from "../lib/erp/types";

const fixedNow = "2026-08-09T10:00:00.000Z";

function order(overrides: Partial<PurchaseOrder>): PurchaseOrder {
  return {
    ...createErpSeedState().purchaseOrders[0],
    ...overrides,
  };
}

function stateWithLinkedQuotation(): ErpState {
  const state = createErpSeedState();
  state.purchaseRequests = [{
    id: "request-paper",
    requestNumber: "PR-2026-0001",
    requesterRole: "procurement",
    sourceSalesOrderId: null,
    status: "approved",
    lines: [{ productId: "product-paper", quantity: 100, unitPrice: 10_500 }],
    createdAt: fixedNow,
    updatedAt: fixedNow,
  }];
  state.requestForQuotations = [{
    id: "rfq-paper",
    rfqNumber: "RFQ-2026-0001",
    purchaseRequestId: "request-paper",
    warehouseId: "warehouse-jakarta",
    requestedSupplierIds: ["supplier-utama", "supplier-kertas"],
    selectedQuotationId: "quotation-paper",
    status: "selected",
    quoteDueAt: "2026-08-10T00:00:00.000Z",
    lines: [{ productId: "product-paper", quantity: 100 }],
    createdAt: fixedNow,
    updatedAt: fixedNow,
  }];
  state.supplierQuotations = [
    {
      id: "quotation-other",
      quotationNumber: "SQ-2026-0001",
      requestForQuotationId: "rfq-paper",
      supplierId: "supplier-utama",
      status: "rejected",
      validUntil: "2026-08-20T00:00:00.000Z",
      lines: [{ productId: "product-paper", quantity: 100, unitPrice: 11_000 }],
      createdAt: fixedNow,
      updatedAt: fixedNow,
    },
    {
      id: "quotation-paper",
      quotationNumber: "SQ-2026-0002",
      requestForQuotationId: "rfq-paper",
      supplierId: "supplier-kertas",
      status: "selected",
      validUntil: "2026-08-19T00:00:00.000Z",
      lines: [{ productId: "product-paper", quantity: 100, unitPrice: 10_500 }],
      createdAt: fixedNow,
      updatedAt: fixedNow,
    },
  ];
  state.purchaseOrders = [order({
    id: "po-paper",
    orderNumber: "PO-2026-0002",
    supplierId: "supplier-kertas",
    purchaseRequestId: "request-paper",
    supplierQuotationId: "quotation-paper",
    status: "sent",
    confirmationDueAt: "2026-08-11T00:00:00.000Z",
    lines: [{ productId: "product-paper", quantity: 100, unitPrice: 10_500 }],
  })];
  return state;
}

describe("purchasing workspace view models", () => {
  it("builds linked PO detail with quotation provenance and only the primary action allowed by role and status", () => {
    const state = stateWithLinkedQuotation();

    const model = buildPurchaseOrderDetailModel(state, "procurement", "po-paper", fixedNow);

    expect(model?.links).toEqual({
      supplier: "/suppliers?supplierId=supplier-kertas",
      request: "/purchasing/requests?purchaseRequestId=request-paper",
      receipts: "/purchasing/receipts?purchaseOrderId=po-paper&mode=prepare",
      followUp: "/purchasing/follow-up?purchaseOrderId=po-paper",
    });
    expect(model?.allowedActions).toEqual(["confirm"]);
    expect(model?.quotation).toMatchObject({
      rfqNumber: "RFQ-2026-0001",
      quotationNumber: "SQ-2026-0002",
      supplierName: "CV Kertas Nusantara",
      comparisonRank: 1,
    });
    expect(buildPurchaseOrderDetailModel(state, "warehouse", "po-paper", fixedNow)?.allowedActions).toEqual([]);
  });

  it("derives list totals, approval, expected date, receipt progress, next action, and operational filters", () => {
    const state = createErpSeedState();
    state.purchaseOrders.push(order({
      id: "po-partial",
      orderNumber: "PO-2026-0002",
      supplierId: "supplier-kertas",
      status: "partially_received",
      confirmationDueAt: null,
      promisedDeliveryDate: "2026-08-08T00:00:00.000Z",
      lines: [{ productId: "product-paper", quantity: 100, unitPrice: 10_500 }],
    }));
    state.goodsReceipts = [{
      id: "receipt-paper",
      receiptNumber: "GR-2026-0001",
      purchaseOrderId: "po-partial",
      warehouseId: "warehouse-jakarta",
      status: "posted",
      lines: [{ productId: "product-paper", quantity: 30, unitPrice: 10_500 }],
      createdAt: fixedNow,
      updatedAt: fixedNow,
    }];

    const rows = buildPurchaseOrderRows(state, "procurement", fixedNow);
    const partial = rows.find((row) => row.id === "po-partial");

    expect(partial).toMatchObject({
      supplierName: "CV Kertas Nusantara",
      totalAmount: 1_050_000,
      approvalStatus: "approved",
      expectedDate: "2026-08-08T00:00:00.000Z",
      receivedQuantity: 30,
      orderedQuantity: 100,
      receivedPercent: 30,
      nextAction: "prepare_receipt",
      overdue: true,
    });
    expect(filterPurchaseOrderRows(rows, { status: "partially_received", supplierId: "supplier-kertas", overdue: "overdue" }).map((row) => row.id)).toEqual(["po-partial"]);
  });

  it("integrates RFQ comparison and selected quotation into purchase request rows", () => {
    const [row] = buildPurchaseRequestRows(stateWithLinkedQuotation());

    expect(row).toMatchObject({
      requestNumber: "PR-2026-0001",
      rfqNumber: "RFQ-2026-0001",
      quotationCount: 2,
      selectedQuotationNumber: "SQ-2026-0002",
      selectedSupplierName: "CV Kertas Nusantara",
      linkedPurchaseOrderNumber: "PO-2026-0002",
    });
    expect(row.quotationComparison.map((quotation) => ({ rank: quotation.rank, supplierName: quotation.supplierName, selected: quotation.selected }))).toEqual([
      { rank: 1, supplierName: "CV Kertas Nusantara", selected: true },
    ]);
  });

  it("allows receipt preparation only for confirmed or partially received orders without inventing stock mutation", () => {
    const state = createErpSeedState();
    state.purchaseOrders = [
      order({ id: "po-sent", status: "sent" }),
      order({ id: "po-confirmed", orderNumber: "PO-2026-0002", status: "confirmed" }),
      order({ id: "po-partial", orderNumber: "PO-2026-0003", status: "partially_received" }),
      order({ id: "po-complete", orderNumber: "PO-2026-0004", status: "fully_received" }),
    ];

    expect(buildReceiptPreparationRows(state).map((row) => ({ id: row.purchaseOrderId, href: row.prepareHref, postingEnabled: row.postingEnabled }))).toEqual([
      { id: "po-confirmed", href: "/purchasing/receipts?purchaseOrderId=po-confirmed&mode=prepare", postingEnabled: true },
      { id: "po-partial", href: "/purchasing/receipts?purchaseOrderId=po-partial&mode=prepare", postingEnabled: true },
    ]);
  });

  it("round-trips the PO detail receipt URL into the matching preparation panel", () => {
    const state = stateWithLinkedQuotation();
    state.purchaseOrders[0] = { ...state.purchaseOrders[0], status: "confirmed" };
    const detail = buildPurchaseOrderDetailModel(state, "warehouse", "po-paper", fixedNow);
    const searchParams = new URL(detail!.links.receipts, "https://demo.invalid").searchParams;

    const selection = selectReceiptPreparationFromSearchParams(buildReceiptPreparationRows(state), searchParams);

    expect(selection?.purchaseOrderId).toBe("po-paper");
    expect(selection?.prepareHref).toBe(detail?.links.receipts);
  });

  it("derives per-product outstanding receipt quantities from every posted receipt and clamps at zero", () => {
    const state = createErpSeedState();
    state.purchaseOrders = [order({
      id: "po-partial-lines",
      status: "partially_received",
      lines: [
        { productId: "product-router", quantity: 40, unitPrice: 1_050_000 },
        { productId: "product-paper", quantity: 100, unitPrice: 11_000 },
      ],
    })];
    state.goodsReceipts = [
      { id: "gr-posted-a", receiptNumber: "GR-2026-0001", purchaseOrderId: "po-partial-lines", warehouseId: "warehouse-jakarta", status: "posted", lines: [{ productId: "product-router", quantity: 10, unitPrice: 1_050_000 }, { productId: "product-paper", quantity: 20, unitPrice: 11_000 }], createdAt: fixedNow, updatedAt: fixedNow },
      { id: "gr-posted-b", receiptNumber: "GR-2026-0002", purchaseOrderId: "po-partial-lines", warehouseId: "warehouse-jakarta", status: "posted", lines: [{ productId: "product-router", quantity: 5, unitPrice: 1_050_000 }, { productId: "product-paper", quantity: 120, unitPrice: 11_000 }], createdAt: fixedNow, updatedAt: fixedNow },
      { id: "gr-draft", receiptNumber: "GR-2026-0003", purchaseOrderId: "po-partial-lines", warehouseId: "warehouse-jakarta", status: "draft", lines: [{ productId: "product-router", quantity: 20, unitPrice: 1_050_000 }], createdAt: fixedNow, updatedAt: fixedNow },
    ];

    const [queueRow] = buildReceiptPreparationRows(state);
    const selection = selectReceiptPreparationFromSearchParams([queueRow], new URLSearchParams("purchaseOrderId=po-partial-lines&mode=prepare"));

    expect(queueRow).toMatchObject({ orderedQuantity: 140, receivedQuantity: 155, outstandingQuantity: 25 });
    expect(queueRow.lines).toEqual([
      { productId: "product-router", orderedQuantity: 40, receivedQuantity: 15, outstandingQuantity: 25 },
      { productId: "product-paper", orderedQuantity: 100, receivedQuantity: 140, outstandingQuantity: 0 },
    ]);
    expect(selection?.lines).toEqual(queueRow.lines);
  });

  it("shows an explicit real follow-up reason and routes to Supplier Agent approval", () => {
    const [item] = buildSupplierFollowUpRows(createErpSeedState(), fixedNow);

    expect(item).toMatchObject({
      purchaseOrderId: "po-router-replenishment",
      priority: "high",
      reasonCode: "CONFIRMATION_OVERDUE",
      reason: "Supplier belum mengonfirmasi PO melewati batas konfirmasi.",
      approvalHref: "/supplier-follow-up/po-router-replenishment",
    });
    expect(item.startCallHref).toBeNull();
  });

  it("renders timeline semantics and a labeled line editor from business data", () => {
    const timeline = renderToStaticMarkup(createElement(DocumentStatusTimeline, { currentStatus: "sent" }));
    const editor = renderToStaticMarkup(createElement(LineItemsEditor, {
      products: createErpSeedState().products,
      lines: [{ productId: "product-router", quantity: 2, unitPrice: 1_050_000 }],
      onChange: () => undefined,
    }));

    expect(timeline).toContain('aria-label="Status dokumen pembelian"');
    expect(timeline).toContain('aria-current="step"');
    expect(timeline).toContain("Dikirim");
    expect(editor).toContain('aria-label="Jumlah Router Bisnis"');
    expect(editor).toContain('aria-label="Harga satuan Router Bisnis"');
    expect(editor).toContain("Rp\u00a01.050.000");
  });

  it("routes rendered PO intent through lifecycle commands and keeps forbidden attempts atomic", () => {
    const state = createErpSeedState();

    const confirmed = executePurchaseOrderAction(state, "procurement", "confirm", "po-router-replenishment", fixedNow);
    const forbidden = executePurchaseOrderAction(state, "warehouse", "confirm", "po-router-replenishment", fixedNow);

    expect(confirmed).toMatchObject({ ok: true, value: { status: "confirmed" } });
    expect(confirmed.state.auditLogs.at(-1)?.action).toBe("purchase_order.confirmed");
    expect(forbidden).toMatchObject({ ok: false, state, error: { code: "FORBIDDEN" } });
  });
});
