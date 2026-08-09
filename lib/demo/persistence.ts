import type { DemoState } from "../domain/types";
import type { ErpState } from "../erp/types";
import { createErpSeedState } from "../erp/seed";
import { createSeedState } from "./seed";

export const DEMO_SCHEMA_VERSION = 3;
export const DEMO_STORAGE_KEY = "arvanta-distributor-mini-erp-demo-v3";
export const LEGACY_DEMO_STORAGE_KEY = "arvanta-procurebridge-demo-v2";
export type DemoRecoveryReason = "INVALID_JSON" | "INVALID_SCHEMA" | null;

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function isArrayField(value: Record<string, unknown>, field: string): boolean { return Array.isArray(value[field]); }

function hasValidLegacyCollections(value: Record<string, unknown>): boolean {
  return ["customers", "invoices", "calls", "approvals", "pendingResults", "paymentCommitments", "disputes", "auditLogs"].every((field) => isArrayField(value, field))
    && isRecord(value.demo);
}

const erpRoles = ["admin", "procurement", "warehouse", "sales", "finance", "approver"];
const purchaseOrderStatuses = ["draft", "pending_approval", "sent", "confirmed", "partially_received", "fully_received", "completed", "rejected", "cancelled"];
const salesOrderStatuses = ["draft", "confirmed", "partially_delivered", "fully_delivered", "invoiced", "completed", "cancelled"];
const invoiceStatuses = ["unpaid", "partially_paid", "paid", "cancelled"];
const hasString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const hasNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const hasFields = (value: unknown, fields: string[]): value is Record<string, unknown> => isRecord(value) && fields.every((field) => hasString(value[field]));
const includes = (values: string[], value: unknown): boolean => typeof value === "string" && values.includes(value);
const hasQuantityLine = (value: unknown): boolean => hasFields(value, ["productId"]) && hasNumber(value.quantity) && hasNumber(value.unitPrice);
const hasQuantityLines = (value: unknown): boolean => Array.isArray(value) && value.every(hasQuantityLine);
const hasEntityDates = (value: unknown): value is Record<string, unknown> => hasFields(value, ["id", "createdAt", "updatedAt"]);
const hasOptionalLink = (value: Record<string, unknown>, field: string, ids: Set<unknown>): boolean => Object.hasOwn(value, field) && (value[field] === null || (hasString(value[field]) && ids.has(value[field])));

function hasValidErpCollections(value: unknown): value is ErpState {
  if (!isRecord(value) || !hasNumber(value.revision) || !includes(erpRoles, value.activeRole)) return false;
  const arrays = ["products", "suppliers", "customers", "warehouses", "purchaseRequests", "purchaseOrders", "goodsReceipts", "salesOrders", "deliveryOrders", "supplierInvoices", "customerInvoices", "payments", "stockMovements", "supplierCalls", "supplierApprovals", "supplierResults", "disputes", "followUps", "auditLogs"];
  if (!arrays.every((field) => isArrayField(value, field))) return false;
  const products = value.products as unknown[];
  const suppliers = value.suppliers as unknown[];
  const customers = value.customers as unknown[];
  const warehouses = value.warehouses as unknown[];
  if (!products.every((item) => hasEntityDates(item) && hasFields(item, ["sku", "name", "unit"]) && hasNumber(item.salePrice) && hasNumber(item.purchasePrice) && hasNumber(item.reorderPoint) && typeof item.active === "boolean")) return false;
  if (!suppliers.every((item) => hasEntityDates(item) && hasFields(item, ["code", "name", "phone", "email", "address"]) && hasNumber(item.paymentTermDays) && typeof item.doNotContact === "boolean" && typeof item.active === "boolean")) return false;
  if (!customers.every((item) => hasEntityDates(item) && hasFields(item, ["code", "name", "contactName", "phone", "email", "address"]) && hasNumber(item.creditLimit) && typeof item.active === "boolean")) return false;
  if (!warehouses.every((item) => hasEntityDates(item) && hasFields(item, ["code", "name", "address"]) && typeof item.active === "boolean")) return false;
  const productIds = new Set(products.map((item) => (item as Record<string, unknown>).id));
  const supplierIds = new Set(suppliers.map((item) => (item as Record<string, unknown>).id));
  const customerIds = new Set(customers.map((item) => (item as Record<string, unknown>).id));
  const warehouseIds = new Set(warehouses.map((item) => (item as Record<string, unknown>).id));
  const validLines = (lines: unknown): boolean => hasQuantityLines(lines) && (lines as Record<string, unknown>[]).every((line) => productIds.has(line.productId));
  if (!(value.purchaseRequests as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["requestNumber", "requesterRole"]) && includes(erpRoles, item.requesterRole) && includes(["draft", "submitted", "approved", "rejected", "cancelled"], item.status) && validLines(item.lines))) return false;
  const purchaseRequestIds = new Set((value.purchaseRequests as Record<string, unknown>[]).map((item) => item.id));
  if (!(value.purchaseOrders as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["orderNumber", "supplierId", "warehouseId"]) && supplierIds.has(item.supplierId) && warehouseIds.has(item.warehouseId) && includes(purchaseOrderStatuses, item.status) && hasOptionalLink(item, "purchaseRequestId", purchaseRequestIds) && (item.confirmationDueAt === null || hasString(item.confirmationDueAt)) && (item.promisedDeliveryDate === null || hasString(item.promisedDeliveryDate)) && validLines(item.lines))) return false;
  const openPurchaseOrderIds = new Set((value.purchaseOrders as Record<string, unknown>[]).map((item) => item.id));
  if (!(value.goodsReceipts as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["receiptNumber", "purchaseOrderId", "warehouseId"]) && openPurchaseOrderIds.has(item.purchaseOrderId) && warehouseIds.has(item.warehouseId) && includes(["draft", "posted", "cancelled"], item.status) && validLines(item.lines))) return false;
  if (!(value.salesOrders as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["orderNumber", "customerId", "warehouseId"]) && customerIds.has(item.customerId) && warehouseIds.has(item.warehouseId) && includes(salesOrderStatuses, item.status) && Array.isArray(item.lines) && item.lines.every((line) => hasQuantityLine(line) && hasNumber(line.reservedQuantity) && hasNumber(line.deliveredQuantity) && productIds.has(line.productId)))) return false;
  const salesOrderIds = new Set((value.salesOrders as Record<string, unknown>[]).map((item) => item.id));
  if (!(value.deliveryOrders as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["deliveryNumber", "salesOrderId", "warehouseId"]) && salesOrderIds.has(item.salesOrderId) && warehouseIds.has(item.warehouseId) && includes(["draft", "posted", "cancelled"], item.status) && validLines(item.lines))) return false;
  const hasInvoiceLinks = (item: Record<string, unknown>): boolean => hasOptionalLink(item, "purchaseOrderId", openPurchaseOrderIds) && hasOptionalLink(item, "salesOrderId", salesOrderIds) && hasOptionalLink(item, "supplierId", supplierIds) && hasOptionalLink(item, "customerId", customerIds);
  if (!(value.supplierInvoices as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["invoiceNumber", "dueDate", "supplierId"]) && supplierIds.has(item.supplierId) && item.customerId === null && hasInvoiceLinks(item) && includes(invoiceStatuses, item.status) && validLines(item.lines))) return false;
  if (!(value.customerInvoices as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["invoiceNumber", "dueDate", "customerId"]) && customerIds.has(item.customerId) && item.supplierId === null && hasInvoiceLinks(item) && includes(invoiceStatuses, item.status) && validLines(item.lines))) return false;
  const supplierInvoiceIds = new Set((value.supplierInvoices as Record<string, unknown>[]).map((item) => item.id));
  const customerInvoiceIds = new Set((value.customerInvoices as Record<string, unknown>[]).map((item) => item.id));
  if (!(value.payments as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["paymentNumber", "invoiceId", "paymentDate"]) && hasNumber(item.amount) && includes(["payable", "receivable"], item.direction) && (item.direction !== "payable" || supplierInvoiceIds.has(item.invoiceId)) && (item.direction !== "receivable" || customerInvoiceIds.has(item.invoiceId)) && includes(["posted", "cancelled"], item.status))) return false;
  if (!(value.stockMovements as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["productId", "warehouseId", "sourceType", "sourceId"]) && productIds.has(item.productId) && warehouseIds.has(item.warehouseId) && hasNumber(item.quantity) && includes(["in", "out", "adjustment"], item.direction) && includes(["seed", "goods_receipt", "delivery_order", "adjustment"], item.sourceType))) return false;
  if (!(value.supplierCalls as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["supplierId", "purchaseOrderId", "scenario"]) && supplierIds.has(item.supplierId) && openPurchaseOrderIds.has(item.purchaseOrderId) && includes(["draft", "active", "completed", "failed"], item.status) && includes(["delivery_commitment", "partial_delivery", "stock_unavailable", "price_discrepancy", "failed_contact"], item.scenario))) return false;
  const supplierCallIds = new Set((value.supplierCalls as Record<string, unknown>[]).map((item) => item.id));
  if (!(value.supplierApprovals as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["supplierCallId", "supplierId", "purchaseOrderId"]) && supplierCallIds.has(item.supplierCallId) && supplierIds.has(item.supplierId) && openPurchaseOrderIds.has(item.purchaseOrderId) && includes(["pending", "approved", "rejected"], item.status) && (item.approvedBy === null || hasString(item.approvedBy)))) return false;
  if (!(value.supplierResults as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["supplierCallId", "supplierId", "purchaseOrderId", "scenario"]) && supplierCallIds.has(item.supplierCallId) && supplierIds.has(item.supplierId) && openPurchaseOrderIds.has(item.purchaseOrderId) && includes(["pending", "approved", "rejected", "human_review"], item.status) && includes(["delivery_commitment", "partial_delivery", "stock_unavailable", "price_discrepancy", "failed_contact"], item.scenario) && (item.promisedDeliveryDate === null || hasString(item.promisedDeliveryDate)))) return false;
  if (!(value.disputes as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["reason"]) && includes(["open", "investigating", "resolved", "cancelled"], item.status))) return false;
  if (!(value.followUps as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["dueAt", "reason"]) && includes(["open", "completed", "cancelled"], item.status))) return false;
  return (value.auditLogs as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["entityType", "entityId", "action", "actorRole", "actorId"]) && (includes(erpRoles, item.actorRole) || item.actorRole === "system") && isRecord(item.detail));
}

export function migrateDemoState(value: unknown): DemoState | null {
  if (!isRecord(value) || !hasValidLegacyCollections(value)) return null;
  if (value.schemaVersion === 2) return { ...(value as Omit<DemoState, "erp" | "schemaVersion">), schemaVersion: DEMO_SCHEMA_VERSION, erp: createErpSeedState() };
  if (value.schemaVersion === DEMO_SCHEMA_VERSION && hasValidErpCollections(value.erp)) return value as unknown as DemoState;
  return null;
}

export function loadDemoState(value: string | null): { state: DemoState; recoveryReason: DemoRecoveryReason } {
  if (!value) return { state: createSeedState(), recoveryReason: null };
  try {
    const state = migrateDemoState(JSON.parse(value));
    return state ? { state, recoveryReason: null } : { state: createSeedState(), recoveryReason: "INVALID_SCHEMA" };
  } catch {
    return { state: createSeedState(), recoveryReason: "INVALID_JSON" };
  }
}

export function loadDemoStateFromStorage(storage: Pick<Storage, "getItem">): { state: DemoState; recoveryReason: DemoRecoveryReason } {
  const current = storage.getItem(DEMO_STORAGE_KEY);
  return loadDemoState(current ?? storage.getItem(LEGACY_DEMO_STORAGE_KEY));
}

export function serializeDemoState(state: DemoState): string { return JSON.stringify(state); }
export function deserializeDemoState(value: string | null): DemoState { return loadDemoState(value).state; }
