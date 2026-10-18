export type ErpRole = "admin" | "procurement" | "warehouse" | "sales" | "finance" | "approver";
export type PurchaseOrderStatus = "draft" | "pending_approval" | "sent" | "confirmed" | "partially_received" | "fully_received" | "completed" | "rejected" | "cancelled";
export type RequestForQuotationStatus = "open" | "compared" | "selected" | "cancelled";
export type SupplierQuotationStatus = "submitted" | "selected" | "rejected";
export type SalesOrderStatus = "draft" | "confirmed" | "partially_delivered" | "fully_delivered" | "invoiced" | "completed" | "cancelled";
export type InvoiceStatus = "unpaid" | "partially_paid" | "paid" | "cancelled";

export interface QuantityLine { productId: string; quantity: number; unitPrice: number; }
export interface RfqLine { productId: string; quantity: number; }
export interface Product { id: string; sku: string; name: string; unit: string; salePrice: number; purchasePrice: number; reorderPoint: number; active: boolean; createdAt: string; updatedAt: string; }
export interface Supplier { id: string; code: string; name: string; phone: string; email: string; address: string; paymentTermDays: number; doNotContact: boolean; active: boolean; createdAt: string; updatedAt: string; }
export interface ErpCustomer { id: string; code: string; name: string; contactName: string; phone: string; email: string; address: string; creditLimit: number; active: boolean; createdAt: string; updatedAt: string; }
export interface Warehouse { id: string; code: string; name: string; address: string; active: boolean; createdAt: string; updatedAt: string; }
export interface PurchaseRequest { id: string; requestNumber: string; requesterRole: ErpRole; sourceSalesOrderId: string | null; status: "draft" | "submitted" | "approved" | "rejected" | "cancelled"; lines: QuantityLine[]; createdAt: string; updatedAt: string; }
export interface RequestForQuotation { id: string; rfqNumber: string; purchaseRequestId: string | null; warehouseId: string; requestedSupplierIds: string[]; selectedQuotationId: string | null; status: RequestForQuotationStatus; quoteDueAt: string; lines: RfqLine[]; createdAt: string; updatedAt: string; }
export interface SupplierQuotation { id: string; quotationNumber: string; requestForQuotationId: string; supplierId: string; status: SupplierQuotationStatus; validUntil: string; lines: QuantityLine[]; createdAt: string; updatedAt: string; }
export interface PurchaseOrder { id: string; orderNumber: string; supplierId: string; purchaseRequestId: string | null; supplierQuotationId: string | null; warehouseId: string; status: PurchaseOrderStatus; lines: QuantityLine[]; confirmationDueAt: string | null; promisedDeliveryDate: string | null; createdAt: string; updatedAt: string; }
export interface GoodsReceipt { id: string; receiptNumber: string; purchaseOrderId: string; warehouseId: string; status: "draft" | "approved" | "posted" | "cancelled"; lines: QuantityLine[]; createdAt: string; updatedAt: string; }
export interface SalesOrderLine extends QuantityLine { deliveredQuantity: number; }
export interface SalesOrder { id: string; orderNumber: string; customerId: string; warehouseId: string; status: SalesOrderStatus; lines: SalesOrderLine[]; createdAt: string; updatedAt: string; }
export interface DeliveryOrder { id: string; deliveryNumber: string; salesOrderId: string; warehouseId: string; status: "draft" | "posted" | "cancelled"; lines: QuantityLine[]; createdAt: string; updatedAt: string; }
export interface TradeInvoice { id: string; invoiceNumber: string; purchaseOrderId: string | null; salesOrderId: string | null; supplierId: string | null; customerId: string | null; sourceDocumentIds: string[]; status: InvoiceStatus; lines: QuantityLine[]; totalAmount: number; dueDate: string; createdAt: string; updatedAt: string; }
export interface Payment { id: string; paymentNumber: string; invoiceId: string; direction: "payable" | "receivable"; supplierId: string | null; customerId: string | null; amount: number; paymentDate: string; status: "posted" | "cancelled"; createdAt: string; updatedAt: string; }
export interface ErpCashAccount {
  id: string; code: string; name: string; currency: "IDR"; openingBalanceRupiah: string; openingBalanceDate: string;
  openingSourceType: string; openingSourceId: string; openingSourceRevision: string; active: boolean; createdAt: string; updatedAt: string;
}
export interface ErpCashMovement {
  id: string; accountId: string; effectiveDate: string; sameDayOrder: number; direction: "inflow" | "outflow"; amountRupiah: string;
  entryKind: "original" | "reversal"; reversesMovementId: string | null; sourceType: string; sourceId: string; sourceRevision: string;
  actorRole: ErpRole | "system"; actorId: string; reason: string; createdAt: string; updatedAt: string;
}
export interface OpeningCashBalanceInput {
  accountId: string; code: string; name: string; openingBalanceRupiah: string; openingBalanceDate: string;
  sourceType: string; sourceId: string; sourceRevision: string; actorId: string;
}
export interface CashMovementInput {
  accountId: string; effectiveDate: string; sameDayOrder: number; direction: "inflow" | "outflow"; amountRupiah: string;
  sourceType: string; sourceId: string; sourceRevision: string; actorId: string; reason: string;
}
export interface CashReversalInput {
  originalMovementId: string; effectiveDate: string; sameDayOrder: number; actorId: string; reason: string;
}
export interface StockMovement { id: string; type?: "opening" | "receipt" | "delivery" | "adjustment"; productId: string; warehouseId: string; quantity: number; direction: "in" | "out" | "adjustment"; sourceType: "seed" | "goods_receipt" | "delivery_order" | "adjustment"; sourceId: string; actorRole: ErpRole | "system"; actorId: string; reason: string | null; createdAt: string; updatedAt: string; }
export interface StockAdjustment { id: string; adjustmentNumber: string; productId: string; warehouseId: string; quantityDelta: number; reason: string; status: "pending" | "approved" | "rejected"; proposedByRole: ErpRole; approvedByRole: ErpRole | null; approvedAt: string | null; createdAt: string; updatedAt: string; }
export type SupplierCallScenario = "delivery_commitment" | "partial_delivery" | "stock_unavailable" | "price_discrepancy" | "failed_contact";
export interface SupplierCallTranscriptSegment {
  id: string; speaker: "AI" | "Supplier" | "System"; text: string; stage: number; offsetSeconds: number;
}
export interface SupplierCall {
  id: string; supplierId: string; purchaseOrderId: string; status: "draft" | "active" | "completed" | "ended_early" | "failed"; scenario: SupplierCallScenario;
  provider: "mock" | "calle" | null; providerCallId: string | null; calledLocalDate: string | null;
  transcript: SupplierCallTranscriptSegment[]; durationSeconds: number; startedAt: string | null; endedAt: string | null; createdAt: string; updatedAt: string;
}
export interface SupplierCallApproval {
  id: string; supplierCallId: string; supplierId: string; purchaseOrderId: string; status: "pending" | "approved" | "rejected";
  objective: string; permittedProductIds: string[]; maximumDeliveryDate: string; partialDeliveryAllowed: boolean;
  maximumUnitPriceIncreasePercent: number; language: string; approvedBy: string | null; approvedAt: string | null; createdAt: string; updatedAt: string;
}
export interface SupplierCallResult {
  id: string; supplierCallId: string; supplierId: string; purchaseOrderId: string; status: "pending" | "approved" | "rejected" | "human_review";
  scenario: SupplierCallScenario; sourceScenario: SupplierCallScenario; sourceProvider: "mock" | "calle"; sourceProviderCallId: string;
  promisedDeliveryDate: string | null; partialDeliveryDate: string | null; remainingDeliveryDate: string | null; followUpDate: string | null;
  reason: string | null; summary: string; sentiment: "positive" | "neutral" | "concerned"; createdAt: string; updatedAt: string;
}
export interface ErpDispute { id: string; supplierId: string | null; customerId: string | null; purchaseOrderId: string | null; salesOrderId: string | null; status: "open" | "investigating" | "resolved" | "cancelled"; reason: string; createdAt: string; updatedAt: string; }
export interface ErpFollowUp { id: string; supplierId: string | null; customerId: string | null; purchaseOrderId: string | null; salesOrderId: string | null; dueAt: string; status: "open" | "completed" | "cancelled"; approvalStatus: "pending" | "approved"; approvedBy: string | null; reason: string; createdAt: string; updatedAt: string; }
export interface ErpAuditEvent { id: string; entityType: string; entityId: string; action: string; actorRole: ErpRole | "system"; actorId: string; detail: Record<string, string | number | boolean | null>; createdAt: string; updatedAt: string; }

export interface ErpState {
  revision: number; activeRole: ErpRole; products: Product[]; suppliers: Supplier[]; customers: ErpCustomer[]; warehouses: Warehouse[];
  purchaseRequests: PurchaseRequest[]; requestForQuotations: RequestForQuotation[]; supplierQuotations: SupplierQuotation[]; purchaseOrders: PurchaseOrder[]; goodsReceipts: GoodsReceipt[]; salesOrders: SalesOrder[]; deliveryOrders: DeliveryOrder[];
  supplierInvoices: TradeInvoice[]; customerInvoices: TradeInvoice[]; payments: Payment[]; cashAccounts: ErpCashAccount[]; cashMovements: ErpCashMovement[]; stockMovements: StockMovement[]; stockAdjustments: StockAdjustment[]; supplierCalls: SupplierCall[];
  supplierApprovals: SupplierCallApproval[]; supplierResults: SupplierCallResult[]; disputes: ErpDispute[]; followUps: ErpFollowUp[]; auditLogs: ErpAuditEvent[];
}
