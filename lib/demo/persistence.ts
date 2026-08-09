import type { DemoState } from "../domain/types";
import type { ErpState } from "../erp/types";
import { createErpSeedState } from "../erp/seed";
import { createSeedState } from "./seed";

export const DEMO_SCHEMA_VERSION = 5;
export const DEMO_STORAGE_KEY = "arvanta-distributor-mini-erp-demo-v5";
export const PREVIOUS_DEMO_STORAGE_KEY = "arvanta-distributor-mini-erp-demo-v4";
export const V3_DEMO_STORAGE_KEY = "arvanta-distributor-mini-erp-demo-v3";
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
const hasRfqLine = (value: unknown): boolean => hasFields(value, ["productId"]) && hasNumber(value.quantity);
const hasRfqLines = (value: unknown): boolean => Array.isArray(value) && value.every(hasRfqLine);
const hasEntityDates = (value: unknown): value is Record<string, unknown> => hasFields(value, ["id", "createdAt", "updatedAt"]);
const hasOptionalLink = (value: Record<string, unknown>, field: string, ids: Set<unknown>): boolean => Object.hasOwn(value, field) && (value[field] === null || (hasString(value[field]) && ids.has(value[field])));

function hasValidErpCollections(value: unknown): value is ErpState {
  if (!isRecord(value) || !hasNumber(value.revision) || !includes(erpRoles, value.activeRole)) return false;
  const arrays = ["products", "suppliers", "customers", "warehouses", "purchaseRequests", "requestForQuotations", "supplierQuotations", "purchaseOrders", "goodsReceipts", "salesOrders", "deliveryOrders", "supplierInvoices", "customerInvoices", "payments", "stockMovements", "stockAdjustments", "supplierCalls", "supplierApprovals", "supplierResults", "disputes", "followUps", "auditLogs"];
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
  const validRfqLines = (lines: unknown): boolean => hasRfqLines(lines) && (lines as Record<string, unknown>[]).every((line) => productIds.has(line.productId));
  if (!(value.purchaseRequests as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["requestNumber", "requesterRole"]) && includes(erpRoles, item.requesterRole) && includes(["draft", "submitted", "approved", "rejected", "cancelled"], item.status) && validLines(item.lines))) return false;
  const purchaseRequestIds = new Set((value.purchaseRequests as Record<string, unknown>[]).map((item) => item.id));
  const requestForQuotations = value.requestForQuotations as Record<string, unknown>[];
  if (!requestForQuotations.every((item) => hasEntityDates(item) && hasFields(item, ["rfqNumber", "warehouseId", "quoteDueAt"]) && warehouseIds.has(item.warehouseId) && hasOptionalLink(item, "purchaseRequestId", purchaseRequestIds) && Array.isArray(item.requestedSupplierIds) && item.requestedSupplierIds.length > 0 && item.requestedSupplierIds.every((supplierId) => supplierIds.has(supplierId)) && new Set(item.requestedSupplierIds).size === item.requestedSupplierIds.length && (item.selectedQuotationId === null || hasString(item.selectedQuotationId)) && includes(["open", "compared", "selected", "cancelled"], item.status) && validRfqLines(item.lines))) return false;
  const rfqIds = new Set(requestForQuotations.map((item) => item.id));
  const rfqById = new Map(requestForQuotations.map((item) => [item.id, item]));
  const supplierQuotations = value.supplierQuotations as Record<string, unknown>[];
  if (!supplierQuotations.every((item) => {
    const rfq = hasString(item.requestForQuotationId) ? rfqById.get(item.requestForQuotationId) : undefined;
    return hasEntityDates(item) && hasFields(item, ["quotationNumber", "requestForQuotationId", "supplierId", "validUntil"]) && rfqIds.has(item.requestForQuotationId) && supplierIds.has(item.supplierId) && Array.isArray(rfq?.requestedSupplierIds) && rfq.requestedSupplierIds.includes(item.supplierId) && includes(["submitted", "selected", "rejected"], item.status) && validLines(item.lines) && validRfqQuotationLines(rfq?.lines, item.lines);
  })) return false;
  const quotationIds = new Set(supplierQuotations.map((item) => item.id));
  const quotationById = new Map(supplierQuotations.map((item) => [item.id, item]));
  if (!requestForQuotations.every((item) => {
    if (item.status !== "selected") return item.selectedQuotationId === null;
    const selectedQuotation = hasString(item.selectedQuotationId) ? quotationById.get(item.selectedQuotationId) : undefined;
    return selectedQuotation?.status === "selected" && selectedQuotation.requestForQuotationId === item.id;
  })) return false;
  if (!supplierQuotations.every((item) => item.status !== "selected" || (rfqById.get(item.requestForQuotationId)?.status === "selected" && rfqById.get(item.requestForQuotationId)?.selectedQuotationId === item.id))) return false;
  const purchaseOrders = value.purchaseOrders as Record<string, unknown>[];
  if (!purchaseOrders.every((item) => hasEntityDates(item) && hasFields(item, ["orderNumber", "supplierId", "warehouseId"]) && supplierIds.has(item.supplierId) && warehouseIds.has(item.warehouseId) && includes(purchaseOrderStatuses, item.status) && hasOptionalLink(item, "purchaseRequestId", purchaseRequestIds) && hasOptionalLink(item, "supplierQuotationId", quotationIds) && (item.confirmationDueAt === null || hasString(item.confirmationDueAt)) && (item.promisedDeliveryDate === null || hasString(item.promisedDeliveryDate)) && validLines(item.lines))) return false;
  if (!purchaseOrders.every((purchaseOrder) => {
    if (purchaseOrder.supplierQuotationId === null) return true;
    const quotation = hasString(purchaseOrder.supplierQuotationId) ? quotationById.get(purchaseOrder.supplierQuotationId) : undefined;
    const rfq = quotation ? rfqById.get(quotation.requestForQuotationId) : undefined;
    return quotation?.status === "selected" && rfq?.status === "selected" && rfq.selectedQuotationId === quotation.id && quotation.supplierId === purchaseOrder.supplierId && rfq.purchaseRequestId === purchaseOrder.purchaseRequestId && rfq.warehouseId === purchaseOrder.warehouseId && validRfqQuotationLines(purchaseOrder.lines, quotation.lines);
  })) return false;
  const openPurchaseOrderIds = new Set(purchaseOrders.map((item) => item.id));
  const purchaseOrderById = new Map(purchaseOrders.map((item) => [item.id, item]));
  const goodsReceipts = value.goodsReceipts as Record<string, unknown>[];
  if (!goodsReceipts.every((item) => {
    const purchaseOrder = hasString(item.purchaseOrderId) ? purchaseOrderById.get(item.purchaseOrderId) : undefined;
    return hasEntityDates(item) && hasFields(item, ["receiptNumber", "purchaseOrderId", "warehouseId"]) && openPurchaseOrderIds.has(item.purchaseOrderId) && warehouseIds.has(item.warehouseId) && purchaseOrder?.warehouseId === item.warehouseId && includes(["draft", "approved", "posted", "cancelled"], item.status) && validLines(item.lines) && receiptProductsBelongToOrder(purchaseOrder?.lines, item.lines);
  })) return false;
  const goodsReceiptById = new Map(goodsReceipts.map((item) => [item.id, item]));
  if (!(value.salesOrders as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["orderNumber", "customerId", "warehouseId"]) && customerIds.has(item.customerId) && warehouseIds.has(item.warehouseId) && includes(salesOrderStatuses, item.status) && Array.isArray(item.lines) && item.lines.every((line) => hasQuantityLine(line) && hasNumber(line.reservedQuantity) && hasNumber(line.deliveredQuantity) && productIds.has(line.productId)))) return false;
  const salesOrderIds = new Set((value.salesOrders as Record<string, unknown>[]).map((item) => item.id));
  if (!(value.deliveryOrders as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["deliveryNumber", "salesOrderId", "warehouseId"]) && salesOrderIds.has(item.salesOrderId) && warehouseIds.has(item.warehouseId) && includes(["draft", "posted", "cancelled"], item.status) && validLines(item.lines))) return false;
  const hasInvoiceLinks = (item: Record<string, unknown>): boolean => hasOptionalLink(item, "purchaseOrderId", openPurchaseOrderIds) && hasOptionalLink(item, "salesOrderId", salesOrderIds) && hasOptionalLink(item, "supplierId", supplierIds) && hasOptionalLink(item, "customerId", customerIds);
  if (!(value.supplierInvoices as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["invoiceNumber", "dueDate", "supplierId"]) && supplierIds.has(item.supplierId) && item.customerId === null && hasInvoiceLinks(item) && includes(invoiceStatuses, item.status) && validLines(item.lines))) return false;
  if (!(value.customerInvoices as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["invoiceNumber", "dueDate", "customerId"]) && customerIds.has(item.customerId) && item.supplierId === null && hasInvoiceLinks(item) && includes(invoiceStatuses, item.status) && validLines(item.lines))) return false;
  const supplierInvoiceIds = new Set((value.supplierInvoices as Record<string, unknown>[]).map((item) => item.id));
  const customerInvoiceIds = new Set((value.customerInvoices as Record<string, unknown>[]).map((item) => item.id));
  if (!(value.payments as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["paymentNumber", "invoiceId", "paymentDate"]) && hasNumber(item.amount) && includes(["payable", "receivable"], item.direction) && (item.direction !== "payable" || supplierInvoiceIds.has(item.invoiceId)) && (item.direction !== "receivable" || customerInvoiceIds.has(item.invoiceId)) && includes(["posted", "cancelled"], item.status))) return false;
  const stockAdjustments = value.stockAdjustments as Record<string, unknown>[];
  if (!stockAdjustments.every((item) => hasEntityDates(item) && hasFields(item, ["adjustmentNumber", "productId", "warehouseId", "reason", "proposedByRole"]) && productIds.has(item.productId) && warehouseIds.has(item.warehouseId) && includes(erpRoles, item.proposedByRole) && hasNumber(item.quantityDelta) && Number.isInteger(item.quantityDelta) && item.quantityDelta !== 0 && includes(["pending", "approved", "rejected"], item.status) && (item.approvedByRole === null || includes(erpRoles, item.approvedByRole)) && (item.approvedAt === null || hasString(item.approvedAt)) && (item.status !== "approved" || (includes(erpRoles, item.approvedByRole) && item.approvedByRole !== item.proposedByRole && hasString(item.approvedAt))))) return false;
  const stockAdjustmentById = new Map(stockAdjustments.map((item) => [item.id, item]));
  const deliveryOrderById = new Map((value.deliveryOrders as Record<string, unknown>[]).map((item) => [item.id, item]));
  const stockMovements = value.stockMovements as Record<string, unknown>[];
  if (new Set(stockMovements.map((item) => item.id)).size !== stockMovements.length) return false;
  if (!stockMovements.every((item) => {
    if (!(hasEntityDates(item) && hasFields(item, ["productId", "warehouseId", "sourceType", "sourceId", "actorRole", "actorId"]) && productIds.has(item.productId) && warehouseIds.has(item.warehouseId) && hasNumber(item.quantity) && item.quantity !== 0 && includes(["in", "out", "adjustment"], item.direction) && includes(["seed", "goods_receipt", "delivery_order", "adjustment"], item.sourceType) && (includes(erpRoles, item.actorRole) || item.actorRole === "system") && (item.reason === null || typeof item.reason === "string"))) return false;
    if (item.direction !== "adjustment" && item.quantity <= 0) return false;
    if (item.sourceType === "seed") return item.actorRole === "system";
    if (item.sourceType === "goods_receipt") { const receipt = goodsReceiptById.get(item.sourceId); return receipt?.warehouseId === item.warehouseId && ["approved", "posted"].includes(String(receipt?.status)); }
    if (item.sourceType === "delivery_order") { const delivery = deliveryOrderById.get(item.sourceId); return delivery?.warehouseId === item.warehouseId && delivery?.status === "posted"; }
    const adjustment = stockAdjustmentById.get(item.sourceId);
    return item.direction === "adjustment" && adjustment?.status === "approved" && adjustment.productId === item.productId && adjustment.warehouseId === item.warehouseId && adjustment.quantityDelta === item.quantity && adjustment.reason === item.reason && adjustment.approvedByRole === item.actorRole && item.actorId === `role:${String(item.actorRole)}`;
  })) return false;
  if (!goodsReceipts.every((receipt) => {
    const postings = stockMovements.filter((movement) => movement.sourceType === "goods_receipt" && movement.sourceId === receipt.id);
    if (receipt.status !== "approved" && receipt.status !== "posted") return postings.length === 0;
    const lines = receipt.lines as Record<string, unknown>[];
    return postings.length === lines.length && lines.every((line) => postings.filter((movement) => movement.productId === line.productId && movement.warehouseId === receipt.warehouseId && movement.direction === "in" && movement.quantity === line.quantity && ["admin", "warehouse", "approver"].includes(String(movement.actorRole)) && movement.actorId === `role:${String(movement.actorRole)}` && hasString(movement.reason)).length === 1);
  })) return false;
  if (!stockAdjustments.every((adjustment) => {
    const postings = stockMovements.filter((movement) => movement.sourceType === "adjustment" && movement.sourceId === adjustment.id);
    return adjustment.status === "approved" ? postings.length === 1 : postings.length === 0;
  })) return false;
  if (!(value.supplierCalls as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["supplierId", "purchaseOrderId", "scenario"]) && supplierIds.has(item.supplierId) && openPurchaseOrderIds.has(item.purchaseOrderId) && includes(["draft", "active", "completed", "failed"], item.status) && includes(["delivery_commitment", "partial_delivery", "stock_unavailable", "price_discrepancy", "failed_contact"], item.scenario))) return false;
  const supplierCallIds = new Set((value.supplierCalls as Record<string, unknown>[]).map((item) => item.id));
  if (!(value.supplierApprovals as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["supplierCallId", "supplierId", "purchaseOrderId"]) && supplierCallIds.has(item.supplierCallId) && supplierIds.has(item.supplierId) && openPurchaseOrderIds.has(item.purchaseOrderId) && includes(["pending", "approved", "rejected"], item.status) && (item.approvedBy === null || hasString(item.approvedBy)))) return false;
  if (!(value.supplierResults as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["supplierCallId", "supplierId", "purchaseOrderId", "scenario"]) && supplierCallIds.has(item.supplierCallId) && supplierIds.has(item.supplierId) && openPurchaseOrderIds.has(item.purchaseOrderId) && includes(["pending", "approved", "rejected", "human_review"], item.status) && includes(["delivery_commitment", "partial_delivery", "stock_unavailable", "price_discrepancy", "failed_contact"], item.scenario) && (item.promisedDeliveryDate === null || hasString(item.promisedDeliveryDate)))) return false;
  if (!(value.disputes as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["reason"]) && includes(["open", "investigating", "resolved", "cancelled"], item.status))) return false;
  if (!(value.followUps as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["dueAt", "reason"]) && includes(["open", "completed", "cancelled"], item.status) && includes(["pending", "approved"], item.approvalStatus) && (item.approvedBy === null || hasString(item.approvedBy)) && (item.approvalStatus !== "approved" || hasString(item.approvedBy)))) return false;
  return (value.auditLogs as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["entityType", "entityId", "action", "actorRole", "actorId"]) && (includes(erpRoles, item.actorRole) || item.actorRole === "system") && isRecord(item.detail));
}

export function migrateDemoState(value: unknown): DemoState | null {
  if (!isRecord(value) || !hasValidLegacyCollections(value)) return null;
  if (value.schemaVersion === 2) return { ...(value as Omit<DemoState, "erp" | "schemaVersion">), schemaVersion: DEMO_SCHEMA_VERSION, erp: createErpSeedState() };
  if (value.schemaVersion === 3) {
    const erp = migrateErpV4(migrateErpV3(value.erp));
    return erp && hasValidErpCollections(erp) ? { ...(value as Omit<DemoState, "erp" | "schemaVersion">), schemaVersion: DEMO_SCHEMA_VERSION, erp } : null;
  }
  if (value.schemaVersion === 4) {
    const erp = migrateErpV4(value.erp);
    return erp && hasValidErpCollections(erp) ? { ...(value as Omit<DemoState, "erp" | "schemaVersion">), schemaVersion: DEMO_SCHEMA_VERSION, erp } : null;
  }
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
  return loadDemoState(current ?? storage.getItem(PREVIOUS_DEMO_STORAGE_KEY) ?? storage.getItem(V3_DEMO_STORAGE_KEY) ?? storage.getItem(LEGACY_DEMO_STORAGE_KEY));
}

export function serializeDemoState(state: DemoState): string { return JSON.stringify(state); }
export function deserializeDemoState(value: string | null): DemoState { return loadDemoState(value).state; }

function validRfqQuotationLines(rfqLines: unknown, quotationLines: unknown): boolean {
  if (!hasRfqLines(rfqLines) || !hasQuantityLines(quotationLines)) return false;
  const rfq = rfqLines as Array<{ productId: string; quantity: number }>;
  const quotations = quotationLines as Array<{ productId: string; quantity: number; unitPrice: number }>;
  return rfq.length === quotations.length && rfq.every((rfqLine) => quotations.some((quotationLine) => quotationLine.productId === rfqLine.productId && quotationLine.quantity === rfqLine.quantity));
}

function receiptProductsBelongToOrder(orderLines: unknown, receiptLines: unknown): boolean {
  if (!hasQuantityLines(orderLines) || !hasQuantityLines(receiptLines)) return false;
  const orderProducts = new Set((orderLines as Array<{ productId: string }>).map((line) => line.productId));
  const receiptProducts = (receiptLines as Array<{ productId: string }>).map((line) => line.productId);
  return new Set(receiptProducts).size === receiptProducts.length && receiptProducts.every((productId) => orderProducts.has(productId));
}

function migrateErpV3(value: unknown): ErpState | null {
  if (!isRecord(value)) return null;
  const purchaseOrders = Array.isArray(value.purchaseOrders) ? value.purchaseOrders.map((order) => isRecord(order) ? { ...order, supplierQuotationId: order.supplierQuotationId ?? null } : order) : value.purchaseOrders;
  const followUps = Array.isArray(value.followUps) ? value.followUps.map((followUp) => isRecord(followUp) ? { ...followUp, approvalStatus: followUp.approvalStatus ?? "pending", approvedBy: followUp.approvedBy ?? null } : followUp) : value.followUps;
  return { ...value, requestForQuotations: Array.isArray(value.requestForQuotations) ? value.requestForQuotations : [], supplierQuotations: Array.isArray(value.supplierQuotations) ? value.supplierQuotations : [], purchaseOrders, followUps } as unknown as ErpState;
}

function migrateErpV4(value: unknown): ErpState | null {
  if (!isRecord(value)) return null;
  const stockMovements = Array.isArray(value.stockMovements) ? value.stockMovements.map((movement) => isRecord(movement) ? {
    ...movement,
    actorRole: movement.actorRole ?? "system",
    actorId: movement.actorId ?? "system:migrated-v4",
    reason: movement.reason ?? null,
  } : movement) : value.stockMovements;
  return { ...value, stockMovements, stockAdjustments: Array.isArray(value.stockAdjustments) ? value.stockAdjustments : [] } as unknown as ErpState;
}
