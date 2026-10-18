import type { PoolClient } from "pg";
import { isValidServerErpState } from "../../demo/persistence";
import type {
  ErpAuditEvent, ErpCashAccount, ErpCashMovement, ErpCustomer, ErpRole, ErpState, PurchaseOrder,
  SalesOrder, SalesOrderLine, Supplier, Warehouse, GoodsReceipt, DeliveryOrder,
} from "../../erp/types";
import { fromErpProductRow, toErpProductRow } from "../../repository/mappers/erp-product-mapper";
import { fromErpPurchaseOrderRows, toErpPurchaseOrderRows } from "../../repository/mappers/erp-purchase-order-mapper";
import { fromErpStockMovementRow, toErpStockMovementRow } from "../../repository/mappers/erp-stock-movement-mapper";
import { fromErpTradeInvoiceRows, toErpTradeInvoiceRows } from "../../repository/mappers/erp-trade-invoice-mapper";
import {
  bool, enumText, expectedTenant, MapperError, nonNegativeInteger, nonNegativeNumeric,
  nullableStrictText, positiveInteger, positiveNumeric, nonZeroInteger,
  record, strictInstant, strictText,
} from "../../repository/mappers/mapper-utils";
import { PersistenceIntegrityError } from "./errors";
import { asIsoDate, parseNonNegativeSafeInteger, parseRupiahText, requireCanonicalText } from "./pg-codec";

const DATE_COLUMNS = new Set([
  "promised_delivery_date", "due_date", "payment_date", "opening_balance_date", "valid_until",
  "called_local_date", "maximum_delivery_date", "promised_delivery_date", "partial_delivery_date",
  "remaining_delivery_date", "follow_up_date", "effective_date",
]);

const ROLES = ["admin", "procurement", "warehouse", "sales", "finance", "approver"] as const;

function coerceRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (value instanceof Date) {
      out[key] = DATE_COLUMNS.has(key) ? asIsoDate(value, key) : value.toISOString();
    }
  }
  return out;
}

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new PersistenceIntegrityError("SQL identifier is invalid.");
  return name;
}

function group(rows: Record<string, unknown>[], key: string): Map<string, Record<string, unknown>[]> {
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const id = strictText(row, key, key);
    const list = grouped.get(id) ?? [];
    list.push(row);
    grouped.set(id, list);
  }
  return grouped;
}

async function selectRows(tx: PoolClient, sql: string, tenantId: string): Promise<Record<string, unknown>[]> {
  const result = await tx.query<Record<string, unknown>>(sql, [tenantId]);
  return result.rows.map((row) => coerceRow(row));
}

async function upsert(
  tx: PoolClient,
  table: string,
  rows: Record<string, unknown>[],
  conflict: readonly string[],
  update: readonly string[],
): Promise<void> {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]!);
  const values: unknown[] = [];
  const tuples = rows.map((row, index) => {
    const start = index * columns.length;
    for (const column of columns) values.push(row[column] ?? null);
    return `(${columns.map((_, offset) => `$${start + offset + 1}`).join(", ")})`;
  });
  const conflictSql = conflict.map(ident).join(", ");
  const updateSql = update.length === 0
    ? "do nothing"
    : `do update set ${update.map((column) => `${ident(column)} = excluded.${ident(column)}`).join(", ")}`;
  await tx.query(
    `insert into public.${ident(table)} (${columns.map(ident).join(", ")}) values ${tuples.join(", ")} on conflict (${conflictSql}) ${updateSql}`,
    values,
  );
}

async function insertOnly(tx: PoolClient, table: string, rows: Record<string, unknown>[]): Promise<void> {
  await upsert(tx, table, rows, ["tenant_id", "id"], []);
  for (const row of rows) {
    const columns = Object.keys(row);
    const verified = await tx.query(`select 1 from public.${ident(table)} where ${columns.map((column,index) => `${ident(column)} is not distinct from $${index + 1}`).join(" and ")}`,
      columns.map((column) => row[column] ?? null));
    if (verified.rows.length !== 1) throw new PersistenceIntegrityError("Append-only evidence cannot be rewritten by saveAtomic.");
  }
}

export function emptyMappedWorkspace(revision = 0, activeRole: ErpRole = "admin"): ErpState {
  return {
    revision,
    activeRole,
    products: [],
    suppliers: [],
    customers: [],
    warehouses: [],
    purchaseRequests: [],
    requestForQuotations: [],
    supplierQuotations: [],
    purchaseOrders: [],
    goodsReceipts: [],
    salesOrders: [],
    deliveryOrders: [],
    supplierInvoices: [],
    customerInvoices: [],
    payments: [],
    cashAccounts: [],
    cashMovements: [],
    stockMovements: [],
    stockAdjustments: [],
    supplierCalls: [],
    supplierApprovals: [],
    supplierResults: [],
    disputes: [],
    followUps: [],
    auditLogs: [],
  };
}

function fromSupplier(input: unknown, tenantId: string): Supplier {
  const row = record(input, "ERP supplier");
  expectedTenant(row, tenantId, "ERP supplier");
  return {
    id: strictText(row, "id", "ERP supplier"),
    code: strictText(row, "code", "ERP supplier"),
    name: strictText(row, "name", "ERP supplier"),
    phone: strictText(row, "phone", "ERP supplier"),
    email: strictText(row, "email", "ERP supplier"),
    address: strictText(row, "address", "ERP supplier"),
    paymentTermDays: nonNegativeInteger(row, "payment_term_days", "ERP supplier"),
    doNotContact: bool(row, "do_not_contact", "ERP supplier"),
    active: bool(row, "active", "ERP supplier"),
    createdAt: strictInstant(row, "created_at", "ERP supplier"),
    updatedAt: strictInstant(row, "updated_at", "ERP supplier"),
  };
}

function fromCustomer(input: unknown, tenantId: string): ErpCustomer {
  const row = record(input, "ERP customer");
  expectedTenant(row, tenantId, "ERP customer");
  return {
    id: strictText(row, "id", "ERP customer"),
    code: strictText(row, "code", "ERP customer"),
    name: strictText(row, "name", "ERP customer"),
    contactName: strictText(row, "contact_name", "ERP customer"),
    phone: strictText(row, "phone", "ERP customer"),
    email: strictText(row, "email", "ERP customer"),
    address: strictText(row, "address", "ERP customer"),
    creditLimit: nonNegativeNumeric(row, "credit_limit", "ERP customer", 2),
    active: bool(row, "active", "ERP customer"),
    createdAt: strictInstant(row, "created_at", "ERP customer"),
    updatedAt: strictInstant(row, "updated_at", "ERP customer"),
  };
}

function fromWarehouse(input: unknown, tenantId: string): Warehouse {
  const row = record(input, "ERP warehouse");
  expectedTenant(row, tenantId, "ERP warehouse");
  return {
    id: strictText(row, "id", "ERP warehouse"),
    code: strictText(row, "code", "ERP warehouse"),
    name: strictText(row, "name", "ERP warehouse"),
    address: strictText(row, "address", "ERP warehouse"),
    active: bool(row, "active", "ERP warehouse"),
    createdAt: strictInstant(row, "created_at", "ERP warehouse"),
    updatedAt: strictInstant(row, "updated_at", "ERP warehouse"),
  };
}

function fromSalesOrder(headerInput: unknown, lineInputs: unknown[], tenantId: string): SalesOrder {
  const header = record(headerInput, "ERP sales order");
  expectedTenant(header, tenantId, "ERP sales order");
  const id = strictText(header, "id", "ERP sales order");
  const parsed = lineInputs.map((input) => {
    const row = record(input, "ERP sales order line");
    expectedTenant(row, tenantId, "ERP sales order line");
    if (strictText(row, "sales_order_id", "ERP sales order line") !== id) {
      throw new MapperError("ERP sales order line", "sales_order_id does not match the header");
    }
    return {
      lineNumber: positiveInteger(row, "line_number", "ERP sales order line"),
      line: {
        productId: strictText(row, "product_id", "ERP sales order line"),
        quantity: positiveNumeric(row, "quantity", "ERP sales order line", 4),
        unitPrice: positiveNumeric(row, "unit_price", "ERP sales order line", 2),
        deliveredQuantity: nonNegativeNumeric(row, "delivered_quantity", "ERP sales order line", 4),
      } satisfies SalesOrderLine,
    };
  });
  if (parsed.length === 0) throw new MapperError("ERP sales order", "lines must not be empty");
  parsed.sort((left, right) => left.lineNumber - right.lineNumber);
  return {
    id,
    orderNumber: strictText(header, "order_number", "ERP sales order"),
    customerId: strictText(header, "customer_id", "ERP sales order"),
    warehouseId: strictText(header, "warehouse_id", "ERP sales order"),
    status: enumText(header, "status", ["draft", "confirmed", "partially_delivered", "fully_delivered", "invoiced", "completed", "cancelled"] as const, "ERP sales order"),
    lines: parsed.map(({ line }) => line),
    createdAt: strictInstant(header, "created_at", "ERP sales order"),
    updatedAt: strictInstant(header, "updated_at", "ERP sales order"),
  };
}

function fromCashAccount(input: unknown, tenantId: string): ErpCashAccount {
  const row = record(input, "ERP cash account");
  expectedTenant(row, tenantId, "ERP cash account");
  return {
    id: strictText(row, "id", "ERP cash account"),
    code: strictText(row, "code", "ERP cash account"),
    name: strictText(row, "name", "ERP cash account"),
    currency: enumText(row, "currency", ["IDR"] as const, "ERP cash account"),
    openingBalanceRupiah: parseRupiahText(row.opening_balance_rupiah, "openingBalanceRupiah"),
    openingBalanceDate: asIsoDate(row.opening_balance_date, "openingBalanceDate"),
    openingSourceType: strictText(row, "opening_source_type", "ERP cash account"),
    openingSourceId: strictText(row, "opening_source_id", "ERP cash account"),
    openingSourceRevision: strictText(row, "opening_source_revision", "ERP cash account"),
    active: bool(row, "active", "ERP cash account"),
    createdAt: strictInstant(row, "created_at", "ERP cash account"),
    updatedAt: strictInstant(row, "updated_at", "ERP cash account"),
  };
}

function fromCashMovement(input: unknown, tenantId: string): ErpCashMovement {
  const row = record(input, "ERP cash movement");
  expectedTenant(row, tenantId, "ERP cash movement");
  return {
    id: strictText(row, "id", "ERP cash movement"),
    accountId: strictText(row, "account_id", "ERP cash movement"),
    effectiveDate: asIsoDate(row.effective_date, "effectiveDate"),
    sameDayOrder: positiveInteger(row, "same_day_order", "ERP cash movement"),
    direction: enumText(row, "direction", ["inflow", "outflow"] as const, "ERP cash movement"),
    amountRupiah: parseRupiahText(row.amount_rupiah, "amountRupiah"),
    entryKind: enumText(row, "entry_kind", ["original", "reversal"] as const, "ERP cash movement"),
    reversesMovementId: nullableStrictText(row, "reverses_movement_id", "ERP cash movement"),
    sourceType: strictText(row, "source_type", "ERP cash movement"),
    sourceId: strictText(row, "source_id", "ERP cash movement"),
    sourceRevision: strictText(row, "source_revision", "ERP cash movement"),
    actorRole: enumText(row, "actor_role", [...ROLES, "system"] as const, "ERP cash movement"),
    actorId: strictText(row, "actor_id", "ERP cash movement"),
    reason: strictText(row, "reason", "ERP cash movement"),
    createdAt: strictInstant(row, "created_at", "ERP cash movement"),
    updatedAt: strictInstant(row, "updated_at", "ERP cash movement"),
  };
}

function fromAudit(input: unknown, tenantId: string): ErpAuditEvent {
  const row = record(input, "ERP audit");
  expectedTenant(row, tenantId, "ERP audit");
  const detail = row.detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) throw new MapperError("ERP audit", "detail must be an object");
  return {
    id: strictText(row, "id", "ERP audit"),
    entityType: strictText(row, "entity_type", "ERP audit"),
    entityId: strictText(row, "entity_id", "ERP audit"),
    action: strictText(row, "action", "ERP audit"),
    actorRole: enumText(row, "actor_role", [...ROLES, "system"] as const, "ERP audit"),
    actorId: strictText(row, "actor_id", "ERP audit"),
    detail: detail as ErpAuditEvent["detail"],
    createdAt: strictInstant(row, "created_at", "ERP audit"),
    updatedAt: strictInstant(row, "updated_at", "ERP audit"),
  };
}

export async function loadMappedWorkspace(tx: PoolClient, tenantId: string): Promise<ErpState> {
  const canonicalTenant = requireCanonicalText(tenantId, "tenantId");
  const workspace = await tx.query<{ revision: string; active_role: string }>(
    "select revision::text as revision, active_role from public.erp_workspaces where tenant_id = $1",
    [canonicalTenant],
  );
  if (workspace.rows.length !== 1) throw new PersistenceIntegrityError("Workspace row is missing.");
  const state = emptyMappedWorkspace(
    parseNonNegativeSafeInteger(workspace.rows[0]?.revision, "revision"),
    enumText({ active_role: workspace.rows[0]?.active_role }, "active_role", ROLES, "ERP workspace"),
  );

  const products = await selectRows(tx, "select * from public.erp_products where tenant_id = $1 order by ctid", canonicalTenant);
  state.products = products.map((row) => fromErpProductRow(row, canonicalTenant));
  state.suppliers = (await selectRows(tx, "select * from public.erp_suppliers where tenant_id = $1 order by ctid", canonicalTenant))
    .map((row) => fromSupplier(row, canonicalTenant));
  state.customers = (await selectRows(tx, "select * from public.erp_customers where tenant_id = $1 order by ctid", canonicalTenant))
    .map((row) => fromCustomer(row, canonicalTenant));
  state.warehouses = (await selectRows(tx, "select * from public.erp_warehouses where tenant_id = $1 order by ctid", canonicalTenant))
    .map((row) => fromWarehouse(row, canonicalTenant));

  const poHeaders = await selectRows(tx, "select * from public.erp_purchase_orders where tenant_id = $1 order by ctid", canonicalTenant);
  const poLines = await selectRows(tx, "select * from public.erp_purchase_order_lines where tenant_id = $1 order by line_number", canonicalTenant);
  const poLineMap = group(poLines, "purchase_order_id");
  state.purchaseOrders = poHeaders.map((header) => fromErpPurchaseOrderRows({ header, lines: poLineMap.get(strictText(header, "id", "PO")) ?? [] }, canonicalTenant));

  const soHeaders = await selectRows(tx, "select * from public.erp_sales_orders where tenant_id = $1 order by ctid", canonicalTenant);
  const soLines = await selectRows(tx, "select * from public.erp_sales_order_lines where tenant_id = $1 order by line_number", canonicalTenant);
  const soLineMap = group(soLines, "sales_order_id");
  state.salesOrders = soHeaders.map((header) => fromSalesOrder(header, soLineMap.get(strictText(header, "id", "SO")) ?? [], canonicalTenant));

  const receiptRows = await selectRows(tx, "select * from public.erp_goods_receipts where tenant_id = $1 order by id", canonicalTenant);
  const receiptLines = group(await selectRows(tx, "select * from public.erp_goods_receipt_lines where tenant_id = $1 order by line_number", canonicalTenant), "goods_receipt_id");
  state.goodsReceipts = receiptRows.map((row) => ({
    id: strictText(row, "id", "receipt"), receiptNumber: strictText(row, "receipt_number", "receipt"),
    purchaseOrderId: strictText(row, "purchase_order_id", "receipt"), warehouseId: strictText(row, "warehouse_id", "receipt"),
    status: enumText(row, "status", ["draft", "approved", "posted", "cancelled"] as const, "receipt"),
    lines: decodeQuantityLines(receiptLines.get(String(row.id)) ?? []),
    createdAt: strictInstant(row, "created_at", "receipt"), updatedAt: strictInstant(row, "updated_at", "receipt"),
  }));
  const deliveryRows = await selectRows(tx, "select * from public.erp_delivery_orders where tenant_id = $1 order by id", canonicalTenant);
  const deliveryLines = group(await selectRows(tx, "select * from public.erp_delivery_order_lines where tenant_id = $1 order by line_number", canonicalTenant), "delivery_order_id");
  state.deliveryOrders = deliveryRows.map((row) => ({
    id: strictText(row, "id", "delivery"), deliveryNumber: strictText(row, "delivery_number", "delivery"),
    salesOrderId: strictText(row, "sales_order_id", "delivery"), warehouseId: strictText(row, "warehouse_id", "delivery"),
    status: enumText(row, "status", ["draft", "posted", "cancelled"] as const, "delivery"),
    lines: decodeQuantityLines(deliveryLines.get(String(row.id)) ?? []),
    createdAt: strictInstant(row, "created_at", "delivery"), updatedAt: strictInstant(row, "updated_at", "delivery"),
  }));

  const stock = await selectRows(tx, "select * from public.erp_stock_movements where tenant_id = $1 order by ctid", canonicalTenant);
  state.stockMovements = stock.map((row) => fromErpStockMovementRow(row, canonicalTenant));
  state.stockAdjustments = (await selectRows(tx, "select * from public.erp_stock_adjustments where tenant_id = $1 order by ctid", canonicalTenant)).map(row => ({
    id: strictText(row, "id", "stock adjustment"), adjustmentNumber: strictText(row, "adjustment_number", "stock adjustment"),
    productId: strictText(row, "product_id", "stock adjustment"), warehouseId: strictText(row, "warehouse_id", "stock adjustment"),
    quantityDelta: nonZeroInteger(row, "quantity_delta", "stock adjustment"), reason: strictText(row, "reason", "stock adjustment"),
    status: enumText(row, "status", ["pending", "approved", "rejected"] as const, "stock adjustment"),
    proposedByRole: enumText(row, "proposed_by_role", ["warehouse", "admin"] as const, "stock adjustment"),
    approvedByRole: row.approved_by_role === null ? null : enumText(row, "approved_by_role", ["approver", "admin"] as const, "stock adjustment"),
    approvedAt: row.approved_at === null ? null : strictInstant(row, "approved_at", "stock adjustment"),
    createdAt: strictInstant(row, "created_at", "stock adjustment"), updatedAt: strictInstant(row, "updated_at", "stock adjustment"),
  }));

  const cash = await selectRows(tx, "select tenant_id, id, code, name, currency, opening_balance_rupiah::text as opening_balance_rupiah, opening_balance_date, opening_source_type, opening_source_id, opening_source_revision, active, created_at, updated_at from public.erp_cash_accounts where tenant_id = $1 order by ctid", canonicalTenant);
  state.cashAccounts = cash.map((row) => fromCashAccount(row, canonicalTenant));

  const movements = await selectRows(tx, "select tenant_id, id, account_id, effective_date, same_day_order, direction, amount_rupiah::text as amount_rupiah, entry_kind, reverses_movement_id, source_type, source_id, source_revision, actor_role, actor_id, reason, created_at, updated_at from public.erp_cash_movements where tenant_id = $1 order by ctid", canonicalTenant);
  state.cashMovements = movements.map((row) => fromCashMovement(row, canonicalTenant));

  const invoices = await selectRows(tx, "select * from public.erp_trade_invoices where tenant_id = $1 order by ctid", canonicalTenant);
  const invoiceLines = await selectRows(tx, "select * from public.erp_trade_invoice_lines where tenant_id = $1 order by line_number", canonicalTenant);
  const invoiceSources = await selectRows(tx, "select * from public.erp_trade_invoice_sources where tenant_id = $1 order by source_number", canonicalTenant);
  const invoiceLineMap = group(invoiceLines, "trade_invoice_id");
  const invoiceSourceMap = group(invoiceSources, "trade_invoice_id");
  const decodedInvoices = invoices.map((header) => fromErpTradeInvoiceRows({
    header,
    lines: invoiceLineMap.get(strictText(header, "id", "invoice")) ?? [],
    sources: invoiceSourceMap.get(strictText(header, "id", "invoice")) ?? [],
  }, canonicalTenant));
  state.supplierInvoices = decodedInvoices.filter((invoice) => invoice.supplierId !== null);
  state.customerInvoices = decodedInvoices.filter((invoice) => invoice.customerId !== null);

  state.payments = (await selectRows(tx, "select * from public.erp_payments where tenant_id = $1 order by id", canonicalTenant)).map((row) => ({
    id: strictText(row, "id", "payment"), paymentNumber: strictText(row, "payment_number", "payment"),
    invoiceId: strictText(row, "invoice_id", "payment"), direction: enumText(row, "direction", ["payable", "receivable"] as const, "payment"),
    supplierId: nullableStrictText(row, "supplier_id", "payment"), customerId: nullableStrictText(row, "customer_id", "payment"),
    amount: positiveNumeric(row, "amount", "payment", 2), paymentDate: asIsoDate(row.payment_date, "paymentDate"),
    status: enumText(row, "status", ["posted", "cancelled"] as const, "payment"),
    createdAt: strictInstant(row, "created_at", "payment"), updatedAt: strictInstant(row, "updated_at", "payment"),
  }));

  const audits = await selectRows(tx, "select * from public.erp_audit_events where tenant_id = $1 order by ctid", canonicalTenant);
  state.auditLogs = audits.map((row) => fromAudit(row, canonicalTenant));
  return state;
}

export async function saveMappedWorkspace(tx: PoolClient, tenantId: string, state: ErpState): Promise<void> {
  const canonicalTenant = requireCanonicalText(tenantId, "tenantId");
  if (!isValidServerErpState(state)) throw new PersistenceIntegrityError("Complete ERP state is invalid.");
  // Until these legacy aggregates have a server mapper, fail closed rather than silently losing them.
  const unsupported = [state.purchaseRequests, state.requestForQuotations, state.supplierQuotations,
    state.supplierCalls, state.supplierApprovals, state.supplierResults, state.disputes, state.followUps];
  if (unsupported.some((rows) => rows.length > 0)) throw new PersistenceIntegrityError("Unsupported legacy ERP aggregates require an explicit server mapper.");
  const productRows = state.products.map((product) => ({ ...toErpProductRow(product, canonicalTenant) }));
  await upsert(tx, "erp_products", productRows, ["tenant_id", "id"], ["sku", "name", "unit", "sale_price", "purchase_price", "reorder_point", "active", "created_at", "updated_at"]);
  await upsert(tx, "erp_suppliers", state.suppliers.map((supplier) => ({
    tenant_id: canonicalTenant, id: supplier.id, code: supplier.code, name: supplier.name, phone: supplier.phone,
    email: supplier.email, address: supplier.address, payment_term_days: supplier.paymentTermDays,
    do_not_contact: supplier.doNotContact, active: supplier.active, created_at: supplier.createdAt, updated_at: supplier.updatedAt,
  })), ["tenant_id", "id"], ["code", "name", "phone", "email", "address", "payment_term_days", "do_not_contact", "active", "created_at", "updated_at"]);
  await upsert(tx, "erp_customers", state.customers.map((customer) => ({
    tenant_id: canonicalTenant, id: customer.id, code: customer.code, name: customer.name, contact_name: customer.contactName,
    phone: customer.phone, email: customer.email, address: customer.address, credit_limit: customer.creditLimit,
    active: customer.active, created_at: customer.createdAt, updated_at: customer.updatedAt,
  })), ["tenant_id", "id"], ["code", "name", "contact_name", "phone", "email", "address", "credit_limit", "active", "created_at", "updated_at"]);
  await upsert(tx, "erp_warehouses", state.warehouses.map((warehouse) => ({
    tenant_id: canonicalTenant, id: warehouse.id, code: warehouse.code, name: warehouse.name, address: warehouse.address,
    active: warehouse.active, created_at: warehouse.createdAt, updated_at: warehouse.updatedAt,
  })), ["tenant_id", "id"], ["code", "name", "address", "active", "created_at", "updated_at"]);

  const salesHeaders = state.salesOrders.map((order) => ({
    tenant_id: canonicalTenant, id: order.id, order_number: order.orderNumber, customer_id: order.customerId,
    warehouse_id: order.warehouseId, status: order.status, created_at: order.createdAt, updated_at: order.updatedAt,
  }));
  await upsert(tx, "erp_sales_orders", salesHeaders, ["tenant_id", "id"], ["order_number", "customer_id", "warehouse_id", "status", "created_at", "updated_at"]);
  await upsert(
    tx,
    "erp_sales_order_lines",
    state.salesOrders.flatMap((order) => order.lines.map((line, index) => ({
      tenant_id: canonicalTenant, sales_order_id: order.id, line_number: index + 1, product_id: line.productId,
      quantity: line.quantity, unit_price: line.unitPrice, delivered_quantity: line.deliveredQuantity,
    }))),
    ["tenant_id", "sales_order_id", "line_number"],
    ["product_id", "quantity", "unit_price", "delivered_quantity"],
  );

  const purchaseOrders: PurchaseOrder[] = state.purchaseOrders;
  await upsert(
    tx,
    "erp_purchase_orders",
    purchaseOrders.map((order) => ({ ...toErpPurchaseOrderRows(order, canonicalTenant).header })),
    ["tenant_id", "id"],
    ["order_number", "supplier_id", "purchase_request_id", "supplier_quotation_id", "warehouse_id", "status", "confirmation_due_at", "promised_delivery_date", "created_at", "updated_at"],
  );
  await upsert(
    tx,
    "erp_purchase_order_lines",
    purchaseOrders.flatMap((order) => toErpPurchaseOrderRows(order, canonicalTenant).lines.map((line) => ({ ...line }))),
    ["tenant_id", "purchase_order_id", "line_number"],
    ["product_id", "quantity", "unit_price"],
  );

  await saveSourceDocuments(tx, canonicalTenant, state.goodsReceipts, state.deliveryOrders);

  await upsert(tx, "erp_cash_accounts", state.cashAccounts.map((account) => ({
    tenant_id: canonicalTenant, id: account.id, code: account.code, name: account.name, currency: account.currency,
    opening_balance_rupiah: account.openingBalanceRupiah, opening_balance_date: account.openingBalanceDate,
    opening_source_type: account.openingSourceType, opening_source_id: account.openingSourceId,
    opening_source_revision: account.openingSourceRevision, active: account.active,
    created_at: account.createdAt, updated_at: account.updatedAt,
  })), ["tenant_id", "id"], ["code", "name", "currency", "opening_balance_rupiah", "opening_balance_date", "opening_source_type", "opening_source_id", "opening_source_revision", "active", "created_at", "updated_at"]);

  await insertOnly(tx, "erp_cash_movements", state.cashMovements.map((movement) => ({
    tenant_id: canonicalTenant, id: movement.id, account_id: movement.accountId, effective_date: movement.effectiveDate,
    same_day_order: movement.sameDayOrder, direction: movement.direction, amount_rupiah: movement.amountRupiah,
    entry_kind: movement.entryKind, reverses_movement_id: movement.reversesMovementId, source_type: movement.sourceType,
    source_id: movement.sourceId, source_revision: movement.sourceRevision, actor_role: movement.actorRole,
    actor_id: movement.actorId, reason: movement.reason, created_at: movement.createdAt, updated_at: movement.updatedAt,
  })));

  await upsert(tx, "erp_stock_adjustments", state.stockAdjustments.map(row => ({
    tenant_id: canonicalTenant, id: row.id, adjustment_number: row.adjustmentNumber, product_id: row.productId,
    warehouse_id: row.warehouseId, quantity_delta: row.quantityDelta, reason: row.reason, status: row.status,
    proposed_by_role: row.proposedByRole, approved_by_role: row.approvedByRole, approved_at: row.approvedAt,
    created_at: row.createdAt, updated_at: row.updatedAt,
  })), ["tenant_id", "id"], ["adjustment_number", "product_id", "warehouse_id", "quantity_delta", "reason", "status", "proposed_by_role", "approved_by_role", "approved_at", "created_at", "updated_at"]);

  await insertOnly(tx, "erp_stock_movements", state.stockMovements.map((movement) => {
    const row = toErpStockMovementRow(movement, canonicalTenant);
    return { ...row };
  }));

  const invoices = [...state.supplierInvoices, ...state.customerInvoices];
  await upsert(
    tx,
    "erp_trade_invoices",
    invoices.map((invoice) => ({ ...toErpTradeInvoiceRows(invoice, canonicalTenant).header })),
    ["tenant_id", "id"],
    ["invoice_number", "purchase_order_id", "sales_order_id", "supplier_id", "customer_id", "status", "total_amount", "due_date", "created_at", "updated_at"],
  );
  await upsert(
    tx,
    "erp_trade_invoice_sources",
    invoices.flatMap((invoice) => toErpTradeInvoiceRows(invoice, canonicalTenant).sources.map((source) => ({ ...source }))),
    ["tenant_id", "trade_invoice_id", "source_number"],
    ["goods_receipt_id", "delivery_order_id"],
  );
  await upsert(
    tx,
    "erp_trade_invoice_lines",
    invoices.flatMap((invoice) => toErpTradeInvoiceRows(invoice, canonicalTenant).lines.map((line) => ({ ...line }))),
    ["tenant_id", "trade_invoice_id", "line_number"],
    ["product_id", "quantity", "unit_price"],
  );

  await upsert(tx, "erp_payments", state.payments.map((payment) => ({
    tenant_id: canonicalTenant, id: payment.id, payment_number: payment.paymentNumber, invoice_id: payment.invoiceId,
    direction: payment.direction, supplier_id: payment.supplierId, customer_id: payment.customerId,
    amount: payment.amount, payment_date: payment.paymentDate, status: payment.status, created_at: payment.createdAt, updated_at: payment.updatedAt,
  })), ["tenant_id", "id"], ["payment_number", "invoice_id", "direction", "supplier_id", "customer_id", "amount", "payment_date", "status", "created_at", "updated_at"]);

  await insertOnly(tx, "erp_audit_events", state.auditLogs.map((event) => ({
    tenant_id: canonicalTenant, id: event.id, entity_type: event.entityType, entity_id: event.entityId,
    action: event.action, actor_role: event.actorRole, actor_id: event.actorId, detail: event.detail,
    created_at: event.createdAt, updated_at: event.updatedAt,
  })));
}

function decodeQuantityLines(rows: Record<string, unknown>[]) {
  return rows.map((row) => ({
    productId: strictText(row, "product_id", "source line"),
    quantity: positiveNumeric(row, "quantity", "source line", 4), unitPrice: positiveNumeric(row, "unit_price", "source line", 2),
  }));
}

async function saveSourceDocuments(tx: PoolClient, tenantId: string, receipts: GoodsReceipt[], deliveries: DeliveryOrder[]): Promise<void> {
  await upsert(tx, "erp_goods_receipts", receipts.map((row) => ({
    tenant_id: tenantId, id: row.id, receipt_number: row.receiptNumber, purchase_order_id: row.purchaseOrderId,
    warehouse_id: row.warehouseId, status: row.status, created_at: row.createdAt, updated_at: row.updatedAt,
  })), ["tenant_id", "id"], ["receipt_number", "purchase_order_id", "warehouse_id", "status", "created_at", "updated_at"]);
  await upsert(tx, "erp_goods_receipt_lines", receipts.flatMap((row) => row.lines.map((line, index) => ({
    tenant_id: tenantId, goods_receipt_id: row.id, line_number: index + 1, product_id: line.productId, quantity: line.quantity, unit_price: line.unitPrice,
  }))), ["tenant_id", "goods_receipt_id", "line_number"], ["product_id", "quantity", "unit_price"]);
  await upsert(tx, "erp_delivery_orders", deliveries.map((row) => ({
    tenant_id: tenantId, id: row.id, delivery_number: row.deliveryNumber, sales_order_id: row.salesOrderId,
    warehouse_id: row.warehouseId, status: row.status, created_at: row.createdAt, updated_at: row.updatedAt,
  })), ["tenant_id", "id"], ["delivery_number", "sales_order_id", "warehouse_id", "status", "created_at", "updated_at"]);
  await upsert(tx, "erp_delivery_order_lines", deliveries.flatMap((row) => row.lines.map((line, index) => ({
    tenant_id: tenantId, delivery_order_id: row.id, line_number: index + 1, product_id: line.productId, quantity: line.quantity, unit_price: line.unitPrice,
  }))), ["tenant_id", "delivery_order_id", "line_number"], ["product_id", "quantity", "unit_price"]);
}
