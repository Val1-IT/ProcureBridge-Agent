import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260809_000001_distributor_mini_erp.sql";

function normalizedSql(path: string) {
  return readFileSync(path, "utf8").toLowerCase().replace(/\s+/g, " ");
}

function tableNames(sql: string) {
  return [...sql.matchAll(/create table if not exists public\.([a-z0-9_]+)/g)].map((match) => match[1]);
}

function tableDeclaration(sql: string, table: string) {
  return sql.match(new RegExp(`create table if not exists public\\.${table} \\((.*?)\\);`))?.[1] ?? "";
}

function expectIndex(sql: string, table: string, columns: string) {
  expect(sql).toMatch(new RegExp(`create index if not exists [a-z0-9_]+ on public\\.${table}\\(${columns.replace(/[()]/g, "\\$&")}(?:, [^)]+)?\\)`));
}

describe("inactive distributor ERP SQL foundation", () => {
  it("defines every tenant-scoped ERP table", () => {
    const sql = normalizedSql(migrationPath);
    const requiredTables = [
      "erp_tenants", "erp_workspaces", "erp_products", "erp_suppliers", "erp_customers", "erp_warehouses",
      "erp_purchase_requests", "erp_purchase_request_lines", "erp_request_for_quotations", "erp_rfq_suppliers", "erp_rfq_lines",
      "erp_supplier_quotations", "erp_supplier_quotation_lines", "erp_purchase_orders", "erp_purchase_order_lines",
      "erp_goods_receipts", "erp_goods_receipt_lines", "erp_sales_orders", "erp_sales_order_lines",
      "erp_delivery_orders", "erp_delivery_order_lines", "erp_trade_invoices", "erp_trade_invoice_sources", "erp_trade_invoice_lines",
      "erp_supplier_call_approvals", "erp_supplier_call_approval_products", "erp_disputes", "erp_follow_ups", "erp_supplier_calls",
      "erp_supplier_call_transcript_segments", "erp_supplier_call_results", "erp_payments", "erp_stock_adjustments", "erp_stock_movements", "erp_audit_events",
    ];

    expect(tableNames(sql)).toEqual(expect.arrayContaining(requiredTables));
    for (const table of requiredTables.filter((name) => name !== "erp_tenants")) expect(tableDeclaration(sql, table), `${table} must be tenant scoped`).toMatch(/tenant_id text not null/);
  });

  it("enforces signed v10 stock movement semantics and strict numeric bounds", () => {
    const sql = normalizedSql(migrationPath);
    const movements = tableDeclaration(sql, "erp_stock_movements");

    expect(movements).toContain("type text not null");
    expect(movements).toContain("quantity numeric(18,4) not null check (quantity <> 0 and quantity = trunc(quantity))");
    for (const contract of [
      "source_type = 'seed' and type = 'opening' and direction = 'in' and quantity > 0",
      "source_type = 'goods_receipt' and type = 'receipt' and direction = 'in' and quantity > 0",
      "source_type = 'delivery_order' and type = 'delivery' and direction = 'out' and quantity > 0",
      "source_type = 'adjustment' and type = 'adjustment' and direction = 'adjustment' and quantity <> 0",
    ]) expect(movements).toContain(contract);
    expect(movements).toContain("source_type = 'seed' and actor_role = 'system'");
    expect(movements).toContain("source_type in ('goods_receipt', 'delivery_order') and actor_role in ('warehouse', 'admin')");
    expect(movements).toContain("source_type = 'adjustment' and actor_role in ('approver', 'admin')");



    expect(sql).toMatch(/sale_price numeric\(18,2\) not null check \(sale_price > 0\)/);
    expect(sql).toMatch(/purchase_price numeric\(18,2\) not null check \(purchase_price > 0\)/);
    expect(sql).toMatch(/total_amount numeric\(18,2\) not null check \(total_amount > 0\)/);
  });

  it("encodes tenant-safe provenance with typed invoice sources and party-parent checks", () => {
    const sql = normalizedSql(migrationPath);
    const invoiceSources = tableDeclaration(sql, "erp_trade_invoice_sources");

    expect(tableDeclaration(sql, "erp_purchase_requests")).toContain("source_sales_order_id is null or requester_role = 'sales'");
    expect(tableDeclaration(sql, "erp_request_for_quotations")).toContain("status = 'selected' and selected_quotation_id is not null");
    expect(tableDeclaration(sql, "erp_request_for_quotations")).toContain("status <> 'selected' and selected_quotation_id is null");

    expect(sql).toContain("foreign key (tenant_id, source_sales_order_id) references public.erp_sales_orders(tenant_id, id)");
    expect(sql).toContain("unique (tenant_id, id, request_for_quotation_id)");
    expect(sql).toContain("foreign key (tenant_id, selected_quotation_id, id) references public.erp_supplier_quotations(tenant_id, id, request_for_quotation_id)");
    expect(sql).toContain("foreign key (tenant_id, request_for_quotation_id, supplier_id) references public.erp_rfq_suppliers(tenant_id, request_for_quotation_id, supplier_id)");
    expect(sql).toContain("foreign key (tenant_id, supplier_quotation_id, supplier_id) references public.erp_supplier_quotations(tenant_id, id, supplier_id)");

    expect(invoiceSources).toContain("source_number integer not null check (source_number > 0)");
    expect(invoiceSources).toContain("goods_receipt_id text");
    expect(invoiceSources).toContain("delivery_order_id text");
    expect(invoiceSources).not.toMatch(/\bsource_document_id\b/);
    expect(invoiceSources).toContain("check ((goods_receipt_id is not null and delivery_order_id is null) or (goods_receipt_id is null and delivery_order_id is not null))");
    expect(invoiceSources).toContain("foreign key (tenant_id, goods_receipt_id) references public.erp_goods_receipts(tenant_id, id)");
    expect(invoiceSources).toContain("foreign key (tenant_id, delivery_order_id) references public.erp_delivery_orders(tenant_id, id)");

    const invoices = tableDeclaration(sql, "erp_trade_invoices");
    expect(invoices).toContain("purchase_order_id is not null and supplier_id is not null and sales_order_id is null and customer_id is null");
    expect(invoices).toContain("purchase_order_id is null and supplier_id is null and sales_order_id is not null and customer_id is not null");
    for (const table of ["erp_disputes", "erp_follow_ups"]) {
      const declaration = tableDeclaration(sql, table);
      expect(declaration).toContain("supplier_id is not null and purchase_order_id is not null and customer_id is null and sales_order_id is null");
      expect(declaration).toContain("supplier_id is null and purchase_order_id is null and customer_id is not null and sales_order_id is not null");
    }
  });

  it("matches v10 stock-adjustment and supplier-call scalar/role checks", () => {
    const sql = normalizedSql(migrationPath);
    const adjustments = tableDeclaration(sql, "erp_stock_adjustments");
    const approvals = tableDeclaration(sql, "erp_supplier_call_approvals");
    const transcripts = tableDeclaration(sql, "erp_supplier_call_transcript_segments");

    expect(adjustments).toContain("quantity_delta numeric(18,4) not null check (quantity_delta <> 0 and quantity_delta = trunc(quantity_delta))");
    expect(adjustments).toContain("proposed_by_role text not null check (proposed_by_role in ('warehouse', 'admin'))");
    expect(adjustments).toContain("approved_by_role text check (approved_by_role in ('approver', 'admin'))");
    expect(adjustments).toContain("approved_by_role <> proposed_by_role");
    expect(adjustments).toContain("status in ('pending', 'rejected') and approved_by_role is null and approved_at is null");
    expect(adjustments).toContain("status = 'approved' and approved_by_role is not null and approved_at is not null and approved_by_role <> proposed_by_role");
    expect(approvals).toContain("maximum_unit_price_increase_percent numeric(7,4) not null default 0 check (maximum_unit_price_increase_percent >= 0 and maximum_unit_price_increase_percent <= 100)");
    expect(transcripts).toContain("stage integer not null check (stage > 0)");
  });

  it("indexes every key tenant foreign key and line-product lookup", () => {
    const sql = normalizedSql(migrationPath);
    const indexes: Array<[string, string]> = [
      ["erp_purchase_requests", "tenant_id, source_sales_order_id"],
      ["erp_purchase_request_lines", "tenant_id, product_id"],
      ["erp_request_for_quotations", "tenant_id, purchase_request_id"], ["erp_request_for_quotations", "tenant_id, warehouse_id"], ["erp_request_for_quotations", "tenant_id, selected_quotation_id"],
      ["erp_rfq_suppliers", "tenant_id, supplier_id"], ["erp_rfq_lines", "tenant_id, product_id"],
      ["erp_supplier_quotations", "tenant_id, request_for_quotation_id, supplier_id"], ["erp_supplier_quotations", "tenant_id, supplier_id"],
      ["erp_supplier_quotation_lines", "tenant_id, product_id"],
      ["erp_purchase_orders", "tenant_id, supplier_id"], ["erp_purchase_orders", "tenant_id, purchase_request_id"], ["erp_purchase_orders", "tenant_id, supplier_quotation_id"], ["erp_purchase_orders", "tenant_id, warehouse_id"],
      ["erp_purchase_order_lines", "tenant_id, product_id"],
      ["erp_goods_receipts", "tenant_id, purchase_order_id"], ["erp_goods_receipts", "tenant_id, warehouse_id"], ["erp_goods_receipt_lines", "tenant_id, product_id"],
      ["erp_sales_orders", "tenant_id, customer_id"], ["erp_sales_orders", "tenant_id, warehouse_id"], ["erp_sales_order_lines", "tenant_id, product_id"],
      ["erp_delivery_orders", "tenant_id, sales_order_id"], ["erp_delivery_orders", "tenant_id, warehouse_id"], ["erp_delivery_order_lines", "tenant_id, product_id"],
      ["erp_trade_invoices", "tenant_id, purchase_order_id"], ["erp_trade_invoices", "tenant_id, sales_order_id"], ["erp_trade_invoices", "tenant_id, supplier_id"], ["erp_trade_invoices", "tenant_id, customer_id"],
      ["erp_trade_invoice_sources", "tenant_id, goods_receipt_id"], ["erp_trade_invoice_sources", "tenant_id, delivery_order_id"], ["erp_trade_invoice_lines", "tenant_id, product_id"],
      ["erp_payments", "tenant_id, invoice_id"], ["erp_payments", "tenant_id, supplier_id"], ["erp_payments", "tenant_id, customer_id"],
      ["erp_stock_adjustments", "tenant_id, product_id"], ["erp_stock_adjustments", "tenant_id, warehouse_id"], ["erp_stock_movements", "tenant_id, product_id, warehouse_id"], ["erp_stock_movements", "tenant_id, warehouse_id"],
      ["erp_supplier_calls", "tenant_id, supplier_id"], ["erp_supplier_calls", "tenant_id, purchase_order_id"],
      ["erp_supplier_call_approvals", "tenant_id, supplier_id"], ["erp_supplier_call_approvals", "tenant_id, purchase_order_id"], ["erp_supplier_call_approval_products", "tenant_id, product_id"],
      ["erp_supplier_call_results", "tenant_id, supplier_id"], ["erp_supplier_call_results", "tenant_id, purchase_order_id"],
      ["erp_disputes", "tenant_id, supplier_id"], ["erp_disputes", "tenant_id, customer_id"], ["erp_disputes", "tenant_id, purchase_order_id"], ["erp_disputes", "tenant_id, sales_order_id"],
      ["erp_follow_ups", "tenant_id, supplier_id"], ["erp_follow_ups", "tenant_id, customer_id"], ["erp_follow_ups", "tenant_id, purchase_order_id"], ["erp_follow_ups", "tenant_id, sales_order_id"],
    ];
    for (const [table, columns] of indexes) expectIndex(sql, table, columns);
  });

  it("keeps movement/audit evidence append-only and browser roles denied under RLS", () => {
    const sql = normalizedSql(migrationPath);
    for (const table of tableNames(sql)) expect(sql).toContain(`alter table public.${table} enable row level security`);
    expect(sql).toContain("revoke update, delete on table public.erp_stock_movements, public.erp_audit_events from service_role");
    expect(sql).toContain("grant select, insert on table public.erp_stock_movements, public.erp_audit_events to service_role");
    expect(sql).toContain("revoke all on table public.erp_tenants");
    expect(sql).toContain("from anon, authenticated");
    expect(sql).not.toMatch(/grant\s+[^;]*\s+to\s+(anon|authenticated)/);
    expect(sql).not.toMatch(/create policy[^;]*to\s+(anon|authenticated)/);
    expect(sql).not.toContain("security definer");
  });

  it("keeps the migration byte-for-byte appended to schema.sql without activating a client", () => {
    const migration = readFileSync(migrationPath, "utf8");
    const schema = readFileSync("supabase/schema.sql", "utf8");
    const repositorySource = readFileSync("lib/repository/erp-repository.ts", "utf8");

    expect(schema.endsWith(migration)).toBe(true);
    expect(migration.toLowerCase()).toContain("data api exposure");
    expect(repositorySource).not.toMatch(/supabase|process\.env|next_public/i);
  });
});
