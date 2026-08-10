import { describe, expect, it } from "vitest";
import type { TradeInvoice } from "../lib/erp/types";
import { MapperError } from "../lib/repository/mappers/mapper-utils";
import { fromErpTradeInvoiceRows, toErpTradeInvoiceRows } from "../lib/repository/mappers/erp-trade-invoice-mapper";

const tenantId = "tenant-demo";

function fractionalInvoice(): TradeInvoice {
  return {
    id: "fractional-invoice",
    invoiceNumber: "SINV-FRACTIONAL",
    purchaseOrderId: "po-router-replenishment",
    salesOrderId: null,
    supplierId: "supplier-utama",
    customerId: null,
    sourceDocumentIds: ["receipt-fractional"],
    status: "unpaid",
    lines: [{ productId: "product-router", quantity: 0.5, unitPrice: 10.5 }],
    totalAmount: 5.25,
    dueDate: "2026-09-08",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  };
}

describe("ERP trade-invoice decimal persistence", () => {
  it("round-trips positive fractional values at their declared SQL scales", () => {
    const invoice = fractionalInvoice();
    const rows = toErpTradeInvoiceRows(invoice, tenantId);

    expect(fromErpTradeInvoiceRows({
      header: { ...rows.header, total_amount: "5.25" },
      sources: rows.sources,
      lines: rows.lines.map((line) => ({ ...line, quantity: "0.5000", unit_price: "10.50" })),
    }, tenantId)).toEqual(invoice);
  });

  it("compares invoice totals in scaled decimal units instead of binary floats", () => {
    const invoice: TradeInvoice = {
      ...fractionalInvoice(),
      id: "binary-drift-invoice",
      invoiceNumber: "SINV-BINARY-DRIFT",
      lines: [{ productId: "product-router", quantity: 0.1, unitPrice: 0.1 }],
      totalAmount: 0.01,
    };

    expect(fromErpTradeInvoiceRows(toErpTradeInvoiceRows(invoice, tenantId), tenantId)).toEqual(invoice);
  });

  it("rejects non-positive, excess-scale, and unsafe-precision invoice decimals", () => {
    const rows = toErpTradeInvoiceRows(fractionalInvoice(), tenantId);
    const invalidAggregates = [
      { header: rows.header, sources: rows.sources, lines: [{ ...rows.lines[0], quantity: "0" }] },
      { header: rows.header, sources: rows.sources, lines: [{ ...rows.lines[0], quantity: "-0.5000" }] },
      { header: rows.header, sources: rows.sources, lines: [{ ...rows.lines[0], quantity: "0.50000" }] },
      { header: { ...rows.header, total_amount: "90071992547409.92" }, sources: rows.sources, lines: [{ ...rows.lines[0], quantity: "1", unit_price: "90071992547409.92" }] },
      { header: rows.header, sources: rows.sources, lines: [{ ...rows.lines[0], unit_price: "0" }] },
      { header: rows.header, sources: rows.sources, lines: [{ ...rows.lines[0], unit_price: "-10.50" }] },
      { header: rows.header, sources: rows.sources, lines: [{ ...rows.lines[0], unit_price: "10.500" }] },
      { header: { ...rows.header, total_amount: "0" }, sources: rows.sources, lines: rows.lines },
      { header: { ...rows.header, total_amount: "-5.25" }, sources: rows.sources, lines: rows.lines },
      { header: { ...rows.header, total_amount: "5.250" }, sources: rows.sources, lines: rows.lines },
    ];

    for (const aggregate of invalidAggregates) {
      expect(() => fromErpTradeInvoiceRows(aggregate, tenantId)).toThrow(MapperError);
    }
  });
});
