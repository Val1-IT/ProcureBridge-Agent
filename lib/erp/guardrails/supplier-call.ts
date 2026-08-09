import { isStrictIsoDate } from "../date-validation";
import type { PurchaseOrder, Supplier, SupplierCallApproval } from "../types";

export type SupplierCallGuardrailCode =
  | "APPROVAL_INCOMPLETE"
  | "INVALID_PHONE"
  | "DO_NOT_CONTACT"
  | "OUTSIDE_CALLING_HOURS"
  | "ALREADY_CALLED_TODAY"
  | "PURCHASE_ORDER_CLOSED"
  | "PURCHASE_ORDER_NOT_ELIGIBLE"
  | "INVALID_ORDER_DATA"
  | "OPEN_DISPUTE";

export interface SupplierCallEligibilityInput {
  supplier: Supplier;
  purchaseOrder: PurchaseOrder;
  approval: SupplierCallApproval | null;
  localTime: string;
  callsToday: number;
  openDispute: boolean;
}

export interface SupplierCallGuardrailDecision {
  allowed: boolean;
  codes: SupplierCallGuardrailCode[];
  reasons: string[];
}

function validTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}

function minutes(value: string): number | null {
  if (!validTime(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function completeApproval(approval: SupplierCallApproval | null, supplier: Supplier, purchaseOrder: PurchaseOrder): boolean {
  if (!approval || approval.status !== "approved" || !approval.approvedBy?.trim() || !approval.objective.trim()) return false;
  if (approval.supplierId !== supplier.id || approval.purchaseOrderId !== purchaseOrder.id || !approval.supplierCallId.trim()) return false;
  if (!isStrictIsoDate(approval.maximumDeliveryDate) || !approval.approvedAt || !approval.language.trim()) return false;
  if (typeof approval.partialDeliveryAllowed !== "boolean" || !Number.isFinite(approval.maximumUnitPriceIncreasePercent) || approval.maximumUnitPriceIncreasePercent < 0) return false;
  const permitted = new Set(approval.permittedProductIds);
  return approval.permittedProductIds.length > 0
    && permitted.size === approval.permittedProductIds.length
    && purchaseOrder.lines.length === permitted.size
    && purchaseOrder.lines.every((line) => permitted.has(line.productId));
}

function validOrderData(supplier: Supplier, purchaseOrder: PurchaseOrder): boolean {
  const products = new Set<string>();
  return supplier.active
    && purchaseOrder.supplierId === supplier.id
    && purchaseOrder.lines.length > 0
    && purchaseOrder.lines.every((line) => {
      const valid = Boolean(line.productId) && !products.has(line.productId) && Number.isSafeInteger(line.quantity) && line.quantity > 0 && Number.isSafeInteger(line.unitPrice) && line.unitPrice > 0;
      products.add(line.productId);
      return valid;
    });
}

export function evaluateSupplierCallEligibility(input: SupplierCallEligibilityInput): SupplierCallGuardrailDecision {
  const codes: SupplierCallGuardrailCode[] = [];
  const reasons: string[] = [];
  const block = (code: SupplierCallGuardrailCode, reason: string) => { if (!codes.includes(code)) { codes.push(code); reasons.push(reason); } };

  if (!completeApproval(input.approval, input.supplier, input.purchaseOrder)) block("APPROVAL_INCOMPLETE", "Supplier call approval is incomplete or does not match the purchase order.");
  if (!/^\+?[0-9][0-9\s-]{7,}$/.test(input.supplier.phone)) block("INVALID_PHONE", "Supplier phone number is invalid.");
  if (input.supplier.doNotContact) block("DO_NOT_CONTACT", "Supplier is marked Do Not Contact.");
  const localMinutes = minutes(input.localTime);
  if (localMinutes === null || localMinutes < 8 * 60 || localMinutes > 18 * 60) block("OUTSIDE_CALLING_HOURS", "Supplier calls are permitted only from 08:00 through 18:00 local time.");
  if (!Number.isInteger(input.callsToday) || input.callsToday >= 1) block("ALREADY_CALLED_TODAY", "This supplier has already been called for the purchase order today.");
  if (["completed", "cancelled", "rejected"].includes(input.purchaseOrder.status)) block("PURCHASE_ORDER_CLOSED", "Closed purchase orders cannot be called.");
  else if (!["sent", "confirmed", "partially_received"].includes(input.purchaseOrder.status)) block("PURCHASE_ORDER_NOT_ELIGIBLE", "The purchase order is not eligible for supplier follow-up.");
  if (!validOrderData(input.supplier, input.purchaseOrder)) block("INVALID_ORDER_DATA", "Purchase-order supplier, quantity, or price data is invalid.");
  if (input.openDispute) block("OPEN_DISPUTE", "An unresolved purchase-order dispute requires human review.");

  return { allowed: codes.length === 0, codes, reasons };
}
