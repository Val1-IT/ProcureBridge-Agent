import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260809_000001_distributor_mini_erp.sql";

function normalizedSql(path: string) {
  return readFileSync(path, "utf8").toLowerCase().replace(/\s+/g, " ");
}

function tableNames(sql: string) {
  return [...sql.matchAll(/create table if not exists public\.([a-z0-9_]+)/g)].map((match) => match[1]);
}

describe("inactive distributor ERP SQL foundation", () => {
  it("defines tenant-scoped master, transaction, line, approval, dispute, follow-up, call, result, payment, movement, and audit tables", () => {
    const sql = normalizedSql(migrationPath);
    const requiredTables = [
      "erp_tenants", "erp_workspaces", "erp_products", "erp_suppliers", "erp_customers", "erp_warehouses",
      "erp_purchase_requests", "erp_purchase_request_lines", "erp_request_for_quotations", "erp_rfq_lines",
      "erp_supplier_quotations", "erp_supplier_quotation_lines", "erp_purchase_orders", "erp_purchase_order_lines",
      "erp_goods_receipts", "erp_goods_receipt_lines", "erp_sales_orders", "erp_sales_order_lines",
      "erp_delivery_orders", "erp_delivery_order_lines", "erp_trade_invoices", "erp_trade_invoice_lines",
      "erp_supplier_call_approvals", "erp_disputes", "erp_follow_ups", "erp_supplier_calls", "erp_supplier_call_results",
      "erp_payments", "erp_stock_movements", "erp_audit_events",
    ];

    expect(tableNames(sql)).toEqual(expect.arrayContaining(requiredTables));
    for (const table of requiredTables.filter((name) => name !== "erp_tenants")) {
      const declaration = sql.match(new RegExp(`create table if not exists public\\.${table} \\((.*?)\\);`))?.[1];
      expect(declaration, `${table} must be tenant scoped`).toMatch(/tenant_id text not null/);
    }
  });

  it("enforces tenant-local document numbers, domain constraints, foreign keys, and useful indexes", () => {
    const sql = normalizedSql(migrationPath);

    for (const constraint of [
      "unique (tenant_id, sku)", "unique (tenant_id, order_number)", "unique (tenant_id, request_number)",
      "unique (tenant_id, rfq_number)", "unique (tenant_id, quotation_number)", "unique (tenant_id, receipt_number)",
      "unique (tenant_id, delivery_number)", "unique (tenant_id, invoice_number)", "unique (tenant_id, payment_number)",
      "unique (tenant_id, adjustment_number)",
    ]) expect(sql).toContain(constraint);

    expect(sql).toMatch(/sale_price numeric\(18,2\) not null check \(sale_price >= 0\)/);
    expect(sql).toMatch(/quantity numeric\(18,4\) not null check \(quantity > 0\)/);
    expect(sql).toMatch(/total_amount numeric\(18,2\) not null check \(total_amount >= 0\)/);
    expect(sql).toMatch(/foreign key \(tenant_id, product_id\) references public\.erp_products\(tenant_id, id\)/);
    expect(sql).toContain("create index if not exists erp_purchase_orders_tenant_status_idx");
    expect(sql).toContain("create index if not exists erp_stock_movements_tenant_product_warehouse_created_idx");
    expect(sql).toContain("create index if not exists erp_audit_events_tenant_entity_created_idx");
  });

  it("marks movements and audits append-only for the service role", () => {
    const sql = normalizedSql(migrationPath);

    expect(sql).toContain("revoke update, delete on table public.erp_stock_movements, public.erp_audit_events from service_role");
    expect(sql).toContain("grant select, insert on table public.erp_stock_movements, public.erp_audit_events to service_role");
    expect(sql).toContain("append-only");
  });

  it("enables RLS on every public ERP table while withholding browser-role access", () => {
    const sql = normalizedSql(migrationPath);
    const tables = tableNames(sql);

    for (const table of tables) expect(sql).toContain(`alter table public.${table} enable row level security`);
    expect(sql).toContain("revoke all on table public.erp_tenants");
    expect(sql).toContain("from anon, authenticated");
    expect(sql).not.toMatch(/grant\s+[^;]*\s+to\s+(anon|authenticated)/);
    expect(sql).not.toMatch(/create policy[^;]*to\s+(anon|authenticated)/);
    expect(sql).not.toContain("security definer");
  });

  it("keeps the checked-in schema synchronized without activating a client", () => {
    const migration = normalizedSql(migrationPath);
    const schema = normalizedSql("supabase/schema.sql");
    const repositorySource = readFileSync("lib/repository/erp-repository.ts", "utf8");

    expect(schema).toContain("create table if not exists public.erp_tenants");
    expect(schema).toContain("create table if not exists public.erp_audit_events");
    expect(schema).toContain("grant select, insert on table public.erp_stock_movements, public.erp_audit_events to service_role");
    expect(migration).toContain("data api exposure");
    expect(repositorySource).not.toMatch(/supabase|process\.env|next_public/i);
  });
});
