function canonicalSegment(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`${label} must be canonical text.`);
  }
  return value;
}

function dottedEntityKey(namespace: "erp" | "dealtwin", entity: string, id: string, label: string): string {
  return `${namespace}.${entity}:${canonicalSegment(id, label)}`;
}

export const QUERY_OPEN_AP_KEY = "query:open-ap";
export const QUERY_OPEN_AR_KEY = "query:open-ar";
export const QUERY_CASH_KEY = "query:cash";
export const QUERY_STOCK_KEY = "query:stock";
export const QUERY_ACTIVE_COMMITMENTS_KEY = "query:active-commitments";
export const DEALTWIN_COMMITMENT_KEY_PREFIX = "dealtwin.commitment:";

export function erpInvoiceKey(invoiceId: string): string {
  return dottedEntityKey("erp", "invoice", invoiceId, "Invoice id");
}
export function erpPaymentKey(paymentId: string): string {
  return dottedEntityKey("erp", "payment", paymentId, "Payment id");
}
export function erpCashMovementKey(movementId: string): string {
  return dottedEntityKey("erp", "cash_movement", movementId, "Cash movement id");
}
export function erpCashAccountKey(accountId: string): string {
  return dottedEntityKey("erp", "cash_account", accountId, "Cash account id");
}
export function erpPurchaseOrderKey(purchaseOrderId: string): string {
  return dottedEntityKey("erp", "purchase_order", purchaseOrderId, "Purchase order id");
}
export function erpGoodsReceiptKey(receiptId: string): string {
  return dottedEntityKey("erp", "goods_receipt", receiptId, "Goods receipt id");
}
export function erpSalesOrderKey(salesOrderId: string): string {
  return dottedEntityKey("erp", "sales_order", salesOrderId, "Sales Order id");
}
export function erpDeliveryKey(deliveryId: string): string {
  return dottedEntityKey("erp", "delivery", deliveryId, "Delivery id");
}
export function erpSupplierKey(supplierId: string): string {
  return dottedEntityKey("erp", "supplier", supplierId, "Supplier id");
}
export function erpCustomerKey(customerId: string): string {
  return dottedEntityKey("erp", "customer", customerId, "Customer id");
}
export function erpStockKey(productId: string, warehouseId: string): string {
  return `erp.stock:${canonicalSegment(productId, "Product id")}:${canonicalSegment(warehouseId, "Warehouse id")}`;
}
export function dealtwinCommitmentKey(commitmentId: string): string {
  return dottedEntityKey("dealtwin", "commitment", commitmentId, "Commitment id");
}
export function commitmentIdFromDependencyKey(key: string): string | null {
  if (typeof key !== "string" || !key.startsWith(DEALTWIN_COMMITMENT_KEY_PREFIX)) return null;
  const id = key.slice(DEALTWIN_COMMITMENT_KEY_PREFIX.length);
  return id.length > 0 && id.trim() === id ? id : null;
}
