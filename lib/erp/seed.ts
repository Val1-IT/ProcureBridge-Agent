import type { ErpState } from "./types";

const seededAt = "2026-08-09T00:00:00.000Z";

const seed: ErpState = {
  revision: 0,
  activeRole: "admin",
  warehouses: [{ id: "warehouse-jakarta", code: "WH-JKT", name: "Gudang Jakarta", address: "Jakarta", active: true, createdAt: seededAt, updatedAt: seededAt }],
  products: [
    { id: "product-router", sku: "SKU-ROUTER-01", name: "Router Bisnis", unit: "unit", salePrice: 1_500_000, purchasePrice: 1_050_000, reorderPoint: 25, active: true, createdAt: seededAt, updatedAt: seededAt },
    { id: "product-scanner", sku: "SKU-SCANNER-01", name: "Barcode Scanner", unit: "unit", salePrice: 850_000, purchasePrice: 550_000, reorderPoint: 10, active: true, createdAt: seededAt, updatedAt: seededAt },
    { id: "product-paper", sku: "SKU-PAPER-80", name: "Kertas Thermal 80mm", unit: "roll", salePrice: 18_000, purchasePrice: 11_000, reorderPoint: 100, active: true, createdAt: seededAt, updatedAt: seededAt },
  ],
  suppliers: [
    { id: "supplier-utama", code: "SUP-UTAMA", name: "PT Teknologi Utama", phone: "+62 811 1000 2000", email: "procurement@teknologiutama.demo", address: "Jakarta", paymentTermDays: 30, doNotContact: false, active: true, createdAt: seededAt, updatedAt: seededAt },
    { id: "supplier-kertas", code: "SUP-KERTAS", name: "CV Kertas Nusantara", phone: "+62 812 3000 4000", email: "sales@kertasnusantara.demo", address: "Bandung", paymentTermDays: 14, doNotContact: false, active: true, createdAt: seededAt, updatedAt: seededAt },
  ],
  customers: [
    { id: "erp-customer-sinar", code: "CUS-SINAR", name: "PT Sinar Jaya Retail", contactName: "Budi Santoso", phone: "+62 812 4433 1098", email: "budi@sinarjaya.demo", address: "Jakarta", creditLimit: 50_000_000, active: true, createdAt: seededAt, updatedAt: seededAt },
    { id: "erp-customer-maju", code: "CUS-MAJU", name: "CV Maju Teknik", contactName: "Rina Wijaya", phone: "+62 811 7702 445", email: "rina@majuteknik.demo", address: "Bekasi", creditLimit: 30_000_000, active: true, createdAt: seededAt, updatedAt: seededAt },
  ],
  purchaseRequests: [],
  requestForQuotations: [], supplierQuotations: [],
  purchaseOrders: [{ id: "po-router-replenishment", orderNumber: "PO-2026-0001", supplierId: "supplier-utama", purchaseRequestId: null, supplierQuotationId: null, warehouseId: "warehouse-jakarta", status: "sent", lines: [{ productId: "product-router", quantity: 40, unitPrice: 1_050_000 }], confirmationDueAt: "2026-08-07T00:00:00.000Z", promisedDeliveryDate: null, createdAt: seededAt, updatedAt: seededAt }],
  goodsReceipts: [],
  salesOrders: [{ id: "so-router-shortage", orderNumber: "SO-2026-0001", customerId: "erp-customer-sinar", warehouseId: "warehouse-jakarta", status: "draft", lines: [{ productId: "product-router", quantity: 35, unitPrice: 1_500_000, deliveredQuantity: 0 }], createdAt: seededAt, updatedAt: seededAt }],
  deliveryOrders: [], supplierInvoices: [], customerInvoices: [], payments: [], cashAccounts: [], cashMovements: [],
  stockMovements: [
    { id: "stock-router-opening", type: "opening", productId: "product-router", warehouseId: "warehouse-jakarta", quantity: 30, direction: "in", sourceType: "seed", sourceId: "seed-opening", actorRole: "system", actorId: "system:seed", reason: "Demo opening balance", createdAt: seededAt, updatedAt: seededAt },
    { id: "stock-scanner-opening", type: "opening", productId: "product-scanner", warehouseId: "warehouse-jakarta", quantity: 15, direction: "in", sourceType: "seed", sourceId: "seed-opening", actorRole: "system", actorId: "system:seed", reason: "Demo opening balance", createdAt: seededAt, updatedAt: seededAt },
    { id: "stock-paper-opening", type: "opening", productId: "product-paper", warehouseId: "warehouse-jakarta", quantity: 120, direction: "in", sourceType: "seed", sourceId: "seed-opening", actorRole: "system", actorId: "system:seed", reason: "Demo opening balance", createdAt: seededAt, updatedAt: seededAt },
  ],
  stockAdjustments: [],
  supplierCalls: [], supplierApprovals: [], supplierResults: [], disputes: [], followUps: [], auditLogs: [],
};

export function createErpSeedState(): ErpState { return structuredClone(seed); }
