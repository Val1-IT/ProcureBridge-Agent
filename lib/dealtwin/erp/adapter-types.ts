import type { DatedCashEvent } from "../domain/cash-event";
import type { IsoDate } from "../domain/date";
import type { Rupiah } from "../domain/money";
import { sha256Canonical, type CanonicalJsonValue } from "../domain/canonical-json";
import {
  erpCashAccountKey,
  erpCashMovementKey,
  erpDeliveryKey,
  erpGoodsReceiptKey,
  erpInvoiceKey,
  erpPaymentKey,
  erpPurchaseOrderKey,
  erpSalesOrderKey,
} from "./dependency-keys";

export interface SourceDependency {
  readonly key: string;
  readonly contentHash: string;
}

export interface FinancialSourceReference extends SourceDependency {
  readonly sourceType: "purchase_order" | "goods_receipt" | "supplier_invoice" | "sales_order" | "delivery_order" | "customer_invoice" | "payment" | "cash_account" | "cash_movement";
  readonly sourceId: string;
  readonly sourceRevision: string;
}

export interface NormalizedObligation {
  readonly economicEventId: string;
  readonly supplierId: string;
  readonly purchaseOrderId: string;
  readonly authority: "purchase_order" | "supplier_invoice";
  readonly dueDate: IsoDate;
  readonly sameDayOrder: 300;
  readonly amountRupiah: Rupiah;
  readonly sourceChain: readonly FinancialSourceReference[];
}

export interface NormalizedReceipt {
  readonly economicEventId: string;
  readonly customerId: string;
  readonly salesOrderId: string;
  readonly authority: "customer_invoice";
  readonly expectedDate: IsoDate;
  readonly sameDayOrder: 500;
  readonly amountRupiah: Rupiah;
  readonly sourceChain: readonly FinancialSourceReference[];
}

export interface CashPositionEvidence {
  readonly accountId: string;
  readonly asOfDate: IsoDate;
  readonly openingBalanceRupiah: Rupiah;
  readonly openingSource: FinancialSourceReference;
  readonly confirmedMovements: readonly DatedCashEvent[];
  readonly dependencies: readonly SourceDependency[];
}

export function sourceDependencyKey(sourceType: FinancialSourceReference["sourceType"], sourceId: string): string {
  switch (sourceType) {
    case "purchase_order":
      return erpPurchaseOrderKey(sourceId);
    case "goods_receipt":
      return erpGoodsReceiptKey(sourceId);
    case "supplier_invoice":
    case "customer_invoice":
      return erpInvoiceKey(sourceId);
    case "sales_order":
      return erpSalesOrderKey(sourceId);
    case "delivery_order":
      return erpDeliveryKey(sourceId);
    case "payment":
      return erpPaymentKey(sourceId);
    case "cash_account":
      return erpCashAccountKey(sourceId);
    case "cash_movement":
      return erpCashMovementKey(sourceId);
  }
}

export function createFinancialSourceReference(
  sourceType: FinancialSourceReference["sourceType"],
  sourceId: string,
  sourceRevision: string,
  material: CanonicalJsonValue,
): FinancialSourceReference {
  return {
    sourceType,
    sourceId,
    sourceRevision,
    key: sourceDependencyKey(sourceType, sourceId),
    contentHash: sha256Canonical(material),
  };
}
