import { describe, expect, it } from "vitest";
import { createErpSeedState } from "../lib/erp/seed";
import type { ErpRepository } from "../lib/repository/erp-repository";
import { MapperError } from "../lib/repository/mappers/mapper-utils";
import { fromErpProductRow, toErpProductRow } from "../lib/repository/mappers/erp-product-mapper";
import { fromErpPurchaseOrderRow, toErpPurchaseOrderRow } from "../lib/repository/mappers/erp-purchase-order-mapper";
import { fromErpStockMovementRow, toErpStockMovementRow } from "../lib/repository/mappers/erp-stock-movement-mapper";
import { fromErpTradeInvoiceRow, toErpTradeInvoiceRow } from "../lib/repository/mappers/erp-trade-invoice-mapper";

const tenantId = "tenant-demo";
const state = createErpSeedState();

describe("optional ERP repository contract", () => {
  it("remains an interface over ERP state rather than a concrete browser client", () => {
    const repository: ErpRepository = {
      async loadWorkspace() { return state; },
      async saveAtomic(_tenantId, expectedRevision) { return { revision: expectedRevision + 1 }; },
      async appendAuditEvents() {},
    };

    expect(repository.loadWorkspace).toBeTypeOf("function");
    expect(repository.saveAtomic).toBeTypeOf("function");
    expect(repository.appendAuditEvents).toBeTypeOf("function");
  });
});

describe("ERP database mappers", () => {
  it("maps a product to tenant-scoped snake_case and converts numeric strings", () => {
    const product = state.products[0];
    const row = toErpProductRow(product, tenantId);

    expect(row).toMatchObject({
      tenant_id: tenantId,
      sale_price: product.salePrice,
      purchase_price: product.purchasePrice,
      reorder_point: product.reorderPoint,
      created_at: product.createdAt,
      updated_at: product.updatedAt,
    });
    expect(row).not.toHaveProperty("salePrice");
    expect(fromErpProductRow({ ...row, sale_price: "1500000.00", purchase_price: "1050000", reorder_point: "25" })).toEqual(product);
  });

  it("rejects null required product values and non-finite numeric strings", () => {
    const row = toErpProductRow(state.products[0], tenantId);

    expect(() => fromErpProductRow({ ...row, sale_price: null })).toThrow(MapperError);
    expect(() => fromErpProductRow({ ...row, reorder_point: "not-a-number" })).toThrow(MapperError);
  });

  it("maps purchase-order lines, preserves nullable dates, and rejects unknown statuses", () => {
    const order = state.purchaseOrders[0];
    const row = toErpPurchaseOrderRow(order, tenantId);

    expect(row).toMatchObject({ tenant_id: tenantId, order_number: order.orderNumber, purchase_request_id: null, supplier_quotation_id: null, promised_delivery_date: null });
    expect(row.lines[0]).toEqual({ product_id: order.lines[0].productId, quantity: order.lines[0].quantity, unit_price: order.lines[0].unitPrice });
    expect(fromErpPurchaseOrderRow({ ...row, lines: [{ ...row.lines[0], quantity: "40", unit_price: "1050000.00" }] })).toEqual(order);
    expect(() => fromErpPurchaseOrderRow({ ...row, status: "teleported" })).toThrow(MapperError);
  });

  it("maps append-only stock movement fields and rejects unsupported enums", () => {
    const movement = state.stockMovements[0];
    const row = toErpStockMovementRow(movement, tenantId);

    expect(row).toMatchObject({ tenant_id: tenantId, product_id: movement.productId, warehouse_id: movement.warehouseId, source_type: movement.sourceType, source_id: movement.sourceId, actor_role: movement.actorRole, actor_id: movement.actorId });
    expect(fromErpStockMovementRow({ ...row, quantity: "30.00" })).toEqual(movement);
    expect(() => fromErpStockMovementRow({ ...row, direction: "sideways" })).toThrow(MapperError);
    expect(() => fromErpStockMovementRow({ ...row, reason: undefined })).toThrow(MapperError);
  });

  it("maps trade invoices with explicit nullable counterparties and numeric strings", () => {
    const invoice = {
      id: "supplier-invoice-1",
      invoiceNumber: "SI-2026-0001",
      purchaseOrderId: "po-router-replenishment",
      salesOrderId: null,
      supplierId: "supplier-utama",
      customerId: null,
      sourceDocumentIds: ["receipt-1"],
      status: "partially_paid" as const,
      lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_050_000 }],
      totalAmount: 42_000_000,
      dueDate: "2026-09-08",
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    };
    const row = toErpTradeInvoiceRow(invoice, tenantId);

    expect(row).toMatchObject({ tenant_id: tenantId, invoice_number: invoice.invoiceNumber, purchase_order_id: invoice.purchaseOrderId, sales_order_id: null, supplier_id: invoice.supplierId, customer_id: null, source_document_ids: invoice.sourceDocumentIds, total_amount: invoice.totalAmount, due_date: invoice.dueDate });
    expect(fromErpTradeInvoiceRow({ ...row, total_amount: "42000000.00", lines: [{ ...row.lines[0], quantity: "40", unit_price: "1050000" }] })).toEqual(invoice);
    expect(() => fromErpTradeInvoiceRow({ ...row, status: "overdue" })).toThrow(MapperError);
    expect(() => fromErpTradeInvoiceRow({ ...row, customer_id: undefined })).toThrow(MapperError);
  });
});
