import type { DemoState } from "../domain/types";
import { isStrictIsoDate, isStrictIsoInstant } from "../erp/date-validation";
import type { ErpState } from "../erp/types";
import { createErpSeedState } from "../erp/seed";
import { compareStockMovementChronology, type StockMovementChronologyKey } from "../erp/stock-movement-order";
import { createSeedState } from "./seed";
import { createDemoSessionId, isValidDemoSessionId } from "./session";

export const DEMO_SCHEMA_VERSION = 10;
export const DEMO_STORAGE_KEY = "arvanta-distributor-mini-erp-demo-v10";
export const PREVIOUS_DEMO_STORAGE_KEY = "arvanta-distributor-mini-erp-demo-v9";
export const V8_DEMO_STORAGE_KEY = "arvanta-distributor-mini-erp-demo-v8";
export const V7_DEMO_STORAGE_KEY = "arvanta-distributor-mini-erp-demo-v7";
export const V6_DEMO_STORAGE_KEY = "arvanta-distributor-mini-erp-demo-v6";
export const V5_DEMO_STORAGE_KEY = "arvanta-distributor-mini-erp-demo-v5";
export const V4_DEMO_STORAGE_KEY = "arvanta-distributor-mini-erp-demo-v4";
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
const trustedOpeningMovements = new Map(createErpSeedState().stockMovements.filter((movement) => movement.sourceType === "seed").map((movement) => [movement.id, movement]));
const hasString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const hasTrimmedString = (value: unknown): value is string => hasString(value) && value.trim().length > 0;
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
  if (warehouses.filter((item) => (item as Record<string, unknown>).active === true).length !== 1) return false;
  const productIds = new Set(products.map((item) => (item as Record<string, unknown>).id));
  const supplierIds = new Set(suppliers.map((item) => (item as Record<string, unknown>).id));
  const customerIds = new Set(customers.map((item) => (item as Record<string, unknown>).id));
  const warehouseIds = new Set(warehouses.map((item) => (item as Record<string, unknown>).id));
  const activeProductIds = new Set(products.filter((item) => (item as Record<string, unknown>).active === true).map((item) => (item as Record<string, unknown>).id));
  const activeWarehouseIds = new Set(warehouses.filter((item) => (item as Record<string, unknown>).active === true).map((item) => (item as Record<string, unknown>).id));
  const validLines = (lines: unknown): boolean => hasQuantityLines(lines) && (lines as Record<string, unknown>[]).every((line) => productIds.has(line.productId));
  const validRfqLines = (lines: unknown): boolean => hasRfqLines(lines) && (lines as Record<string, unknown>[]).every((line) => productIds.has(line.productId));
  const purchaseRequests = value.purchaseRequests as Record<string, unknown>[];
  if (!purchaseRequests.every((item) => hasEntityDates(item) && hasFields(item, ["requestNumber", "requesterRole"]) && includes(erpRoles, item.requesterRole) && Object.hasOwn(item, "sourceSalesOrderId") && (item.sourceSalesOrderId === null || hasString(item.sourceSalesOrderId)) && includes(["draft", "submitted", "approved", "rejected", "cancelled"], item.status) && validLines(item.lines))) return false;
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
    return hasEntityDates(item) && hasFields(item, ["receiptNumber", "purchaseOrderId", "warehouseId"]) && openPurchaseOrderIds.has(item.purchaseOrderId) && activeWarehouseIds.has(item.warehouseId) && purchaseOrder?.warehouseId === item.warehouseId && includes(["draft", "approved", "cancelled"], item.status) && validLines(item.lines) && receiptLinesMatchOrder(purchaseOrder?.lines, item.lines);
  })) return false;
  const goodsReceiptById = new Map(goodsReceipts.map((item) => [item.id, item]));
  const salesOrders = value.salesOrders as Record<string, unknown>[];
  if (!salesOrders.every((item) => hasEntityDates(item) && hasFields(item, ["orderNumber", "customerId", "warehouseId"]) && customerIds.has(item.customerId) && warehouseIds.has(item.warehouseId) && includes(salesOrderStatuses, item.status) && validSalesOrderLines(item.lines))) return false;
  const salesOrderIds = new Set(salesOrders.map((item) => item.id));
  if (!purchaseRequests.every((request) => request.sourceSalesOrderId === null || salesOrderIds.has(request.sourceSalesOrderId))) return false;
  const activeShortageSources = purchaseRequests.filter((request) => request.sourceSalesOrderId !== null && request.status !== "cancelled").map((request) => request.sourceSalesOrderId);
  if (new Set(activeShortageSources).size !== activeShortageSources.length) return false;
  const salesOrderById = new Map(salesOrders.map((item) => [item.id, item]));
  const deliveryOrders = value.deliveryOrders as Record<string, unknown>[];
  if (!deliveryOrders.every((item) => {
    const order = hasString(item.salesOrderId) ? salesOrderById.get(item.salesOrderId) : undefined;
    return hasEntityDates(item) && hasFields(item, ["deliveryNumber", "salesOrderId", "warehouseId"]) && salesOrderIds.has(item.salesOrderId) && warehouseIds.has(item.warehouseId) && order?.warehouseId === item.warehouseId && includes(["draft", "posted", "cancelled"], item.status) && deliveryLinesMatchOrder(order?.lines, item.lines);
  })) return false;
  const deliveryOrderById = new Map(deliveryOrders.map((item) => [item.id, item]));
  const supplierInvoices = value.supplierInvoices as Record<string, unknown>[];
  const customerInvoices = value.customerInvoices as Record<string, unknown>[];
  const allInvoices = [...supplierInvoices, ...customerInvoices];
  if (new Set(allInvoices.map((item) => item.id)).size !== allInvoices.length || new Set(allInvoices.map((item) => item.invoiceNumber)).size !== allInvoices.length) return false;
  if (!supplierInvoices.every((item) => {
    const purchaseOrder = hasString(item.purchaseOrderId) ? purchaseOrderById.get(item.purchaseOrderId) : undefined;
    return hasEntityDates(item) && hasFields(item, ["invoiceNumber", "dueDate", "supplierId"])
      && purchaseOrder && purchaseOrder.supplierId === item.supplierId && supplierIds.has(item.supplierId)
      && item.salesOrderId === null && item.customerId === null
      && hasValidInvoiceShape(item) && invoiceSourcesMatch(item, goodsReceiptById, "purchaseOrderId", "approved");
  })) return false;
  if (!customerInvoices.every((item) => {
    const salesOrder = hasString(item.salesOrderId) ? salesOrderById.get(item.salesOrderId) : undefined;
    return hasEntityDates(item) && hasFields(item, ["invoiceNumber", "dueDate", "customerId"])
      && salesOrder && salesOrder.customerId === item.customerId && customerIds.has(item.customerId)
      && item.purchaseOrderId === null && item.supplierId === null
      && hasValidInvoiceShape(item) && invoiceSourcesMatch(item, deliveryOrderById, "salesOrderId", "posted");
  })) return false;
  const activeSupplierSources = supplierInvoices.filter((item) => item.status !== "cancelled").flatMap((item) => item.sourceDocumentIds as string[]);
  const activeCustomerSources = customerInvoices.filter((item) => item.status !== "cancelled").flatMap((item) => item.sourceDocumentIds as string[]);
  if (new Set(activeSupplierSources).size !== activeSupplierSources.length || new Set(activeCustomerSources).size !== activeCustomerSources.length) return false;
  const supplierInvoiceIds = new Set(supplierInvoices.map((item) => item.id));
  const customerInvoiceIds = new Set(customerInvoices.map((item) => item.id));
  const invoiceById = new Map(allInvoices.map((item) => [item.id, item]));
  const payments = value.payments as Record<string, unknown>[];
  if (new Set(payments.map((item) => item.id)).size !== payments.length || new Set(payments.map((item) => item.paymentNumber)).size !== payments.length) return false;
  if (!payments.every((item) => {
    const invoice = hasString(item.invoiceId) ? invoiceById.get(item.invoiceId) : undefined;
    if (!(hasEntityDates(item) && isStrictIsoInstant(item.createdAt) && isStrictIsoInstant(item.updatedAt) && hasFields(item, ["paymentNumber", "invoiceId", "paymentDate"]) && isStrictIsoDate(item.paymentDate) && invoice && Number.isSafeInteger(item.amount) && Number(item.amount) > 0 && includes(["payable", "receivable"], item.direction) && includes(["posted", "cancelled"], item.status))) return false;
    if (item.direction === "payable") return supplierInvoiceIds.has(item.invoiceId) && item.supplierId === invoice.supplierId && item.customerId === null;
    return customerInvoiceIds.has(item.invoiceId) && item.customerId === invoice.customerId && item.supplierId === null;
  })) return false;
  if (!hasConsistentFinanceBalances(allInvoices, payments)) return false;
  if (!hasConsistentFinanceSourceLifecycle(purchaseOrders, goodsReceipts, supplierInvoices, salesOrders, deliveryOrders, customerInvoices)) return false;
  const stockAdjustments = value.stockAdjustments as Record<string, unknown>[];
  if (!stockAdjustments.every((item) => hasEntityDates(item) && hasFields(item, ["adjustmentNumber", "productId", "warehouseId", "reason", "proposedByRole"]) && activeProductIds.has(item.productId) && activeWarehouseIds.has(item.warehouseId) && includes(["warehouse", "admin"], item.proposedByRole) && hasNumber(item.quantityDelta) && Number.isInteger(item.quantityDelta) && item.quantityDelta !== 0 && includes(["pending", "approved", "rejected"], item.status) && (item.approvedByRole === null || includes(["approver", "admin"], item.approvedByRole)) && (item.approvedAt === null || hasString(item.approvedAt)) && (item.status !== "approved" || (includes(["approver", "admin"], item.approvedByRole) && item.approvedByRole !== item.proposedByRole && hasString(item.approvedAt))))) return false;
  const stockAdjustmentById = new Map(stockAdjustments.map((item) => [item.id, item]));
  const stockMovements = value.stockMovements as Record<string, unknown>[];
  if (new Set(stockMovements.map((item) => item.id)).size !== stockMovements.length) return false;
  if (stockMovements.filter((item) => item.sourceType === "seed").length !== trustedOpeningMovements.size) return false;
  if (!stockMovements.every((item) => {
    if (!(hasEntityDates(item) && hasFields(item, ["type", "productId", "warehouseId", "sourceType", "sourceId", "actorRole", "actorId"]) && activeProductIds.has(item.productId) && activeWarehouseIds.has(item.warehouseId) && hasNumber(item.quantity) && Number.isInteger(item.quantity) && item.quantity !== 0 && includes(["opening", "receipt", "delivery", "adjustment"], item.type) && includes(["in", "out", "adjustment"], item.direction) && includes(["seed", "goods_receipt", "delivery_order", "adjustment"], item.sourceType) && (includes(erpRoles, item.actorRole) || item.actorRole === "system") && (item.reason === null || typeof item.reason === "string") && !Number.isNaN(new Date(String(item.createdAt)).getTime()))) return false;
    if (item.sourceType === "seed") { const trusted = trustedOpeningMovements.get(String(item.id)); return Boolean(trusted && item.type === "opening" && item.productId === trusted.productId && item.warehouseId === trusted.warehouseId && item.direction === "in" && item.quantity === trusted.quantity && item.sourceId === "seed-opening" && item.actorRole === "system" && item.actorId === "system:seed"); }
    if (item.sourceType === "goods_receipt") { const receipt = goodsReceiptById.get(item.sourceId); return Boolean(receipt && item.type === "receipt" && item.direction === "in" && item.quantity > 0 && receipt.warehouseId === item.warehouseId && receipt.status === "approved" && includes(["warehouse", "admin"], item.actorRole) && item.actorId === `role:${String(item.actorRole)}`); }
    if (item.sourceType === "delivery_order") { const delivery = deliveryOrderById.get(item.sourceId); return item.type === "delivery" && item.direction === "out" && item.quantity > 0 && delivery?.warehouseId === item.warehouseId && delivery?.status === "posted" && item.reason === `Completed ${String(delivery.deliveryNumber)}` && includes(["warehouse", "admin"], item.actorRole) && item.actorId === `role:${String(item.actorRole)}`; }
    const adjustment = stockAdjustmentById.get(item.sourceId);
    return item.type === "adjustment" && item.direction === "adjustment" && includes(["approver", "admin"], item.actorRole) && adjustment?.status === "approved" && adjustment.productId === item.productId && adjustment.warehouseId === item.warehouseId && adjustment.quantityDelta === item.quantity && adjustment.reason === item.reason && adjustment.approvedByRole === item.actorRole && item.actorId === `role:${String(item.actorRole)}`;
  })) return false;
  if (!goodsReceipts.every((receipt) => {
    const postings = stockMovements.filter((movement) => movement.sourceType === "goods_receipt" && movement.sourceId === receipt.id);
    if (receipt.status !== "approved") return postings.length === 0;
    const lines = receipt.lines as Record<string, unknown>[];
    return postings.length === lines.length && lines.every((line) => postings.filter((movement) => movement.productId === line.productId && movement.warehouseId === receipt.warehouseId && movement.direction === "in" && movement.quantity === line.quantity && includes(["warehouse", "admin"], movement.actorRole) && movement.actorId === `role:${String(movement.actorRole)}` && hasString(movement.reason)).length === 1);
  })) return false;
  if (!stockAdjustments.every((adjustment) => {
    const postings = stockMovements.filter((movement) => movement.sourceType === "adjustment" && movement.sourceId === adjustment.id);
    return adjustment.status === "approved" ? postings.length === 1 : postings.length === 0;
  })) return false;
  if (!deliveryOrders.every((delivery) => {
    const postings = stockMovements.filter((movement) => movement.sourceType === "delivery_order" && movement.sourceId === delivery.id);
    if (delivery.status !== "posted") return postings.length === 0;
    const lines = delivery.lines as Record<string, unknown>[];
    return postings.length === lines.length && lines.every((line) => postings.filter((movement) => movement.type === "delivery" && movement.productId === line.productId && movement.warehouseId === delivery.warehouseId && movement.direction === "out" && movement.quantity === line.quantity && movement.reason === `Completed ${String(delivery.deliveryNumber)}` && ["warehouse", "admin"].includes(String(movement.actorRole)) && movement.actorId === `role:${String(movement.actorRole)}`).length === 1);
  })) return false;
  if (!hasConsistentPurchaseReceiptTotals(purchaseOrders, goodsReceipts)) return false;
  if (!hasConsistentSalesDeliveryTotals(salesOrders, deliveryOrders)) return false;
  if (!hasNonNegativeMovementHistory(stockMovements)) return false;
  if (!hasCoveredReservations(salesOrders, stockMovements)) return false;
  const supplierCalls = value.supplierCalls as Record<string, unknown>[];
  if (!supplierCalls.every((item) => {
    const draft = item.status === "draft";
    const transcript = item.transcript;
    if (!Array.isArray(transcript) || !transcript.every((segment) => hasFields(segment, ["id", "speaker", "text"]) && includes(["AI", "Supplier", "System"], segment.speaker) && Number.isSafeInteger(segment.stage) && Number(segment.stage) > 0 && Number.isSafeInteger(segment.offsetSeconds) && Number(segment.offsetSeconds) >= 0)) return false;
    return hasEntityDates(item) && isStrictIsoInstant(item.createdAt) && isStrictIsoInstant(item.updatedAt)
      && hasFields(item, ["supplierId", "purchaseOrderId", "scenario"]) && supplierIds.has(item.supplierId) && openPurchaseOrderIds.has(item.purchaseOrderId)
      && purchaseOrderById.get(item.purchaseOrderId)?.supplierId === item.supplierId
      && includes(["draft", "active", "completed", "ended_early", "failed"], item.status)
      && includes(["delivery_commitment", "partial_delivery", "stock_unavailable", "price_discrepancy", "failed_contact"], item.scenario)
      && Number.isSafeInteger(item.durationSeconds) && Number(item.durationSeconds) >= 0
      && (draft ? item.provider === null && item.providerCallId === null && item.calledLocalDate === null && item.startedAt === null && item.endedAt === null && transcript.length === 0 && item.durationSeconds === 0
        : includes(["mock", "calle"], item.provider) && hasTrimmedString(item.providerCallId) && isStrictIsoDate(item.calledLocalDate) && isStrictIsoInstant(item.startedAt)
          && (item.status === "completed" ? isStrictIsoInstant(item.endedAt) && transcript.length > 0 && item.durationSeconds === transcript.at(-1)?.offsetSeconds
            : item.status === "ended_early" ? isStrictIsoInstant(item.endedAt) && item.durationSeconds === (transcript.at(-1)?.offsetSeconds ?? 0) : item.endedAt === null));
  })) return false;
  const supplierCallIds = new Set(supplierCalls.map((item) => item.id));
  if (supplierCallIds.size !== supplierCalls.length) return false;
  const supplierCallById = new Map(supplierCalls.map((item) => [item.id, item]));
  const supplierApprovals = value.supplierApprovals as Record<string, unknown>[];
  if (new Set(supplierApprovals.map((item) => item.supplierCallId)).size !== supplierApprovals.length) return false;
  if (!supplierApprovals.every((item) => {
    const call = hasString(item.supplierCallId) ? supplierCallById.get(item.supplierCallId) : undefined;
    const purchaseOrder = hasString(item.purchaseOrderId) ? purchaseOrderById.get(item.purchaseOrderId) : undefined;
    if (!call || !purchaseOrder) return false;
    const purchaseOrderLines = purchaseOrder.lines as Record<string, unknown>[];
    if (!Array.isArray(item.permittedProductIds) || !item.permittedProductIds.every(hasString)) return false;
    const products = item.permittedProductIds as string[];
    return hasEntityDates(item) && isStrictIsoInstant(item.createdAt) && isStrictIsoInstant(item.updatedAt)
      && hasFields(item, ["supplierCallId", "supplierId", "purchaseOrderId", "objective", "maximumDeliveryDate", "language", "approvedAt"])
      && call.supplierId === item.supplierId && call.purchaseOrderId === item.purchaseOrderId && purchaseOrder.supplierId === item.supplierId
      && hasTrimmedString(item.objective) && hasTrimmedString(item.language)
      && includes(["pending", "approved", "rejected"], item.status) && isStrictIsoDate(item.maximumDeliveryDate) && isStrictIsoInstant(item.approvedAt)
      && typeof item.partialDeliveryAllowed === "boolean" && hasNumber(item.maximumUnitPriceIncreasePercent) && item.maximumUnitPriceIncreasePercent >= 0 && item.maximumUnitPriceIncreasePercent <= 100
      && products.length === purchaseOrderLines.length && new Set(products).size === products.length
      && purchaseOrderLines.every((line) => hasString(line.productId) && products.includes(line.productId))
      && (item.approvedBy === null || hasTrimmedString(item.approvedBy)) && (item.status !== "approved" || hasTrimmedString(item.approvedBy));
  })) return false;
  const approvedCallIds = new Set(supplierApprovals.filter((item) => item.status === "approved").map((item) => item.supplierCallId));
  if (supplierCalls.some((item) => item.status !== "draft" && !approvedCallIds.has(item.id))) return false;
  const supplierResults = value.supplierResults as Record<string, unknown>[];
  if (new Set(supplierResults.map((item) => item.id)).size !== supplierResults.length) return false;
  if (!supplierResults.every((item) => {
    const call = hasString(item.supplierCallId) ? supplierCallById.get(item.supplierCallId) : undefined;
    if (!call) return false;
    return hasEntityDates(item) && isStrictIsoInstant(item.createdAt) && isStrictIsoInstant(item.updatedAt)
      && hasFields(item, ["supplierCallId", "supplierId", "purchaseOrderId", "scenario", "sourceScenario", "sourceProvider", "sourceProviderCallId", "summary", "sentiment"])
      && ["completed", "ended_early"].includes(String(call.status)) && call.supplierId === item.supplierId && call.purchaseOrderId === item.purchaseOrderId
      && call.scenario === item.sourceScenario && call.provider === item.sourceProvider && call.providerCallId === item.sourceProviderCallId
      && includes(["delivery_commitment", "partial_delivery", "stock_unavailable", "price_discrepancy", "failed_contact"], item.scenario)
      && includes(["positive", "neutral", "concerned"], item.sentiment) && hasTrimmedString(item.summary)
      && includes(["pending", "approved", "rejected", "human_review"], item.status)
      && [item.promisedDeliveryDate, item.partialDeliveryDate, item.remainingDeliveryDate, item.followUpDate].every((date) => date === null || isStrictIsoDate(date))
      && (item.reason === null || hasTrimmedString(item.reason));
  })) return false;
  // Rejected rows are immutable attempt history. A call may have at most one
  // current or accepted result across pending, human_review, and approved.
  const currentResultCallIds = supplierResults.filter((item) => item.status !== "rejected").map((item) => item.supplierCallId);
  if (new Set(currentResultCallIds).size !== currentResultCallIds.length) return false;
  if (!(value.disputes as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["reason"]) && includes(["open", "investigating", "resolved", "cancelled"], item.status))) return false;
  if (!(value.followUps as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["dueAt", "reason"]) && includes(["open", "completed", "cancelled"], item.status) && includes(["pending", "approved"], item.approvalStatus) && (item.approvedBy === null || hasString(item.approvedBy)) && (item.approvalStatus !== "approved" || hasString(item.approvedBy)))) return false;
  return (value.auditLogs as unknown[]).every((item) => hasEntityDates(item) && hasFields(item, ["entityType", "entityId", "action", "actorRole", "actorId"]) && (includes(erpRoles, item.actorRole) || item.actorRole === "system") && isRecord(item.detail) && Object.values(item.detail).every((detail) => detail === null || typeof detail === "string" || typeof detail === "boolean" || (typeof detail === "number" && Number.isFinite(detail))));
}

export function migrateDemoState(value: unknown): DemoState | null {
  if (!isRecord(value) || !hasValidLegacyCollections(value)) return null;
  const demoSessionId = value.schemaVersion === DEMO_SCHEMA_VERSION && isValidDemoSessionId(value.demoSessionId) ? value.demoSessionId : createDemoSessionId();
  if (value.schemaVersion === 2) return { ...(value as Omit<DemoState, "erp" | "schemaVersion">), schemaVersion: DEMO_SCHEMA_VERSION, demoSessionId, erp: createErpSeedState() };
  if (value.schemaVersion === 3) {
    const erp = migrateErpV8(migrateErpV7(migrateErpV6(migrateErpV5(migrateErpV4(migrateErpV3(value.erp))))));
    return erp && hasValidErpCollections(erp) ? { ...(value as Omit<DemoState, "erp" | "schemaVersion">), schemaVersion: DEMO_SCHEMA_VERSION, demoSessionId, erp } : null;
  }
  if (value.schemaVersion === 4) {
    const erp = migrateErpV8(migrateErpV7(migrateErpV6(migrateErpV5(migrateErpV4(value.erp)))));
    return erp && hasValidErpCollections(erp) ? { ...(value as Omit<DemoState, "erp" | "schemaVersion">), schemaVersion: DEMO_SCHEMA_VERSION, demoSessionId, erp } : null;
  }
  if (value.schemaVersion === 5) {
    const erp = migrateErpV8(migrateErpV7(migrateErpV6(migrateErpV5(value.erp))));
    return erp && hasValidErpCollections(erp) ? { ...(value as Omit<DemoState, "erp" | "schemaVersion">), schemaVersion: DEMO_SCHEMA_VERSION, demoSessionId, erp } : null;
  }
  if (value.schemaVersion === 6) {
    const erp = migrateErpV8(migrateErpV7(migrateErpV6(value.erp)));
    return erp && hasValidErpCollections(erp) ? { ...(value as Omit<DemoState, "erp" | "schemaVersion">), schemaVersion: DEMO_SCHEMA_VERSION, demoSessionId, erp } : null;
  }
  if (value.schemaVersion === 7) {
    const erp = migrateErpV8(migrateErpV7(value.erp));
    return erp && hasValidErpCollections(erp) ? { ...(value as Omit<DemoState, "erp" | "schemaVersion">), schemaVersion: DEMO_SCHEMA_VERSION, demoSessionId, erp } : null;
  }
  if (value.schemaVersion === 8) {
    const erp = migrateErpV8(value.erp);
    return erp && hasValidErpCollections(erp) ? { ...(value as Omit<DemoState, "erp" | "schemaVersion">), schemaVersion: DEMO_SCHEMA_VERSION, demoSessionId, erp } : null;
  }
  if (value.schemaVersion === 9 && isRecord(value.erp) && Array.isArray(value.erp.supplierApprovals)) {
    const erp = { ...value.erp, supplierApprovals: value.erp.supplierApprovals.map((item) => isRecord(item) ? { ...item, approvedAt: item.approvedAt ?? item.createdAt } : item) };
    return hasValidErpCollections(erp) ? { ...(value as unknown as DemoState), schemaVersion: DEMO_SCHEMA_VERSION, demoSessionId, erp: erp as unknown as ErpState } : null;
  }
  if (value.schemaVersion === DEMO_SCHEMA_VERSION && isValidDemoSessionId(value.demoSessionId) && hasValidErpCollections(value.erp)) return value as unknown as DemoState;
  return null;
}

export function loadDemoState(value: string | null): { state: DemoState; recoveryReason: DemoRecoveryReason } {
  if (!value) return { state: createSeedState(createDemoSessionId()), recoveryReason: null };
  try {
    const state = migrateDemoState(JSON.parse(value));
    return state ? { state, recoveryReason: null } : { state: createSeedState(createDemoSessionId()), recoveryReason: "INVALID_SCHEMA" };
  } catch {
    return { state: createSeedState(createDemoSessionId()), recoveryReason: "INVALID_JSON" };
  }
}

export function loadDemoStateFromStorage(storage: Pick<Storage, "getItem">): { state: DemoState; recoveryReason: DemoRecoveryReason } {
  const current = storage.getItem(DEMO_STORAGE_KEY);
  return loadDemoState(current ?? storage.getItem(PREVIOUS_DEMO_STORAGE_KEY) ?? storage.getItem(V8_DEMO_STORAGE_KEY) ?? storage.getItem(V7_DEMO_STORAGE_KEY) ?? storage.getItem(V6_DEMO_STORAGE_KEY) ?? storage.getItem(V5_DEMO_STORAGE_KEY) ?? storage.getItem(V4_DEMO_STORAGE_KEY) ?? storage.getItem(V3_DEMO_STORAGE_KEY) ?? storage.getItem(LEGACY_DEMO_STORAGE_KEY));
}

export function serializeDemoState(state: DemoState): string { return JSON.stringify(state); }
export function deserializeDemoState(value: string | null): DemoState { return loadDemoState(value).state; }

function hasValidInvoiceShape(invoice: Record<string, unknown>): boolean {
  if (!includes(invoiceStatuses, invoice.status) || !hasNumber(invoice.totalAmount) || !Number.isSafeInteger(invoice.totalAmount) || Number(invoice.totalAmount) <= 0) return false;
  if (!isStrictIsoInstant(invoice.createdAt) || !isStrictIsoInstant(invoice.updatedAt) || !isStrictIsoDate(invoice.dueDate)) return false;
  if (!Array.isArray(invoice.sourceDocumentIds) || invoice.sourceDocumentIds.length === 0 || !invoice.sourceDocumentIds.every(hasString) || new Set(invoice.sourceDocumentIds).size !== invoice.sourceDocumentIds.length) return false;
  if (!Array.isArray(invoice.lines) || invoice.lines.length === 0 || !invoice.lines.every((line) => hasQuantityLine(line) && Number.isInteger(line.quantity) && line.quantity > 0 && Number.isSafeInteger(line.unitPrice) && line.unitPrice > 0)) return false;
  const lineProducts = invoice.lines.map((line) => (line as Record<string, unknown>).productId);
  return new Set(lineProducts).size === lineProducts.length
    && invoice.lines.reduce((sum, line) => sum + Number((line as Record<string, unknown>).quantity) * Number((line as Record<string, unknown>).unitPrice), 0) === invoice.totalAmount;
}

function invoiceSourcesMatch(
  invoice: Record<string, unknown>,
  sourcesById: Map<unknown, Record<string, unknown>>,
  parentField: "purchaseOrderId" | "salesOrderId",
  requiredStatus: "approved" | "posted",
): boolean {
  if (!Array.isArray(invoice.sourceDocumentIds) || !Array.isArray(invoice.lines)) return false;
  const sourceLines = new Map<string, { quantity: number; unitPrice: number }>();
  for (const sourceId of invoice.sourceDocumentIds) {
    const source = sourcesById.get(sourceId);
    if (!source || source.status !== requiredStatus || source[parentField] !== invoice[parentField] || !hasQuantityLines(source.lines)) return false;
    for (const line of source.lines as Array<{ productId: string; quantity: number; unitPrice: number }>) {
      const current = sourceLines.get(line.productId);
      if (current && current.unitPrice !== line.unitPrice) return false;
      sourceLines.set(line.productId, { quantity: (current?.quantity ?? 0) + line.quantity, unitPrice: line.unitPrice });
    }
  }
  const lines = invoice.lines as Array<{ productId: string; quantity: number; unitPrice: number }>;
  return sourceLines.size === lines.length && lines.every((line) => {
    const source = sourceLines.get(line.productId);
    return source?.quantity === line.quantity && source.unitPrice === line.unitPrice;
  });
}

function hasConsistentFinanceBalances(invoices: Record<string, unknown>[], payments: Record<string, unknown>[]): boolean {
  return invoices.every((invoice) => {
    const related = payments.filter((payment) => payment.invoiceId === invoice.id);
    if (invoice.status === "cancelled") return related.every((payment) => payment.status === "cancelled");
    const posted = related.filter((payment) => payment.status === "posted").reduce((sum, payment) => sum + Number(payment.amount), 0);
    const totalAmount = Number(invoice.totalAmount);
    if (!Number.isSafeInteger(posted) || posted < 0 || posted > totalAmount) return false;
    if (posted === 0) return invoice.status === "unpaid";
    if (posted === totalAmount) return invoice.status === "paid";
    return invoice.status === "partially_paid";
  });
}

function hasConsistentFinanceSourceLifecycle(
  purchaseOrders: Record<string, unknown>[],
  goodsReceipts: Record<string, unknown>[],
  supplierInvoices: Record<string, unknown>[],
  salesOrders: Record<string, unknown>[],
  deliveryOrders: Record<string, unknown>[],
  customerInvoices: Record<string, unknown>[],
): boolean {
  const payableSources = new Set(supplierInvoices.filter((invoice) => invoice.status !== "cancelled").flatMap((invoice) => invoice.sourceDocumentIds as string[]));
  for (const order of purchaseOrders) {
    const receipts = goodsReceipts.filter((receipt) => receipt.purchaseOrderId === order.id && receipt.status === "approved");
    const fullyCovered = receipts.length > 0 && receipts.every((receipt) => payableSources.has(String(receipt.id)));
    if (order.status === "completed" && !fullyCovered) return false;
    if (order.status === "fully_received" && fullyCovered) return false;
  }
  const receivableSources = new Set(customerInvoices.filter((invoice) => invoice.status !== "cancelled").flatMap((invoice) => invoice.sourceDocumentIds as string[]));
  for (const order of salesOrders) {
    const deliveries = deliveryOrders.filter((delivery) => delivery.salesOrderId === order.id && delivery.status === "posted");
    const fullyCovered = deliveries.length > 0 && deliveries.every((delivery) => receivableSources.has(String(delivery.id)));
    if ((order.status === "invoiced" || order.status === "completed") && !fullyCovered) return false;
    if (order.status === "fully_delivered" && fullyCovered) return false;
    if (order.status === "completed") {
      const invoices = customerInvoices.filter((invoice) => invoice.salesOrderId === order.id && invoice.status !== "cancelled");
      if (invoices.length === 0 || !invoices.every((invoice) => invoice.status === "paid")) return false;
    }
  }
  return true;
}

function validRfqQuotationLines(rfqLines: unknown, quotationLines: unknown): boolean {
  if (!hasRfqLines(rfqLines) || !hasQuantityLines(quotationLines)) return false;
  const rfq = rfqLines as Array<{ productId: string; quantity: number }>;
  const quotations = quotationLines as Array<{ productId: string; quantity: number; unitPrice: number }>;
  return rfq.length === quotations.length && rfq.every((rfqLine) => quotations.some((quotationLine) => quotationLine.productId === rfqLine.productId && quotationLine.quantity === rfqLine.quantity));
}

function receiptLinesMatchOrder(orderLines: unknown, receiptLines: unknown): boolean {
  if (!hasQuantityLines(orderLines) || !hasQuantityLines(receiptLines)) return false;
  const orders = orderLines as Array<{ productId: string; quantity: number; unitPrice: number }>;
  const receipts = receiptLines as Array<{ productId: string; quantity: number; unitPrice: number }>;
  const receiptProducts = receipts.map((line) => line.productId);
  return receipts.length > 0 && new Set(receiptProducts).size === receiptProducts.length && receipts.every((line) => {
    const orderLine = orders.find((item) => item.productId === line.productId);
    return Boolean(orderLine && Number.isInteger(line.quantity) && line.quantity > 0 && line.unitPrice === orderLine.unitPrice);
  });
}

function validSalesOrderLines(lines: unknown): boolean {
  if (!Array.isArray(lines) || lines.length === 0) return false;
  const productIds = lines.map((line) => isRecord(line) ? line.productId : null);
  return new Set(productIds).size === productIds.length && lines.every((line) => hasQuantityLine(line)
    && Number.isInteger(line.quantity) && line.quantity > 0 && line.unitPrice > 0
    && hasNumber(line.deliveredQuantity) && Number.isInteger(line.deliveredQuantity) && line.deliveredQuantity >= 0 && line.deliveredQuantity <= line.quantity
    && !Object.hasOwn(line, "reservedQuantity"));
}

function deliveryLinesMatchOrder(orderLines: unknown, deliveryLines: unknown): boolean {
  if (!Array.isArray(orderLines) || !Array.isArray(deliveryLines) || !hasQuantityLines(deliveryLines) || deliveryLines.length === 0) return false;
  const deliveries = deliveryLines as Array<{ productId: string; quantity: number; unitPrice: number }>;
  const products = deliveries.map((line) => line.productId);
  return new Set(products).size === products.length && deliveries.every((line) => {
    const orderLine = orderLines.find((item) => isRecord(item) && item.productId === line.productId) as Record<string, unknown> | undefined;
    return Boolean(orderLine && Number.isInteger(line.quantity) && line.quantity > 0 && line.unitPrice === orderLine.unitPrice && line.quantity <= Number(orderLine.quantity));
  });
}

function hasConsistentPurchaseReceiptTotals(purchaseOrders: Record<string, unknown>[], goodsReceipts: Record<string, unknown>[]): boolean {
  return purchaseOrders.every((purchaseOrder) => {
    const orderLines = purchaseOrder.lines as Array<{ productId: string; quantity: number }>;
    if (!Array.isArray(orderLines) || orderLines.length === 0 || !orderLines.every((line) => hasNumber(line.quantity) && line.quantity > 0)) return false;
    const totals = new Map<string, number>();
    for (const receipt of goodsReceipts) {
      if (receipt.purchaseOrderId !== purchaseOrder.id || receipt.status !== "approved") continue;
      for (const line of receipt.lines as Array<{ productId: string; quantity: number }>) totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
    }
    if (orderLines.some((line) => (totals.get(line.productId) ?? 0) > line.quantity)) return false;
    const receivedAny = orderLines.some((line) => (totals.get(line.productId) ?? 0) > 0);
    const receivedAll = orderLines.every((line) => (totals.get(line.productId) ?? 0) === line.quantity);
    const status = String(purchaseOrder.status);
    if (!receivedAny) return !["partially_received", "fully_received", "completed"].includes(status);
    if (receivedAll) return status === "fully_received" || status === "completed";
    return status === "partially_received" || status === "cancelled";
  });
}

function hasConsistentSalesDeliveryTotals(salesOrders: Record<string, unknown>[], deliveryOrders: Record<string, unknown>[]): boolean {
  return salesOrders.every((salesOrder) => {
    const lines = salesOrder.lines as Array<{ productId: string; quantity: number; deliveredQuantity: number }>;
    const postedTotals = new Map<string, number>();
    for (const delivery of deliveryOrders) {
      if (delivery.salesOrderId !== salesOrder.id) continue;
      if (delivery.status === "draft" && salesOrder.status !== "confirmed" && salesOrder.status !== "partially_delivered") return false;
      if (delivery.status !== "posted") continue;
      for (const line of delivery.lines as Array<{ productId: string; quantity: number }>) postedTotals.set(line.productId, (postedTotals.get(line.productId) ?? 0) + line.quantity);
    }
    if (!lines.every((line) => (postedTotals.get(line.productId) ?? 0) === line.deliveredQuantity)) return false;
    const deliveredAny = lines.some((line) => line.deliveredQuantity > 0);
    const deliveredAll = lines.every((line) => line.deliveredQuantity === line.quantity);
    const status = String(salesOrder.status);
    if (status === "draft" || status === "confirmed") return !deliveredAny;
    if (status === "partially_delivered") return deliveredAny && !deliveredAll;
    if (["fully_delivered", "invoiced", "completed"].includes(status)) return deliveredAll;
    return status === "cancelled" && !deliveredAll;
  });
}

function hasCoveredReservations(salesOrders: Record<string, unknown>[], stockMovements: Record<string, unknown>[]): boolean {
  const physical = new Map<string, number>();
  for (const movement of stockMovements) {
    const productId = String(movement.productId);
    const delta = movement.direction === "out" ? -Number(movement.quantity) : Number(movement.quantity);
    physical.set(productId, (physical.get(productId) ?? 0) + delta);
  }
  const reserved = new Map<string, number>();
  for (const order of salesOrders) {
    if (order.status !== "confirmed" && order.status !== "partially_delivered") continue;
    for (const line of order.lines as Array<{ productId: string; quantity: number; deliveredQuantity: number }>) reserved.set(line.productId, (reserved.get(line.productId) ?? 0) + line.quantity - line.deliveredQuantity);
  }
  return [...reserved].every(([productId, quantity]) => quantity <= (physical.get(productId) ?? 0));
}

function hasNonNegativeMovementHistory(stockMovements: Record<string, unknown>[]): boolean {
  const balances = new Map<string, number>();
  const ordered = [...stockMovements].sort((left, right) => compareStockMovementChronology(left as unknown as StockMovementChronologyKey, right as unknown as StockMovementChronologyKey));
  for (const movement of ordered) {
    const key = `${String(movement.warehouseId)}:${String(movement.productId)}`;
    const quantity = Number(movement.quantity);
    const delta = movement.direction === "out" ? -quantity : quantity;
    const balance = (balances.get(key) ?? 0) + delta;
    if (!Number.isFinite(balance) || balance < 0) return false;
    balances.set(key, balance);
  }
  return true;
}

function migrateErpV3(value: unknown): ErpState | null {
  if (!isRecord(value)) return null;
  const purchaseOrders = Array.isArray(value.purchaseOrders) ? value.purchaseOrders.map((order) => isRecord(order) ? { ...order, supplierQuotationId: order.supplierQuotationId ?? null } : order) : value.purchaseOrders;
  const followUps = Array.isArray(value.followUps) ? value.followUps.map((followUp) => isRecord(followUp) ? { ...followUp, approvalStatus: followUp.approvalStatus ?? "pending", approvedBy: followUp.approvedBy ?? null } : followUp) : value.followUps;
  return { ...value, requestForQuotations: Array.isArray(value.requestForQuotations) ? value.requestForQuotations : [], supplierQuotations: Array.isArray(value.supplierQuotations) ? value.supplierQuotations : [], purchaseOrders, followUps } as unknown as ErpState;
}

function migrateErpV4(value: unknown): ErpState | null {
  if (!isRecord(value) || !hasAuthorizedLegacyReceiptEvidence(value)) return null;
  const goodsReceipts = Array.isArray(value.goodsReceipts) ? value.goodsReceipts.map((receipt) => isRecord(receipt) && receipt.status === "posted" ? { ...receipt, status: "approved" } : receipt) : value.goodsReceipts;
  const stockMovements = Array.isArray(value.stockMovements) ? value.stockMovements.map((movement) => {
    if (!isRecord(movement)) return movement;
    if (movement.sourceType === "goods_receipt") {
      return { ...movement, reason: "Migrated posted goods receipt" };
    }
    return {
      ...movement,
      actorRole: movement.actorRole ?? "system",
      actorId: movement.actorId ?? (movement.sourceType === "seed" ? "system:seed" : "system:migrated-v4"),
      reason: movement.reason ?? (movement.sourceType === "seed" ? "Demo opening balance" : null),
    };
  }) : value.stockMovements;
  return { ...value, goodsReceipts, stockMovements, stockAdjustments: Array.isArray(value.stockAdjustments) ? value.stockAdjustments : [] } as unknown as ErpState;
}

function migrateErpV5(value: unknown): ErpState | null {
  if (!isRecord(value)) return null;
  const purchaseRequests = Array.isArray(value.purchaseRequests) ? value.purchaseRequests.map((request) => isRecord(request) ? { ...request, sourceSalesOrderId: request.sourceSalesOrderId ?? null } : request) : value.purchaseRequests;
  const salesOrders = migrateLegacySalesReservations(value.salesOrders, value.stockMovements);
  if (!salesOrders) return null;
  const stockMovements = Array.isArray(value.stockMovements) ? value.stockMovements.map((movement) => {
    if (!isRecord(movement)) return movement;
    const type = movement.sourceType === "seed" ? "opening" : movement.sourceType === "goods_receipt" ? "receipt" : movement.sourceType === "delivery_order" ? "delivery" : "adjustment";
    return { ...movement, type };
  }) : value.stockMovements;
  return { ...value, purchaseRequests, salesOrders, stockMovements } as unknown as ErpState;
}

function migrateErpV6(value: unknown): ErpState | null {
  if (!isRecord(value) || !Array.isArray(value.supplierInvoices) || !Array.isArray(value.customerInvoices) || !Array.isArray(value.payments)) return null;
  // Schema v6 did not persist source-document coverage or payment counterparties.
  // Existing finance rows therefore cannot be upgraded without inventing provenance.
  if (value.supplierInvoices.length > 0 || value.customerInvoices.length > 0 || value.payments.length > 0) return null;
  return value as unknown as ErpState;
}

function migrateErpV7(value: unknown): ErpState | null {
  if (!isRecord(value) || !Array.isArray(value.supplierCalls) || !Array.isArray(value.supplierApprovals) || !Array.isArray(value.supplierResults)) return null;
  // Schema v7 did not persist provider identity, call date, or the complete
  // human-approved commercial scope. Existing rows cannot be upgraded safely.
  if (value.supplierCalls.length > 0 || value.supplierApprovals.length > 0 || value.supplierResults.length > 0) return null;
  return value as unknown as ErpState;
}

function migrateErpV8(value: unknown): ErpState | null {
  if (!isRecord(value) || !Array.isArray(value.supplierCalls) || !Array.isArray(value.supplierResults)) return null;
  // Schema v8 did not persist transcript/lifecycle evidence or immutable result
  // provider provenance. Only untouched drafts can be upgraded without invention.
  if (value.supplierResults.length > 0 || value.supplierCalls.some((call) => !isRecord(call) || call.status !== "draft")) return null;
  const supplierCalls = value.supplierCalls.map((call) => ({
    ...(call as Record<string, unknown>),
    transcript: Array.isArray((call as Record<string, unknown>).transcript) ? (call as Record<string, unknown>).transcript : [],
    durationSeconds: (call as Record<string, unknown>).durationSeconds ?? 0,
    startedAt: (call as Record<string, unknown>).startedAt ?? null,
    endedAt: (call as Record<string, unknown>).endedAt ?? null,
  }));
  return { ...value, supplierCalls } as unknown as ErpState;
}

function migrateLegacySalesReservations(salesOrdersValue: unknown, stockMovementsValue: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(salesOrdersValue) || !Array.isArray(stockMovementsValue)) return null;
  const physical = new Map<string, number>();
  for (const movement of stockMovementsValue) {
    if (!isRecord(movement) || !hasString(movement.productId) || !hasNumber(movement.quantity) || !includes(["in", "out", "adjustment"], movement.direction)) return null;
    const delta = movement.direction === "out" ? -Math.abs(movement.quantity) : movement.direction === "in" ? Math.abs(movement.quantity) : movement.quantity;
    physical.set(movement.productId, (physical.get(movement.productId) ?? 0) + delta);
  }

  const normalized: Record<string, unknown>[] = [];
  const active: Array<{ index: number; fullyReserved: boolean; createdAt: string; id: string; lines: Array<{ productId: string; quantity: number; deliveredQuantity: number }> }> = [];
  for (const [index, orderValue] of salesOrdersValue.entries()) {
    if (!isRecord(orderValue) || !hasString(orderValue.id) || !hasString(orderValue.createdAt) || !includes(salesOrderStatuses, orderValue.status) || !Array.isArray(orderValue.lines) || orderValue.lines.length === 0) return null;
    const productIds = new Set<string>();
    let deliveredAny = false;
    let deliveredAll = true;
    let fullyReserved = true;
    const lines: Record<string, unknown>[] = [];
    const activeLines: Array<{ productId: string; quantity: number; deliveredQuantity: number }> = [];
    for (const lineValue of orderValue.lines) {
      if (!isRecord(lineValue) || !hasString(lineValue.productId) || productIds.has(lineValue.productId)
        || !hasNumber(lineValue.quantity) || !Number.isInteger(lineValue.quantity) || lineValue.quantity <= 0
        || !hasNumber(lineValue.deliveredQuantity) || !Number.isInteger(lineValue.deliveredQuantity) || lineValue.deliveredQuantity < 0 || lineValue.deliveredQuantity > lineValue.quantity
        || !hasNumber(lineValue.reservedQuantity) || !Number.isInteger(lineValue.reservedQuantity) || lineValue.reservedQuantity < lineValue.deliveredQuantity || lineValue.reservedQuantity > lineValue.quantity) return null;
      deliveredAny ||= lineValue.deliveredQuantity > 0;
      deliveredAll &&= lineValue.deliveredQuantity === lineValue.quantity;
      fullyReserved &&= lineValue.reservedQuantity === lineValue.quantity;
      productIds.add(lineValue.productId);
      const line = { ...lineValue };
      delete line.reservedQuantity;
      lines.push(line);
      activeLines.push({ productId: lineValue.productId, quantity: lineValue.quantity, deliveredQuantity: lineValue.deliveredQuantity });
    }
    const status = String(orderValue.status);
    if ((status === "draft" || status === "confirmed") && deliveredAny) return null;
    if (status === "partially_delivered" && (!deliveredAny || deliveredAll)) return null;
    if (["fully_delivered", "invoiced", "completed"].includes(status) && !deliveredAll) return null;
    if (status === "cancelled" && deliveredAll) return null;
    normalized.push({ ...orderValue, lines });
    if (status === "confirmed" || status === "partially_delivered") active.push({ index, fullyReserved, createdAt: orderValue.createdAt, id: orderValue.id, lines: activeLines });
  }

  const allocated = new Map<string, number>();
  active.sort((left, right) => Number(right.fullyReserved) - Number(left.fullyReserved) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  for (const candidate of active) {
    const covered = candidate.lines.every((line) => (allocated.get(line.productId) ?? 0) + line.quantity - line.deliveredQuantity <= (physical.get(line.productId) ?? 0));
    if (covered) {
      for (const line of candidate.lines) allocated.set(line.productId, (allocated.get(line.productId) ?? 0) + line.quantity - line.deliveredQuantity);
      continue;
    }
    const current = normalized[candidate.index];
    normalized[candidate.index] = { ...current, status: String(current.status) === "confirmed" ? "draft" : "cancelled" };
  }
  return normalized;
}

function hasAuthorizedLegacyReceiptEvidence(value: Record<string, unknown>): boolean {
  if (!Array.isArray(value.goodsReceipts) || !Array.isArray(value.stockMovements)) return false;
  const receipts = value.goodsReceipts as unknown[];
  if (!receipts.every((receipt) => isRecord(receipt) && hasString(receipt.id) && includes(["draft", "posted", "cancelled"], receipt.status))) return false;
  const receiptById = new Map(receipts.map((receipt) => [String((receipt as Record<string, unknown>).id), receipt as Record<string, unknown>]));
  return (value.stockMovements as unknown[]).every((movement) => {
    if (!isRecord(movement) || movement.sourceType !== "goods_receipt") return true;
    const receipt = hasString(movement.sourceId) ? receiptById.get(movement.sourceId) : undefined;
    return receipt?.status === "posted"
      && includes(["warehouse", "admin"], movement.actorRole)
      && movement.actorId === `role:${String(movement.actorRole)}`;
  });
}
