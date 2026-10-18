import { addCalendarDays, isoDate, type IsoDate } from "./date";
import { formatRupiahDto, rupiah, type Rupiah } from "./money";
import { applyRateFloor } from "./rate";
import type { BasisPoints } from "./rate";

export type OrderingSource = "explicit" | "conservative" | "unresolved";

export interface SourceProvenance {
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly evidence: string;
}

export interface DealProductLine {
  readonly lineId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitPriceRupiah: Rupiah;
}

export interface CustomerDepositEvent {
  readonly eventId: string;
  readonly role: "customer_deposit";
  readonly basisPoints: BasisPoints;
  readonly daysFromAcceptance: 0;
  readonly effectiveDate: IsoDate;
  readonly sameDayOrder: number;
}

export interface CustomerBalanceEvent {
  readonly eventId: string;
  readonly role: "customer_balance";
  readonly basisPoints: BasisPoints;
  readonly daysFromAcceptance: number;
  readonly effectiveDate: IsoDate;
  readonly sameDayOrder: number;
}

export interface DirectCostEvent {
  readonly eventId: string;
  readonly role: "direct_cost";
  readonly supplierId: string | null;
  readonly productLineIds: readonly string[];
  readonly amountRupiah: Rupiah;
  readonly daysFromAcceptance: number;
  readonly effectiveDate: IsoDate;
  readonly sameDayOrder: number;
  readonly orderingSource: OrderingSource;
  readonly provenance: SourceProvenance;
}

export interface DealTermsV1 {
  readonly schemaVersion: "dealtwin.deal-terms.v1";
  readonly currency: "IDR";
  readonly customerId: string;
  readonly warehouseId: string;
  readonly acceptedDate: IsoDate;
  readonly productLines: readonly DealProductLine[];
  readonly customerPaymentEvents: readonly [CustomerDepositEvent, CustomerBalanceEvent];
  readonly directCostEvents: readonly DirectCostEvent[];
}

export interface DealTermsV1Dto extends Omit<DealTermsV1, "productLines" | "directCostEvents"> {
  readonly productLines: readonly (Omit<DealProductLine, "unitPriceRupiah"> & { readonly unitPriceRupiah: string })[];
  readonly directCostEvents: readonly (Omit<DirectCostEvent, "amountRupiah" | "productLineIds" | "provenance"> & {
    readonly amountRupiah: string;
    readonly productLineIds: readonly string[];
    readonly provenance: Readonly<SourceProvenance>;
  })[];
}

export interface CustomerPaymentAmounts {
  readonly revenueRupiah: Rupiah;
  readonly depositRupiah: Rupiah;
  readonly balanceRupiah: Rupiah;
}

function requireText(value: string, label: string): void {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be a non-empty canonical string.`);
  }
}

function requireSafeInteger(value: number, label: string, positive = false): void {
  if (!Number.isSafeInteger(value) || (positive ? value <= 0 : value < 0)) {
    throw new Error(`${label} must be a ${positive ? "positive" : "non-negative"} safe integer.`);
  }
}

function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must be unique.`);
  }
}

function compareCanonicalText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateTerms(terms: DealTermsV1): void {
  if (terms.schemaVersion !== "dealtwin.deal-terms.v1" || terms.currency !== "IDR") {
    throw new Error("Deal terms schema and currency must match DealTermsV1.");
  }
  requireText(terms.customerId, "Customer ID");
  requireText(terms.warehouseId, "Warehouse ID");
  isoDate(terms.acceptedDate);
  if (terms.productLines.length === 0) throw new Error("Deal terms require at least one product line.");

  const lineIds = terms.productLines.map((line) => line.lineId);
  const productIds = terms.productLines.map((line) => line.productId);
  requireUnique(lineIds, "Product line IDs");
  requireUnique(productIds, "Product IDs");
  for (const line of terms.productLines) {
    requireText(line.lineId, "Product line ID");
    requireText(line.productId, "Product ID");
    requireSafeInteger(line.quantity, "Product quantity", true);
    if (typeof line.unitPriceRupiah !== "bigint" || line.unitPriceRupiah <= 0n) {
      throw new Error("Product unit price must be positive whole rupiah.");
    }
  }

  const [deposit, balance] = terms.customerPaymentEvents;
  if (!deposit || !balance || terms.customerPaymentEvents.length !== 2) {
    throw new Error("Customer payments must contain the deposit and balance tuple.");
  }
  if (deposit.role !== "customer_deposit" || balance.role !== "customer_balance") {
    throw new Error("Customer payment roles must be deposit then balance.");
  }
  for (const event of terms.customerPaymentEvents) {
    requireText(event.eventId, "Customer payment event ID");
    requireSafeInteger(event.basisPoints, "Customer payment basis points");
    if (event.basisPoints > 10_000) throw new Error("Customer payment basis points cannot exceed 10000.");
    requireSafeInteger(event.daysFromAcceptance, "Customer payment day offset");
    requireSafeInteger(event.sameDayOrder, "Customer payment same-day order");
    isoDate(event.effectiveDate);
    if (event.effectiveDate !== addCalendarDays(terms.acceptedDate, event.daysFromAcceptance)) {
      throw new Error("Customer payment effective date must match its acceptance offset.");
    }
  }
  if (deposit.daysFromAcceptance !== 0 || deposit.effectiveDate !== terms.acceptedDate) {
    throw new Error("Customer deposit must occur on the acceptance date.");
  }
  if (deposit.basisPoints + balance.basisPoints !== 10_000) {
    throw new Error("Customer deposit and balance must total 10000 basis points.");
  }

  const eventIds = [...terms.customerPaymentEvents.map((event) => event.eventId), ...terms.directCostEvents.map((event) => event.eventId)];
  requireUnique(eventIds, "Deal event IDs");
  const knownLineIds = new Set(lineIds);
  for (const event of terms.directCostEvents) {
    requireText(event.eventId, "Direct-cost event ID");
    if (event.role !== "direct_cost") throw new Error("Direct-cost event role is invalid.");
    if (event.supplierId !== null) requireText(event.supplierId, "Supplier ID");
    if (event.productLineIds.length === 0) throw new Error("Direct-cost event must reference at least one product line.");
    requireUnique(event.productLineIds, "Direct-cost product line references");
    if (event.productLineIds.some((lineId) => !knownLineIds.has(lineId))) {
      throw new Error("Direct-cost event references an unknown product line.");
    }
    if (typeof event.amountRupiah !== "bigint" || event.amountRupiah <= 0n) {
      throw new Error("Direct-cost amount must be positive whole rupiah.");
    }
    requireSafeInteger(event.daysFromAcceptance, "Direct-cost day offset");
    requireSafeInteger(event.sameDayOrder, "Direct-cost same-day order");
    isoDate(event.effectiveDate);
    if (event.effectiveDate !== addCalendarDays(terms.acceptedDate, event.daysFromAcceptance)) {
      throw new Error("Direct-cost effective date must match its acceptance offset.");
    }
    if (!["explicit", "conservative", "unresolved"].includes(event.orderingSource)) {
      throw new Error("Direct-cost ordering source is invalid.");
    }
    requireText(event.provenance.sourceType, "Provenance source type");
    requireText(event.provenance.sourceId, "Provenance source ID");
    requireText(event.provenance.evidence, "Provenance evidence");
    if (!/^(?:0|[1-9]\d*)$/.test(event.provenance.sourceRevision)) {
      throw new Error("Provenance source revision must be a canonical non-negative integer.");
    }
  }
}

export function canonicalizeDealTermsV1(terms: DealTermsV1): DealTermsV1Dto {
  validateTerms(terms);
  return {
    schemaVersion: terms.schemaVersion,
    currency: terms.currency,
    customerId: terms.customerId,
    warehouseId: terms.warehouseId,
    acceptedDate: terms.acceptedDate,
    productLines: [...terms.productLines]
      .sort((left, right) => compareCanonicalText(left.lineId, right.lineId))
      .map((line) => ({ ...line, unitPriceRupiah: formatRupiahDto(line.unitPriceRupiah) })),
    customerPaymentEvents: [
      { ...terms.customerPaymentEvents[0] },
      { ...terms.customerPaymentEvents[1] },
    ],
    directCostEvents: [...terms.directCostEvents]
      .sort((left, right) => compareCanonicalText(left.eventId, right.eventId))
      .map((event) => ({
        ...event,
        productLineIds: [...event.productLineIds].sort(),
        amountRupiah: formatRupiahDto(event.amountRupiah),
        provenance: { ...event.provenance },
      })),
  };
}

export function calculateCustomerPaymentAmounts(terms: DealTermsV1): CustomerPaymentAmounts {
  validateTerms(terms);
  const revenueRupiah = rupiah(
    terms.productLines.reduce((total, line) => total + BigInt(line.quantity) * line.unitPriceRupiah, 0n),
  );
  const depositRupiah = applyRateFloor(revenueRupiah, terms.customerPaymentEvents[0].basisPoints);
  return {
    revenueRupiah,
    depositRupiah,
    balanceRupiah: rupiah(revenueRupiah - depositRupiah),
  };
}
