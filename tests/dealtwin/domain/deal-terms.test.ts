import { describe, expect, it } from "vitest";

import { isoDate } from "../../../lib/dealtwin/domain/date";
import {
  calculateCustomerPaymentAmounts,
  canonicalizeDealTermsV1,
  type DealTermsV1,
} from "../../../lib/dealtwin/domain/deal-terms";
import { rupiah } from "../../../lib/dealtwin/domain/money";
import { basisPoints } from "../../../lib/dealtwin/domain/rate";
import { toLegacySalesOrderInput } from "../../../lib/dealtwin/erp/legacy-sales-order-bridge";

function validTerms(): DealTermsV1 {
  return {
    schemaVersion: "dealtwin.deal-terms.v1",
    currency: "IDR",
    customerId: "customer-a",
    warehouseId: "warehouse-a",
    acceptedDate: isoDate("2026-09-16"),
    productLines: [
      { lineId: "line-b", productId: "product-b", quantity: 2, unitPriceRupiah: rupiah(250n) },
      { lineId: "line-a", productId: "product-a", quantity: 1, unitPriceRupiah: rupiah(499n) },
    ],
    customerPaymentEvents: [
      {
        eventId: "payment-deposit",
        role: "customer_deposit",
        basisPoints: basisPoints(3_333),
        daysFromAcceptance: 0,
        effectiveDate: isoDate("2026-09-16"),
        sameDayOrder: 500,
      },
      {
        eventId: "payment-balance",
        role: "customer_balance",
        basisPoints: basisPoints(6_667),
        daysFromAcceptance: 14,
        effectiveDate: isoDate("2026-09-30"),
        sameDayOrder: 500,
      },
    ],
    directCostEvents: [
      {
        eventId: "cost-b",
        role: "direct_cost",
        supplierId: "supplier-a",
        productLineIds: ["line-b", "line-a"],
        amountRupiah: rupiah(300n),
        daysFromAcceptance: 6,
        effectiveDate: isoDate("2026-09-22"),
        sameDayOrder: 300,
        orderingSource: "conservative",
        provenance: { sourceType: "judge_seed", sourceId: "cost-b", sourceRevision: "1", evidence: "Fixture quote" },
      },
      {
        eventId: "cost-a",
        role: "direct_cost",
        supplierId: null,
        productLineIds: ["line-a"],
        amountRupiah: rupiah(100n),
        daysFromAcceptance: 5,
        effectiveDate: isoDate("2026-09-21"),
        sameDayOrder: 300,
        orderingSource: "explicit",
        provenance: { sourceType: "user_confirmed", sourceId: "cost-a", sourceRevision: "0", evidence: "Confirmed direct cost" },
      },
    ],
  };
}

describe("DealTermsV1", () => {
  it("canonicalizes stable IDs and emits money as decimal strings", () => {
    const dto = canonicalizeDealTermsV1(validTerms());

    expect(dto.productLines.map((line) => line.lineId)).toEqual(["line-a", "line-b"]);
    expect(dto.productLines.map((line) => line.unitPriceRupiah)).toEqual(["499", "250"]);
    expect(dto.customerPaymentEvents.map((event) => event.role)).toEqual(["customer_deposit", "customer_balance"]);
    expect(dto.directCostEvents.map((event) => event.eventId)).toEqual(["cost-a", "cost-b"]);
    expect(dto.directCostEvents[1].productLineIds).toEqual(["line-a", "line-b"]);
    expect(dto.directCostEvents.map((event) => event.amountRupiah)).toEqual(["100", "300"]);
  });

  it("rounds the deposit down once and assigns the exact revenue remainder to balance", () => {
    const amounts = calculateCustomerPaymentAmounts(validTerms());

    expect(amounts.revenueRupiah).toBe(999n);
    expect(amounts.depositRupiah).toBe(332n);
    expect(amounts.balanceRupiah).toBe(667n);
    expect(amounts.depositRupiah + amounts.balanceRupiah).toBe(amounts.revenueRupiah);
  });

  it.each([
    ["duplicate line IDs", (terms: DealTermsV1) => ({ ...terms, productLines: [terms.productLines[0], terms.productLines[0]] })],
    ["duplicate product IDs", (terms: DealTermsV1) => ({ ...terms, productLines: [terms.productLines[0], { ...terms.productLines[1], productId: terms.productLines[0].productId }] })],
    ["duplicate event IDs", (terms: DealTermsV1) => ({ ...terms, directCostEvents: [{ ...terms.directCostEvents[0], eventId: terms.customerPaymentEvents[0].eventId }] })],
    ["fractional quantity", (terms: DealTermsV1) => ({ ...terms, productLines: [{ ...terms.productLines[0], quantity: 1.5 }] })],
    ["unsafe quantity", (terms: DealTermsV1) => ({ ...terms, productLines: [{ ...terms.productLines[0], quantity: Number.MAX_SAFE_INTEGER + 1 }] })],
    ["fractional ordering", (terms: DealTermsV1) => ({ ...terms, directCostEvents: [{ ...terms.directCostEvents[0], sameDayOrder: 1.5 }] })],
    ["payment basis points not conserved", (terms: DealTermsV1) => ({ ...terms, customerPaymentEvents: [{ ...terms.customerPaymentEvents[0], basisPoints: basisPoints(3_000) }, terms.customerPaymentEvents[1]] as const })],
    ["wrong derived date", (terms: DealTermsV1) => ({ ...terms, directCostEvents: [{ ...terms.directCostEvents[0], effectiveDate: isoDate("2026-09-23") }] })],
    ["unknown product reference", (terms: DealTermsV1) => ({ ...terms, directCostEvents: [{ ...terms.directCostEvents[0], productLineIds: ["missing-line"] }] })],
    ["empty provenance", (terms: DealTermsV1) => ({ ...terms, directCostEvents: [{ ...terms.directCostEvents[0], provenance: { ...terms.directCostEvents[0].provenance, evidence: "" } }] })],
  ] as const)("rejects %s", (_label, mutate) => {
    expect(() => canonicalizeDealTermsV1(mutate(validTerms()) as DealTermsV1)).toThrowError();
  });
});

describe("legacy Sales Order bridge", () => {
  it("returns the actual legacy SalesOrderInput shape only after complete validation", () => {
    const result = toLegacySalesOrderInput(validTerms());

    expect(result).toEqual({
      ok: true,
      value: {
        customerId: "customer-a",
        warehouseId: "warehouse-a",
        lines: [
          { productId: "product-a", quantity: 1, unitPrice: 499 },
          { productId: "product-b", quantity: 2, unitPrice: 250 },
        ],
      },
    });
  });

  it("accepts the safe-integer boundary with an exact round trip", () => {
    const terms = validTerms();
    const result = toLegacySalesOrderInput({
      ...terms,
      productLines: [{ lineId: "line-max", productId: "product-max", quantity: 1, unitPriceRupiah: rupiah(BigInt(Number.MAX_SAFE_INTEGER)) }],
      directCostEvents: [],
    });

    expect(result.ok && result.value.lines[0].unitPrice).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([
    ["unsafe unit price", [{ lineId: "line-a", productId: "product-a", quantity: 1, unitPriceRupiah: rupiah(BigInt(Number.MAX_SAFE_INTEGER) + 1n) }]],
    ["unsafe quantity", [{ lineId: "line-a", productId: "product-a", quantity: Number.MAX_SAFE_INTEGER + 1, unitPriceRupiah: rupiah(1n) }]],
    ["unsafe line product", [{ lineId: "line-a", productId: "product-a", quantity: 2, unitPriceRupiah: rupiah(BigInt(Number.MAX_SAFE_INTEGER)) }]],
    ["unsafe order total", [
      { lineId: "line-a", productId: "product-a", quantity: 1, unitPriceRupiah: rupiah(BigInt(Number.MAX_SAFE_INTEGER)) },
      { lineId: "line-b", productId: "product-b", quantity: 1, unitPriceRupiah: rupiah(1n) },
    ]],
  ] as const)("fails closed for %s without a partial value", (_label, productLines) => {
    const result = toLegacySalesOrderInput({ ...validTerms(), productLines, directCostEvents: [] });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "LEGACY_SALES_ORDER_VALUE_OUT_OF_RANGE",
        message: "Deal terms cannot be represented safely by the legacy Sales Order command.",
      },
    });
    expect("value" in result).toBe(false);
  });
});
