import { describe, expect, it } from "vitest";
import { createErpSeedState } from "../lib/erp/seed";
import type { StockMovement, TradeInvoice } from "../lib/erp/types";
import type { ErpRepository } from "../lib/repository/erp-repository";
import { MapperError } from "../lib/repository/mappers/mapper-utils";
import { fromErpProductRow, toErpProductRow } from "../lib/repository/mappers/erp-product-mapper";
import { fromErpPurchaseOrderRows, toErpPurchaseOrderRows } from "../lib/repository/mappers/erp-purchase-order-mapper";
import { fromErpStockMovementRow, toErpStockMovementRow } from "../lib/repository/mappers/erp-stock-movement-mapper";
import { fromErpTradeInvoiceRows, toErpTradeInvoiceRows } from "../lib/repository/mappers/erp-trade-invoice-mapper";

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
  it("maps a product with strict tenant, numeric, and instant validation", () => {
    const product = state.products[0];
    const row = toErpProductRow(product, tenantId);
    expect(row).toMatchObject({ tenant_id: tenantId, sale_price: product.salePrice, purchase_price: product.purchasePrice, reorder_point: product.reorderPoint, created_at: product.createdAt, updated_at: product.updatedAt });
    expect(row).not.toHaveProperty("salePrice");
    expect(fromErpProductRow({ ...row, sale_price: "1500000.00", purchase_price: "1050000", reorder_point: "25.0000" }, tenantId)).toEqual(product);
    for (const invalid of [
      { ...row, tenant_id: "tenant-other" }, { ...row, sku: " ROUTER-01" }, { ...row, sale_price: " 1500000" },
      { ...row, sale_price: "9007199254740992" }, { ...row, sale_price: "0" }, { ...row, purchase_price: null },
      { ...row, reorder_point: "-1" }, { ...row, created_at: "2026-02-31T00:00:00.000Z" },
    ]) expect(() => fromErpProductRow(invalid, tenantId)).toThrow(MapperError);

    const fractionalProduct = { ...product, salePrice: 1_500_000.25, purchasePrice: 1_050_000.5, reorderPoint: 25.5 };
    expect(fromErpProductRow(toErpProductRow(fractionalProduct, tenantId), tenantId)).toEqual(fractionalProduct);
  });

  it("maps purchase orders as normalized header and child rows", () => {
    const order = state.purchaseOrders[0];
    const rows = toErpPurchaseOrderRows(order, tenantId);
    expect(rows.header).toMatchObject({ tenant_id: tenantId, order_number: order.orderNumber, purchase_request_id: null, supplier_quotation_id: null, promised_delivery_date: null });
    expect(rows.header).not.toHaveProperty("lines");
    expect(rows.lines[0]).toEqual({ tenant_id: tenantId, purchase_order_id: order.id, line_number: 1, product_id: order.lines[0].productId, quantity: order.lines[0].quantity, unit_price: order.lines[0].unitPrice });
    expect(fromErpPurchaseOrderRows({ header: rows.header, lines: rows.lines.map((line) => ({ ...line, line_number: String(line.line_number), quantity: `${line.quantity}.0000`, unit_price: `${line.unit_price}.00` })) }, tenantId)).toEqual(order);

    const fractionalOrder = { ...order, lines: order.lines.map((line, index) => index === 0 ? { ...line, quantity: 1.25, unitPrice: 1_050_000.5 } : line) };
    expect(fromErpPurchaseOrderRows(toErpPurchaseOrderRows(fractionalOrder, tenantId), tenantId)).toEqual(fractionalOrder);
  });

  it("rejects cross-tenant, detached, malformed, and database-invalid purchase-order rows", () => {
    const rows = toErpPurchaseOrderRows(state.purchaseOrders[0], tenantId);
    const invalidAggregates = [
      { header: { ...rows.header, tenant_id: "tenant-other" }, lines: rows.lines },
      { header: rows.header, lines: rows.lines.map((line) => ({ ...line, tenant_id: "tenant-other" })) },
      { header: rows.header, lines: rows.lines.map((line) => ({ ...line, purchase_order_id: "po-other" })) },
      { header: { ...rows.header, status: "teleported" }, lines: rows.lines },
      { header: { ...rows.header, confirmation_due_at: "2026-02-31T00:00:00.000Z" }, lines: rows.lines },
      { header: { ...rows.header, promised_delivery_date: "2026-02-31" }, lines: rows.lines },
      { header: rows.header, lines: rows.lines.map((line) => ({ ...line, line_number: "1.5" })) },
      { header: rows.header, lines: rows.lines.map((line) => ({ ...line, quantity: "0" })) },
      { header: rows.header, lines: rows.lines.map((line) => ({ ...line, unit_price: "9007199254740992" })) },
    ];
    for (const aggregate of invalidAggregates) expect(() => fromErpPurchaseOrderRows(aggregate, tenantId)).toThrow(MapperError);
  });

  it("maps each v10 stock-movement convention including signed adjustments", () => {
    const base = state.stockMovements[0];
    const movements: StockMovement[] = [
      base,
      { ...base, id: "receipt", type: "receipt", sourceType: "goods_receipt", sourceId: "receipt-1", direction: "in", quantity: 5, actorRole: "warehouse", actorId: "role:warehouse" },
      { ...base, id: "delivery", type: "delivery", sourceType: "delivery_order", sourceId: "delivery-1", direction: "out", quantity: 3, actorRole: "warehouse", actorId: "role:warehouse" },
      { ...base, id: "adjustment-in", type: "adjustment", sourceType: "adjustment", sourceId: "adjustment-1", direction: "adjustment", quantity: 2, actorRole: "approver", actorId: "role:approver" },
      { ...base, id: "adjustment-out", type: "adjustment", sourceType: "adjustment", sourceId: "adjustment-2", direction: "adjustment", quantity: -2, actorRole: "approver", actorId: "role:approver" },
    ];
    for (const movement of movements) {
      const row = toErpStockMovementRow(movement, tenantId);
      const quantity = movement.quantity < 0 ? `${movement.quantity}.0000` : `${movement.quantity}.00`;
      expect(fromErpStockMovementRow({ ...row, quantity }, tenantId)).toEqual(movement);
    }
  });

  it("rejects stock movements whose scalar or source/type/direction contract is invalid", () => {
    const row = toErpStockMovementRow(state.stockMovements[0], tenantId);
    const invalidRows = [
      { ...row, tenant_id: "tenant-other" }, { ...row, type: null }, { ...row, quantity: "0" }, { ...row, quantity: "1.5" }, { ...row, quantity: " 30" },
      { ...row, source_type: "goods_receipt", type: "receipt", direction: "in", quantity: "-1" },
      { ...row, source_type: "delivery_order", type: "delivery", direction: "out", quantity: "-1" },
      { ...row, source_type: "adjustment", type: "adjustment", direction: "in", quantity: "1" },
      { ...row, source_type: "adjustment", type: "receipt", direction: "adjustment", quantity: "1" },
      { ...row, created_at: "2026-08-09 00:00:00" }, { ...row, reason: undefined },
    ];
    for (const invalid of invalidRows) expect(() => fromErpStockMovementRow(invalid, tenantId)).toThrow(MapperError);
  });

  it("maps trade invoices as normalized header, typed source, and line rows", () => {
    const invoice: TradeInvoice = {
      id: "supplier-invoice-1", invoiceNumber: "SI-2026-0001", purchaseOrderId: "po-router-replenishment", salesOrderId: null,
      supplierId: "supplier-utama", customerId: null, sourceDocumentIds: ["receipt-1"], status: "partially_paid",
      lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_050_000 }], totalAmount: 42_000_000,
      dueDate: "2026-09-08", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",
    };
    const rows = toErpTradeInvoiceRows(invoice, tenantId);
    expect(rows.header).toMatchObject({ tenant_id: tenantId, invoice_number: invoice.invoiceNumber, purchase_order_id: invoice.purchaseOrderId, sales_order_id: null, supplier_id: invoice.supplierId, customer_id: null, total_amount: invoice.totalAmount, due_date: invoice.dueDate });
    expect(rows.header).not.toHaveProperty("source_document_ids");
    expect(rows.header).not.toHaveProperty("lines");
    expect(rows.sources).toEqual([{ tenant_id: tenantId, trade_invoice_id: invoice.id, source_number: 1, goods_receipt_id: "receipt-1", delivery_order_id: null }]);
    expect(rows.lines[0]).toMatchObject({ tenant_id: tenantId, trade_invoice_id: invoice.id, line_number: 1, product_id: "product-router" });
    expect(fromErpTradeInvoiceRows({ header: { ...rows.header, total_amount: "42000000.00" }, sources: rows.sources.map((source) => ({ ...source, source_number: "1" })), lines: rows.lines.map((line) => ({ ...line, line_number: "1", quantity: "40.0000", unit_price: "1050000.00" })) }, tenantId)).toEqual(invoice);
  });

  it("rejects invoice rows that cross tenants, parents, source kinds, parties, or strict scalar bounds", () => {
    const invoice: TradeInvoice = state.supplierInvoices[0] ?? {
      id: "supplier-invoice-1", invoiceNumber: "SI-2026-0001", purchaseOrderId: "po-router-replenishment", salesOrderId: null,
      supplierId: "supplier-utama", customerId: null, sourceDocumentIds: ["receipt-1"], status: "unpaid",
      lines: [{ productId: "product-router", quantity: 1, unitPrice: 1_050_000 }], totalAmount: 1_050_000,
      dueDate: "2026-09-08", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",
    };
    const rows = toErpTradeInvoiceRows(invoice, tenantId);
    const invalidAggregates = [
      { header: { ...rows.header, tenant_id: "tenant-other" }, sources: rows.sources, lines: rows.lines },
      { header: rows.header, sources: rows.sources.map((source) => ({ ...source, tenant_id: "tenant-other" })), lines: rows.lines },
      { header: rows.header, sources: rows.sources.map((source) => ({ ...source, trade_invoice_id: "invoice-other" })), lines: rows.lines },
      { header: rows.header, sources: rows.sources.map((source) => ({ ...source, goods_receipt_id: null, delivery_order_id: "delivery-1" })), lines: rows.lines },
      { header: { ...rows.header, customer_id: "customer-1" }, sources: rows.sources, lines: rows.lines },
      { header: { ...rows.header, due_date: "2026-02-31" }, sources: rows.sources, lines: rows.lines },
      { header: { ...rows.header, total_amount: "0" }, sources: rows.sources, lines: rows.lines },
      { header: { ...rows.header, total_amount: "9007199254740992" }, sources: rows.sources, lines: rows.lines },
      { header: rows.header, sources: rows.sources, lines: rows.lines.map((line) => ({ ...line, line_number: "0" })) },
      { header: rows.header, sources: rows.sources, lines: rows.lines.map((line) => ({ ...line, quantity: null })) },
    ];
    for (const aggregate of invalidAggregates) expect(() => fromErpTradeInvoiceRows(aggregate, tenantId)).toThrow(MapperError);
  });
});
