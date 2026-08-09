import { describe, expect, it } from "vitest";
import type { DemoState } from "../lib/domain/types";
import { deserializeDemoState, loadDemoState } from "../lib/demo/persistence";
import { createSeedState } from "../lib/demo/seed";
import { createErpSeedState } from "../lib/erp/seed";
import { selectAvailableStock, selectIncomingStock } from "../lib/erp/selectors";

describe("ERP persistence foundation", () => {
  it("migrates schema v2 recovery data into schema v4 with a deterministic ERP slice", () => {
    const legacy = { ...createSeedState(), schemaVersion: 2 } as unknown as DemoState;
    delete (legacy as Partial<DemoState>).erp;

    const migrated = deserializeDemoState(JSON.stringify(legacy));

    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.erp.products.map((item) => item.sku)).toEqual(["SKU-ROUTER-01", "SKU-SCANNER-01", "SKU-PAPER-80"]);
    expect(migrated.erp.revision).toBe(0);
  });

  it("migrates stored schema v3 ERP data with safe RFQ and follow-up approval defaults", () => {
    const legacy = createSeedState();
    legacy.schemaVersion = 3;
    delete (legacy.erp as { requestForQuotations?: unknown }).requestForQuotations;
    delete (legacy.erp as { supplierQuotations?: unknown }).supplierQuotations;
    delete (legacy.erp.purchaseOrders[0] as { supplierQuotationId?: unknown }).supplierQuotationId;

    const migrated = deserializeDemoState(JSON.stringify(legacy));

    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.erp.requestForQuotations).toEqual([]);
    expect(migrated.erp.supplierQuotations).toEqual([]);
    expect(migrated.erp.purchaseOrders[0].supplierQuotationId).toBeNull();
  });

  it("computes available and incoming quantities without storing derived totals", () => {
    const erp = createErpSeedState();

    expect(selectAvailableStock(erp, "product-router")).toBe(18);
    expect(selectIncomingStock(erp, "product-router")).toBe(40);
  });

  it("reports invalid stored data so the UI can offer a safe reset", () => {
    const loaded = loadDemoState("not-json");

    expect(loaded.state).toEqual(createSeedState());
    expect(loaded.recoveryReason).toBe("INVALID_JSON");
  });

  it("fails closed when a schema v3 ERP slice has an invalid role or product entity", () => {
    const malformed = createSeedState();
    malformed.erp.activeRole = "operator" as never;
    malformed.erp.products = [null as never];

    const loaded = loadDemoState(JSON.stringify(malformed));

    expect(loaded.state).toEqual(createSeedState());
    expect(loaded.recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("subtracts posted receipts only from the open purchase order quantity", () => {
    const erp = createErpSeedState();
    erp.purchaseOrders.push({
      ...erp.purchaseOrders[0],
      id: "po-completed-router",
      orderNumber: "PO-2026-0002",
      status: "completed",
    });
    erp.goodsReceipts.push({
      id: "receipt-completed-router",
      receiptNumber: "GR-2026-0001",
      purchaseOrderId: "po-completed-router",
      warehouseId: "warehouse-jakarta",
      status: "posted",
      lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_050_000 }],
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    });

    expect(selectIncomingStock(erp, "product-router")).toBe(40);
  });

  it("fails closed when linked supplier-call transactions omit their required IDs and status", () => {
    const malformed = createSeedState();
    malformed.erp.supplierCalls = [{
      id: "supplier-call-1",
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    } as never];

    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it("fails closed when a purchase order links a selected quotation from a different supplier", () => {
    const malformed = createSeedState();
    malformed.erp.requestForQuotations = [{
      id: "rfq-router", rfqNumber: "RFQ-2026-0001", purchaseRequestId: null, warehouseId: "warehouse-jakarta", requestedSupplierIds: ["supplier-kertas"], selectedQuotationId: "quotation-kertas", status: "selected", quoteDueAt: "2026-08-10T00:00:00.000Z", lines: [{ productId: "product-router", quantity: 40 }], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",
    }];
    malformed.erp.supplierQuotations = [{
      id: "quotation-kertas", quotationNumber: "SQ-2026-0001", requestForQuotationId: "rfq-router", supplierId: "supplier-kertas", status: "selected", validUntil: "2026-08-20T00:00:00.000Z", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_000_000 }], createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",
    }];
    malformed.erp.purchaseOrders[0].supplierQuotationId = "quotation-kertas";

    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });

  it.each([
    ["a purchase order references a missing purchase request", (state: ReturnType<typeof createSeedState>) => { state.erp.purchaseOrders[0].purchaseRequestId = "missing-request"; }],
    ["a supplier invoice omits its required supplier link", (state: ReturnType<typeof createSeedState>) => {
      state.erp.supplierInvoices.push({
        id: "supplier-invoice-1", invoiceNumber: "BILL-2026-0001", purchaseOrderId: null, salesOrderId: null,
        customerId: null, status: "unpaid", lines: [{ productId: "product-router", quantity: 1, unitPrice: 1_050_000 }], dueDate: "2026-08-20",
        createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",
      } as never);
    }],
    ["a payment references an invoice that does not exist", (state: ReturnType<typeof createSeedState>) => {
      state.erp.payments.push({
        id: "payment-1", paymentNumber: "PAY-2026-0001", invoiceId: "missing-invoice", direction: "payable", amount: 1_000, paymentDate: "2026-08-09", status: "posted",
        createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",
      });
    }],
  ])("fails closed when %s", (_case, mutate) => {
    const malformed = createSeedState();
    mutate(malformed);

    expect(loadDemoState(JSON.stringify(malformed)).recoveryReason).toBe("INVALID_SCHEMA");
  });
});
