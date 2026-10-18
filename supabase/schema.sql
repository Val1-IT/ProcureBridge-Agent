-- Optional production persistence for Arvanta ProcureBridge Recovery Agent.
-- The local demo does not execute this schema and requires no Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  phone text not null,
  email text not null,
  preferred_language text not null default 'Bahasa Indonesia',
  timezone text not null default 'Asia/Jakarta',
  consent_status text not null check (consent_status in ('granted', 'missing', 'revoked')),
  allowed_call_start time not null,
  allowed_call_end time not null,
  do_not_contact boolean not null default false,
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_number text not null unique,
  original_amount numeric(18,2) not null check (original_amount >= 0),
  outstanding_amount numeric(18,2) not null check (outstanding_amount >= 0 and outstanding_amount <= original_amount),
  due_date date not null,
  days_overdue integer not null default 0 check (days_overdue >= 0),
  status text not null check (status in ('overdue', 'partially_paid', 'paid')),
  dispute_status text not null default 'none' check (dispute_status in ('none', 'open', 'resolved')),
  last_contact_at timestamptz,
  next_action_at timestamptz,
  contact_status text not null check (contact_status in ('ready_to_call', 'scheduled', 'promise_to_pay', 'disputed', 'human_review', 'paid', 'do_not_contact')),
  recommended_action text not null,
  product text not null,
  scenario text not null check (scenario in ('promise_to_pay', 'invoice_dispute', 'failed_contact')),
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  payment_history jsonb not null default '[]'::jsonb,
  contact_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  provider text not null check (provider in ('mock', 'calle')),
  provider_call_id text unique,
  status text not null,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  outcome text,
  sentiment text,
  recording_url text,
  transcript jsonb not null default '[]'::jsonb,
  ai_summary text,
  human_approved_by text,
  human_approved_at timestamptz,
  scenario text not null check (scenario in ('promise_to_pay', 'invoice_dispute', 'failed_contact')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.call_approvals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references public.calls(id) on delete cascade,
  objective text not null,
  minimum_payment numeric(18,2) not null check (minimum_payment >= 0),
  extension_allowed boolean not null default false,
  maximum_follow_up_date date not null,
  language text not null,
  call_time time not null,
  ai_disclosure_approved boolean not null default false,
  data_confirmed boolean not null default false,
  approved_by text not null,
  approved_at timestamptz not null default now()
);

create table if not exists public.payment_commitments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  call_id uuid not null references public.calls(id) on delete restrict,
  promised_amount numeric(18,2) not null check (promised_amount > 0),
  promised_date date not null,
  actual_amount numeric(18,2) not null default 0 check (actual_amount >= 0),
  status text not null check (status in ('upcoming', 'due_today', 'fulfilled', 'partially_fulfilled', 'broken_promise', 'rescheduled', 'cancelled')),
  follow_up_date date,
  follow_up_status text not null,
  assigned_owner text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  call_id uuid not null references public.calls(id) on delete restrict,
  category text not null,
  description text not null,
  requested_evidence text not null,
  assigned_to text not null,
  status text not null check (status in ('open', 'investigating', 'resolved')),
  due_date date not null,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor_type text not null check (actor_type in ('human', 'ai', 'system', 'provider')),
  actor_id text not null,
  before_data jsonb,
  after_data jsonb,
  api_request_id text,
  guardrail_violations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  event_id text primary key,
  call_id text not null,
  event_type text,
  occurred_at timestamptz not null,
  payload_hash text,
  received_at timestamptz not null default now()
);

create table if not exists public.webhook_call_state (
  call_id text primary key,
  latest_occurred_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists invoices_customer_status_idx on public.invoices(customer_id, status);
create index if not exists invoices_next_action_idx on public.invoices(next_action_at) where status = 'overdue';
create index if not exists calls_customer_started_idx on public.calls(customer_id, started_at desc);
create index if not exists calls_invoice_status_idx on public.calls(invoice_id, status);
create index if not exists commitments_status_date_idx on public.payment_commitments(status, promised_date);
create index if not exists disputes_invoice_status_idx on public.disputes(invoice_id, status);
create index if not exists audit_entity_created_idx on public.audit_logs(entity_type, entity_id, created_at desc);
create index if not exists webhook_call_occurred_idx on public.webhook_events(call_id, occurred_at desc);

alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.calls enable row level security;
alter table public.call_approvals enable row level security;
alter table public.payment_commitments enable row level security;
alter table public.disputes enable row level security;
alter table public.audit_logs enable row level security;
alter table public.webhook_events enable row level security;
alter table public.webhook_call_state enable row level security;

-- Server-only prototype boundary: no browser role receives table access.
revoke all on table public.customers, public.invoices, public.calls, public.call_approvals,
  public.payment_commitments, public.disputes, public.audit_logs, public.webhook_events,
  public.webhook_call_state
  from anon, authenticated;
grant all on table public.customers, public.invoices, public.calls, public.call_approvals,
  public.payment_commitments, public.disputes, public.audit_logs, public.webhook_events,
  public.webhook_call_state
  to service_role;

-- Optional, inactive persistence foundation for the distributor mini ERP.
-- The browser demo does not select this schema or a Supabase client.
-- Data API exposure is configured separately at deployment time. This migration
-- intentionally gives neither anon nor authenticated any table privileges.

create table if not exists public.erp_tenants (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_workspaces (
  tenant_id text not null primary key references public.erp_tenants(id) on delete restrict,
  revision bigint not null default 0 check (revision >= 0),
  active_role text not null check (active_role in ('admin', 'procurement', 'warehouse', 'sales', 'finance', 'approver')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_products (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, sku text not null, name text not null, unit text not null,
  sale_price numeric(18,2) not null check (sale_price > 0),
  purchase_price numeric(18,2) not null check (purchase_price > 0),
  reorder_point numeric(18,4) not null default 0 check (reorder_point >= 0),
  active boolean not null default true, created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, sku)
);

create table if not exists public.erp_suppliers (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, code text not null, name text not null, phone text not null, email text not null, address text not null,
  payment_term_days integer not null default 0 check (payment_term_days >= 0),
  do_not_contact boolean not null default false, active boolean not null default true,
  created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, code)
);

create table if not exists public.erp_customers (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, code text not null, name text not null, contact_name text not null,
  phone text not null, email text not null, address text not null,
  credit_limit numeric(18,2) not null default 0 check (credit_limit >= 0), active boolean not null default true,
  created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, code)
);

create table if not exists public.erp_warehouses (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, code text not null, name text not null, address text not null, active boolean not null default true,
  created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, code)
);

create table if not exists public.erp_purchase_requests (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, request_number text not null,
  requester_role text not null check (requester_role in ('admin', 'procurement', 'warehouse', 'sales', 'finance', 'approver')),
  source_sales_order_id text, status text not null check (status in ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, request_number),
  check (source_sales_order_id is null or requester_role = 'sales')
);

create table if not exists public.erp_purchase_request_lines (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  purchase_request_id text not null, line_number integer not null check (line_number > 0), product_id text not null,
  quantity numeric(18,4) not null check (quantity > 0), unit_price numeric(18,2) not null default 0 check (unit_price >= 0),
  primary key (tenant_id, purchase_request_id, line_number),
  foreign key (tenant_id, purchase_request_id) references public.erp_purchase_requests(tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.erp_products(tenant_id, id) on delete restrict
);

create table if not exists public.erp_request_for_quotations (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, rfq_number text not null, purchase_request_id text, warehouse_id text not null,
  selected_quotation_id text, status text not null check (status in ('open', 'compared', 'selected', 'cancelled')),
  quote_due_at timestamptz not null, created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, rfq_number),
  check ((status = 'selected' and selected_quotation_id is not null) or (status <> 'selected' and selected_quotation_id is null)),
  foreign key (tenant_id, purchase_request_id) references public.erp_purchase_requests(tenant_id, id) on delete restrict,
  foreign key (tenant_id, warehouse_id) references public.erp_warehouses(tenant_id, id) on delete restrict
);

create table if not exists public.erp_rfq_suppliers (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  request_for_quotation_id text not null, supplier_id text not null,
  primary key (tenant_id, request_for_quotation_id, supplier_id),
  foreign key (tenant_id, request_for_quotation_id) references public.erp_request_for_quotations(tenant_id, id) on delete cascade,
  foreign key (tenant_id, supplier_id) references public.erp_suppliers(tenant_id, id) on delete restrict
);

create table if not exists public.erp_rfq_lines (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  request_for_quotation_id text not null, line_number integer not null check (line_number > 0), product_id text not null,
  quantity numeric(18,4) not null check (quantity > 0),
  primary key (tenant_id, request_for_quotation_id, line_number),
  foreign key (tenant_id, request_for_quotation_id) references public.erp_request_for_quotations(tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.erp_products(tenant_id, id) on delete restrict
);

create table if not exists public.erp_supplier_quotations (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, quotation_number text not null, request_for_quotation_id text not null, supplier_id text not null,
  status text not null check (status in ('submitted', 'selected', 'rejected')), valid_until date not null,
  created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, quotation_number), unique (tenant_id, id, request_for_quotation_id), unique (tenant_id, id, supplier_id),
  foreign key (tenant_id, request_for_quotation_id) references public.erp_request_for_quotations(tenant_id, id) on delete restrict,
  foreign key (tenant_id, supplier_id) references public.erp_suppliers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, request_for_quotation_id, supplier_id) references public.erp_rfq_suppliers(tenant_id, request_for_quotation_id, supplier_id) on delete restrict
);

create table if not exists public.erp_supplier_quotation_lines (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  supplier_quotation_id text not null, line_number integer not null check (line_number > 0), product_id text not null,
  quantity numeric(18,4) not null check (quantity > 0), unit_price numeric(18,2) not null check (unit_price >= 0),
  primary key (tenant_id, supplier_quotation_id, line_number),
  foreign key (tenant_id, supplier_quotation_id) references public.erp_supplier_quotations(tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.erp_products(tenant_id, id) on delete restrict
);

create table if not exists public.erp_purchase_orders (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, order_number text not null, supplier_id text not null, purchase_request_id text,
  supplier_quotation_id text, warehouse_id text not null,
  status text not null check (status in ('draft', 'pending_approval', 'sent', 'confirmed', 'partially_received', 'fully_received', 'completed', 'rejected', 'cancelled')),
  confirmation_due_at timestamptz, promised_delivery_date date, created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, order_number),
  foreign key (tenant_id, supplier_id) references public.erp_suppliers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, purchase_request_id) references public.erp_purchase_requests(tenant_id, id) on delete restrict,
  foreign key (tenant_id, supplier_quotation_id, supplier_id) references public.erp_supplier_quotations(tenant_id, id, supplier_id) on delete restrict,
  foreign key (tenant_id, warehouse_id) references public.erp_warehouses(tenant_id, id) on delete restrict
);

create table if not exists public.erp_purchase_order_lines (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  purchase_order_id text not null, line_number integer not null check (line_number > 0), product_id text not null,
  quantity numeric(18,4) not null check (quantity > 0), unit_price numeric(18,2) not null check (unit_price >= 0),
  primary key (tenant_id, purchase_order_id, line_number),
  foreign key (tenant_id, purchase_order_id) references public.erp_purchase_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.erp_products(tenant_id, id) on delete restrict
);

create table if not exists public.erp_goods_receipts (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, receipt_number text not null, purchase_order_id text not null, warehouse_id text not null,
  status text not null check (status in ('draft', 'approved', 'posted', 'cancelled')),
  created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, receipt_number),
  foreign key (tenant_id, purchase_order_id) references public.erp_purchase_orders(tenant_id, id) on delete restrict,
  foreign key (tenant_id, warehouse_id) references public.erp_warehouses(tenant_id, id) on delete restrict
);

create table if not exists public.erp_goods_receipt_lines (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  goods_receipt_id text not null, line_number integer not null check (line_number > 0), product_id text not null,
  quantity numeric(18,4) not null check (quantity > 0), unit_price numeric(18,2) not null check (unit_price >= 0),
  primary key (tenant_id, goods_receipt_id, line_number),
  foreign key (tenant_id, goods_receipt_id) references public.erp_goods_receipts(tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.erp_products(tenant_id, id) on delete restrict
);

create table if not exists public.erp_sales_orders (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, order_number text not null, customer_id text not null, warehouse_id text not null,
  status text not null check (status in ('draft', 'confirmed', 'partially_delivered', 'fully_delivered', 'invoiced', 'completed', 'cancelled')),
  created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, order_number),
  foreign key (tenant_id, customer_id) references public.erp_customers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, warehouse_id) references public.erp_warehouses(tenant_id, id) on delete restrict
);

create table if not exists public.erp_sales_order_lines (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  sales_order_id text not null, line_number integer not null check (line_number > 0), product_id text not null,
  quantity numeric(18,4) not null check (quantity > 0), unit_price numeric(18,2) not null check (unit_price >= 0),
  delivered_quantity numeric(18,4) not null default 0 check (delivered_quantity >= 0 and delivered_quantity <= quantity),
  primary key (tenant_id, sales_order_id, line_number),
  foreign key (tenant_id, sales_order_id) references public.erp_sales_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.erp_products(tenant_id, id) on delete restrict
);

create table if not exists public.erp_delivery_orders (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, delivery_number text not null, sales_order_id text not null, warehouse_id text not null,
  status text not null check (status in ('draft', 'posted', 'cancelled')),
  created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, delivery_number),
  foreign key (tenant_id, sales_order_id) references public.erp_sales_orders(tenant_id, id) on delete restrict,
  foreign key (tenant_id, warehouse_id) references public.erp_warehouses(tenant_id, id) on delete restrict
);

create table if not exists public.erp_delivery_order_lines (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  delivery_order_id text not null, line_number integer not null check (line_number > 0), product_id text not null,
  quantity numeric(18,4) not null check (quantity > 0), unit_price numeric(18,2) not null check (unit_price >= 0),
  primary key (tenant_id, delivery_order_id, line_number),
  foreign key (tenant_id, delivery_order_id) references public.erp_delivery_orders(tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.erp_products(tenant_id, id) on delete restrict
);

create table if not exists public.erp_trade_invoices (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, invoice_number text not null, purchase_order_id text, sales_order_id text,
  supplier_id text, customer_id text, status text not null check (status in ('unpaid', 'partially_paid', 'paid', 'cancelled')),
  total_amount numeric(18,2) not null check (total_amount > 0), due_date date not null,
  created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, invoice_number),
  check ((purchase_order_id is not null and supplier_id is not null and sales_order_id is null and customer_id is null) or (purchase_order_id is null and supplier_id is null and sales_order_id is not null and customer_id is not null)),
  foreign key (tenant_id, purchase_order_id) references public.erp_purchase_orders(tenant_id, id) on delete restrict,
  foreign key (tenant_id, sales_order_id) references public.erp_sales_orders(tenant_id, id) on delete restrict,
  foreign key (tenant_id, supplier_id) references public.erp_suppliers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, customer_id) references public.erp_customers(tenant_id, id) on delete restrict
);

create table if not exists public.erp_trade_invoice_sources (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  trade_invoice_id text not null, source_number integer not null check (source_number > 0), goods_receipt_id text, delivery_order_id text,
  primary key (tenant_id, trade_invoice_id, source_number),
  unique (tenant_id, trade_invoice_id, goods_receipt_id),
  unique (tenant_id, trade_invoice_id, delivery_order_id),
  check ((goods_receipt_id is not null and delivery_order_id is null) or (goods_receipt_id is null and delivery_order_id is not null)),
  foreign key (tenant_id, trade_invoice_id) references public.erp_trade_invoices(tenant_id, id) on delete cascade,
  foreign key (tenant_id, goods_receipt_id) references public.erp_goods_receipts(tenant_id, id) on delete restrict,
  foreign key (tenant_id, delivery_order_id) references public.erp_delivery_orders(tenant_id, id) on delete restrict
);

create table if not exists public.erp_trade_invoice_lines (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  trade_invoice_id text not null, line_number integer not null check (line_number > 0), product_id text not null,
  quantity numeric(18,4) not null check (quantity > 0), unit_price numeric(18,2) not null check (unit_price >= 0),
  primary key (tenant_id, trade_invoice_id, line_number),
  foreign key (tenant_id, trade_invoice_id) references public.erp_trade_invoices(tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.erp_products(tenant_id, id) on delete restrict
);

create table if not exists public.erp_payments (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, payment_number text not null, invoice_id text not null,
  direction text not null check (direction in ('payable', 'receivable')), supplier_id text, customer_id text,
  amount numeric(18,2) not null check (amount > 0), payment_date date not null,
  status text not null check (status in ('posted', 'cancelled')), created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, payment_number),
  check ((direction = 'payable' and supplier_id is not null and customer_id is null) or (direction = 'receivable' and supplier_id is null and customer_id is not null)),
  foreign key (tenant_id, invoice_id) references public.erp_trade_invoices(tenant_id, id) on delete restrict,
  foreign key (tenant_id, supplier_id) references public.erp_suppliers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, customer_id) references public.erp_customers(tenant_id, id) on delete restrict
);

create table if not exists public.erp_stock_adjustments (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, adjustment_number text not null, product_id text not null, warehouse_id text not null,
  quantity_delta numeric(18,4) not null check (quantity_delta <> 0 and quantity_delta = trunc(quantity_delta)), reason text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  proposed_by_role text not null check (proposed_by_role in ('warehouse', 'admin')),
  approved_by_role text check (approved_by_role in ('approver', 'admin')),
  approved_at timestamptz, created_at timestamptz not null, updated_at timestamptz not null,
  check (
    (status = 'approved' and approved_by_role is not null and approved_at is not null and approved_by_role <> proposed_by_role)
    or (status in ('pending', 'rejected') and approved_by_role is null and approved_at is null)
  ),
  primary key (tenant_id, id), unique (tenant_id, adjustment_number),
  foreign key (tenant_id, product_id) references public.erp_products(tenant_id, id) on delete restrict,
  foreign key (tenant_id, warehouse_id) references public.erp_warehouses(tenant_id, id) on delete restrict
);

create table if not exists public.erp_stock_movements (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, type text not null check (type in ('opening', 'receipt', 'delivery', 'adjustment')),
  product_id text not null, warehouse_id text not null, quantity numeric(18,4) not null check (quantity <> 0 and quantity = trunc(quantity)),
  direction text not null check (direction in ('in', 'out', 'adjustment')),
  source_type text not null check (source_type in ('seed', 'goods_receipt', 'delivery_order', 'adjustment')),
  source_id text not null,
  actor_role text not null check (actor_role in ('admin', 'procurement', 'warehouse', 'sales', 'finance', 'approver', 'system')),
  actor_id text not null, reason text, created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id),
  foreign key (tenant_id, product_id) references public.erp_products(tenant_id, id) on delete restrict,
  check (
    (source_type = 'seed' and type = 'opening' and direction = 'in' and quantity > 0)
    or (source_type = 'goods_receipt' and type = 'receipt' and direction = 'in' and quantity > 0)
    or (source_type = 'delivery_order' and type = 'delivery' and direction = 'out' and quantity > 0)
    or (source_type = 'adjustment' and type = 'adjustment' and direction = 'adjustment' and quantity <> 0)
  ),
  check (
    (source_type = 'seed' and actor_role = 'system')
    or (source_type in ('goods_receipt', 'delivery_order') and actor_role in ('warehouse', 'admin'))
    or (source_type = 'adjustment' and actor_role in ('approver', 'admin'))
  ),
  foreign key (tenant_id, warehouse_id) references public.erp_warehouses(tenant_id, id) on delete restrict
);

create table if not exists public.erp_supplier_calls (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, supplier_id text not null, purchase_order_id text not null,
  status text not null check (status in ('draft', 'active', 'completed', 'ended_early', 'failed')),
  scenario text not null check (scenario in ('delivery_commitment', 'partial_delivery', 'stock_unavailable', 'price_discrepancy', 'failed_contact')),
  provider text check (provider in ('mock', 'calle')), provider_call_id text, called_local_date date,
  duration_seconds integer not null default 0 check (duration_seconds >= 0), started_at timestamptz, ended_at timestamptz,
  created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, provider, provider_call_id),
  foreign key (tenant_id, supplier_id) references public.erp_suppliers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, purchase_order_id) references public.erp_purchase_orders(tenant_id, id) on delete restrict
);

create table if not exists public.erp_supplier_call_transcript_segments (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  supplier_call_id text not null, id text not null, speaker text not null check (speaker in ('AI', 'Supplier', 'System')),
  text text not null, stage integer not null check (stage > 0), offset_seconds integer not null check (offset_seconds >= 0),
  primary key (tenant_id, supplier_call_id, id),
  foreign key (tenant_id, supplier_call_id) references public.erp_supplier_calls(tenant_id, id) on delete cascade
);

create table if not exists public.erp_supplier_call_approvals (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, supplier_call_id text not null, supplier_id text not null, purchase_order_id text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')), objective text not null,
  maximum_delivery_date date not null, partial_delivery_allowed boolean not null default false,
  maximum_unit_price_increase_percent numeric(7,4) not null default 0 check (maximum_unit_price_increase_percent >= 0 and maximum_unit_price_increase_percent <= 100),
  language text not null, approved_by text, approved_at timestamptz, created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, supplier_call_id),
  foreign key (tenant_id, supplier_call_id) references public.erp_supplier_calls(tenant_id, id) on delete cascade,
  foreign key (tenant_id, supplier_id) references public.erp_suppliers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, purchase_order_id) references public.erp_purchase_orders(tenant_id, id) on delete restrict
);

create table if not exists public.erp_supplier_call_approval_products (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  approval_id text not null, product_id text not null,
  primary key (tenant_id, approval_id, product_id),
  foreign key (tenant_id, approval_id) references public.erp_supplier_call_approvals(tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.erp_products(tenant_id, id) on delete restrict
);

create table if not exists public.erp_supplier_call_results (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, supplier_call_id text not null, supplier_id text not null, purchase_order_id text not null,
  status text not null check (status in ('pending', 'approved', 'rejected', 'human_review')),
  scenario text not null check (scenario in ('delivery_commitment', 'partial_delivery', 'stock_unavailable', 'price_discrepancy', 'failed_contact')),
  source_scenario text not null check (source_scenario in ('delivery_commitment', 'partial_delivery', 'stock_unavailable', 'price_discrepancy', 'failed_contact')),
  source_provider text not null check (source_provider in ('mock', 'calle')), source_provider_call_id text not null,
  promised_delivery_date date, partial_delivery_date date, remaining_delivery_date date, follow_up_date date,
  reason text, summary text not null, sentiment text not null check (sentiment in ('positive', 'neutral', 'concerned')),
  created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, supplier_call_id),
  foreign key (tenant_id, supplier_call_id) references public.erp_supplier_calls(tenant_id, id) on delete cascade,
  foreign key (tenant_id, supplier_id) references public.erp_suppliers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, purchase_order_id) references public.erp_purchase_orders(tenant_id, id) on delete restrict
);

create table if not exists public.erp_disputes (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, supplier_id text, customer_id text, purchase_order_id text, sales_order_id text,
  status text not null check (status in ('open', 'investigating', 'resolved', 'cancelled')), reason text not null,
  created_at timestamptz not null, updated_at timestamptz not null, primary key (tenant_id, id),
  check ((supplier_id is not null and purchase_order_id is not null and customer_id is null and sales_order_id is null) or (supplier_id is null and purchase_order_id is null and customer_id is not null and sales_order_id is not null)),
  foreign key (tenant_id, supplier_id) references public.erp_suppliers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, customer_id) references public.erp_customers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, purchase_order_id) references public.erp_purchase_orders(tenant_id, id) on delete restrict,
  foreign key (tenant_id, sales_order_id) references public.erp_sales_orders(tenant_id, id) on delete restrict
);

create table if not exists public.erp_follow_ups (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, supplier_id text, customer_id text, purchase_order_id text, sales_order_id text,
  due_at timestamptz not null, status text not null check (status in ('open', 'completed', 'cancelled')),
  approval_status text not null check (approval_status in ('pending', 'approved')), approved_by text, reason text not null,
  created_at timestamptz not null, updated_at timestamptz not null, primary key (tenant_id, id),
  check ((supplier_id is not null and purchase_order_id is not null and customer_id is null and sales_order_id is null) or (supplier_id is null and purchase_order_id is null and customer_id is not null and sales_order_id is not null)),
  foreign key (tenant_id, supplier_id) references public.erp_suppliers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, customer_id) references public.erp_customers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, purchase_order_id) references public.erp_purchase_orders(tenant_id, id) on delete restrict,
  foreign key (tenant_id, sales_order_id) references public.erp_sales_orders(tenant_id, id) on delete restrict
);

create table if not exists public.erp_audit_events (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, entity_type text not null, entity_id text not null, action text not null,
  actor_role text not null check (actor_role in ('admin', 'procurement', 'warehouse', 'sales', 'finance', 'approver', 'system')),
  actor_id text not null, detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null, updated_at timestamptz not null, primary key (tenant_id, id)
);
alter table public.erp_purchase_requests
  add constraint erp_purchase_requests_source_sales_order_fk
  foreign key (tenant_id, source_sales_order_id) references public.erp_sales_orders(tenant_id, id) on delete restrict;

alter table public.erp_request_for_quotations
  add constraint erp_request_for_quotations_selected_quotation_fk
  foreign key (tenant_id, selected_quotation_id, id) references public.erp_supplier_quotations(tenant_id, id, request_for_quotation_id) on delete restrict;

-- Tenant-prefixed indexes cover every non-primary foreign key and line-product lookup used by aggregate persistence.
create index if not exists erp_purchase_requests_tenant_source_so_idx on public.erp_purchase_requests(tenant_id, source_sales_order_id);
create index if not exists erp_purchase_request_lines_tenant_product_idx on public.erp_purchase_request_lines(tenant_id, product_id);
create index if not exists erp_rfqs_tenant_pr_idx on public.erp_request_for_quotations(tenant_id, purchase_request_id);
create index if not exists erp_rfqs_tenant_warehouse_idx on public.erp_request_for_quotations(tenant_id, warehouse_id);
create index if not exists erp_rfqs_tenant_selected_quote_idx on public.erp_request_for_quotations(tenant_id, selected_quotation_id);
create index if not exists erp_rfq_suppliers_tenant_supplier_idx on public.erp_rfq_suppliers(tenant_id, supplier_id);
create index if not exists erp_rfq_lines_tenant_product_idx on public.erp_rfq_lines(tenant_id, product_id);
create index if not exists erp_supplier_quotes_tenant_rfq_supplier_idx on public.erp_supplier_quotations(tenant_id, request_for_quotation_id, supplier_id);
create index if not exists erp_supplier_quotes_tenant_supplier_idx on public.erp_supplier_quotations(tenant_id, supplier_id);
create index if not exists erp_supplier_quote_lines_tenant_product_idx on public.erp_supplier_quotation_lines(tenant_id, product_id);
create index if not exists erp_purchase_orders_tenant_pr_idx on public.erp_purchase_orders(tenant_id, purchase_request_id);
create index if not exists erp_purchase_orders_tenant_quote_idx on public.erp_purchase_orders(tenant_id, supplier_quotation_id);
create index if not exists erp_purchase_orders_tenant_warehouse_idx on public.erp_purchase_orders(tenant_id, warehouse_id);
create index if not exists erp_purchase_order_lines_tenant_product_idx on public.erp_purchase_order_lines(tenant_id, product_id);
create index if not exists erp_goods_receipts_tenant_warehouse_idx on public.erp_goods_receipts(tenant_id, warehouse_id);
create index if not exists erp_goods_receipt_lines_tenant_product_idx on public.erp_goods_receipt_lines(tenant_id, product_id);
create index if not exists erp_sales_orders_tenant_customer_idx on public.erp_sales_orders(tenant_id, customer_id);
create index if not exists erp_sales_orders_tenant_warehouse_idx on public.erp_sales_orders(tenant_id, warehouse_id);
create index if not exists erp_sales_order_lines_tenant_product_idx on public.erp_sales_order_lines(tenant_id, product_id);
create index if not exists erp_delivery_orders_tenant_so_idx on public.erp_delivery_orders(tenant_id, sales_order_id);
create index if not exists erp_delivery_orders_tenant_warehouse_idx on public.erp_delivery_orders(tenant_id, warehouse_id);
create index if not exists erp_delivery_order_lines_tenant_product_idx on public.erp_delivery_order_lines(tenant_id, product_id);
create index if not exists erp_trade_invoices_tenant_po_idx on public.erp_trade_invoices(tenant_id, purchase_order_id);
create index if not exists erp_trade_invoices_tenant_so_idx on public.erp_trade_invoices(tenant_id, sales_order_id);
create index if not exists erp_trade_invoices_tenant_supplier_idx on public.erp_trade_invoices(tenant_id, supplier_id);
create index if not exists erp_trade_invoices_tenant_customer_idx on public.erp_trade_invoices(tenant_id, customer_id);
create index if not exists erp_trade_invoice_sources_tenant_gr_idx on public.erp_trade_invoice_sources(tenant_id, goods_receipt_id);
create index if not exists erp_trade_invoice_sources_tenant_do_idx on public.erp_trade_invoice_sources(tenant_id, delivery_order_id);
create index if not exists erp_trade_invoice_lines_tenant_product_idx on public.erp_trade_invoice_lines(tenant_id, product_id);
create index if not exists erp_payments_tenant_supplier_idx on public.erp_payments(tenant_id, supplier_id);
create index if not exists erp_payments_tenant_customer_idx on public.erp_payments(tenant_id, customer_id);
create index if not exists erp_stock_adjustments_tenant_product_idx on public.erp_stock_adjustments(tenant_id, product_id);
create index if not exists erp_stock_adjustments_tenant_warehouse_idx on public.erp_stock_adjustments(tenant_id, warehouse_id);
create index if not exists erp_stock_movements_tenant_warehouse_idx on public.erp_stock_movements(tenant_id, warehouse_id);
create index if not exists erp_supplier_calls_tenant_supplier_idx on public.erp_supplier_calls(tenant_id, supplier_id);
create index if not exists erp_call_approvals_tenant_supplier_idx on public.erp_supplier_call_approvals(tenant_id, supplier_id);
create index if not exists erp_call_approvals_tenant_po_idx on public.erp_supplier_call_approvals(tenant_id, purchase_order_id);
create index if not exists erp_call_approval_products_tenant_product_idx on public.erp_supplier_call_approval_products(tenant_id, product_id);
create index if not exists erp_call_results_tenant_supplier_idx on public.erp_supplier_call_results(tenant_id, supplier_id);
create index if not exists erp_call_results_tenant_po_idx on public.erp_supplier_call_results(tenant_id, purchase_order_id);
create index if not exists erp_disputes_tenant_supplier_idx on public.erp_disputes(tenant_id, supplier_id);
create index if not exists erp_disputes_tenant_customer_idx on public.erp_disputes(tenant_id, customer_id);
create index if not exists erp_disputes_tenant_po_idx on public.erp_disputes(tenant_id, purchase_order_id);
create index if not exists erp_disputes_tenant_so_idx on public.erp_disputes(tenant_id, sales_order_id);
create index if not exists erp_follow_ups_tenant_supplier_idx on public.erp_follow_ups(tenant_id, supplier_id);
create index if not exists erp_follow_ups_tenant_customer_idx on public.erp_follow_ups(tenant_id, customer_id);
create index if not exists erp_follow_ups_tenant_po_idx on public.erp_follow_ups(tenant_id, purchase_order_id);
create index if not exists erp_follow_ups_tenant_so_idx on public.erp_follow_ups(tenant_id, sales_order_id);


create index if not exists erp_purchase_orders_tenant_status_idx on public.erp_purchase_orders(tenant_id, status, created_at desc);
create index if not exists erp_purchase_orders_tenant_supplier_idx on public.erp_purchase_orders(tenant_id, supplier_id, created_at desc);
create index if not exists erp_goods_receipts_tenant_po_idx on public.erp_goods_receipts(tenant_id, purchase_order_id, created_at desc);
create index if not exists erp_sales_orders_tenant_status_idx on public.erp_sales_orders(tenant_id, status, created_at desc);
create index if not exists erp_trade_invoices_tenant_status_due_idx on public.erp_trade_invoices(tenant_id, status, due_date);
create index if not exists erp_payments_tenant_invoice_idx on public.erp_payments(tenant_id, invoice_id, payment_date desc);
create index if not exists erp_stock_movements_tenant_product_warehouse_created_idx on public.erp_stock_movements(tenant_id, product_id, warehouse_id, created_at, id);
create index if not exists erp_supplier_calls_tenant_po_created_idx on public.erp_supplier_calls(tenant_id, purchase_order_id, created_at desc);
create index if not exists erp_supplier_call_results_tenant_status_idx on public.erp_supplier_call_results(tenant_id, status, created_at desc);
create index if not exists erp_follow_ups_tenant_status_due_idx on public.erp_follow_ups(tenant_id, status, due_at);
create index if not exists erp_disputes_tenant_status_idx on public.erp_disputes(tenant_id, status, created_at desc);
create index if not exists erp_audit_events_tenant_entity_created_idx on public.erp_audit_events(tenant_id, entity_type, entity_id, created_at desc, id);

alter table public.erp_tenants enable row level security;
alter table public.erp_workspaces enable row level security;
alter table public.erp_products enable row level security;
alter table public.erp_suppliers enable row level security;
alter table public.erp_customers enable row level security;
alter table public.erp_warehouses enable row level security;
alter table public.erp_purchase_requests enable row level security;
alter table public.erp_purchase_request_lines enable row level security;
alter table public.erp_request_for_quotations enable row level security;
alter table public.erp_rfq_suppliers enable row level security;
alter table public.erp_rfq_lines enable row level security;
alter table public.erp_supplier_quotations enable row level security;
alter table public.erp_supplier_quotation_lines enable row level security;
alter table public.erp_purchase_orders enable row level security;
alter table public.erp_purchase_order_lines enable row level security;
alter table public.erp_goods_receipts enable row level security;
alter table public.erp_goods_receipt_lines enable row level security;
alter table public.erp_sales_orders enable row level security;
alter table public.erp_sales_order_lines enable row level security;
alter table public.erp_delivery_orders enable row level security;
alter table public.erp_delivery_order_lines enable row level security;
alter table public.erp_trade_invoices enable row level security;
alter table public.erp_trade_invoice_sources enable row level security;
alter table public.erp_trade_invoice_lines enable row level security;
alter table public.erp_payments enable row level security;
alter table public.erp_stock_adjustments enable row level security;
alter table public.erp_stock_movements enable row level security;
alter table public.erp_supplier_calls enable row level security;
alter table public.erp_supplier_call_transcript_segments enable row level security;
alter table public.erp_supplier_call_approvals enable row level security;
alter table public.erp_supplier_call_approval_products enable row level security;
alter table public.erp_supplier_call_results enable row level security;
alter table public.erp_disputes enable row level security;
alter table public.erp_follow_ups enable row level security;
alter table public.erp_audit_events enable row level security;

revoke all on table public.erp_tenants, public.erp_workspaces, public.erp_products, public.erp_suppliers,
  public.erp_customers, public.erp_warehouses, public.erp_purchase_requests, public.erp_purchase_request_lines,
  public.erp_request_for_quotations, public.erp_rfq_suppliers, public.erp_rfq_lines, public.erp_supplier_quotations,
  public.erp_supplier_quotation_lines, public.erp_purchase_orders, public.erp_purchase_order_lines,
  public.erp_goods_receipts, public.erp_goods_receipt_lines, public.erp_sales_orders, public.erp_sales_order_lines,
  public.erp_delivery_orders, public.erp_delivery_order_lines, public.erp_trade_invoices, public.erp_trade_invoice_sources,
  public.erp_trade_invoice_lines, public.erp_payments, public.erp_stock_adjustments, public.erp_stock_movements,
  public.erp_supplier_calls, public.erp_supplier_call_transcript_segments, public.erp_supplier_call_approvals,
  public.erp_supplier_call_approval_products, public.erp_supplier_call_results, public.erp_disputes, public.erp_follow_ups,
  public.erp_audit_events from anon, authenticated;

grant select, insert, update, delete on table public.erp_tenants, public.erp_workspaces, public.erp_products,
  public.erp_suppliers, public.erp_customers, public.erp_warehouses, public.erp_purchase_requests,
  public.erp_purchase_request_lines, public.erp_request_for_quotations, public.erp_rfq_suppliers, public.erp_rfq_lines,
  public.erp_supplier_quotations, public.erp_supplier_quotation_lines, public.erp_purchase_orders,
  public.erp_purchase_order_lines, public.erp_goods_receipts, public.erp_goods_receipt_lines, public.erp_sales_orders,
  public.erp_sales_order_lines, public.erp_delivery_orders, public.erp_delivery_order_lines, public.erp_trade_invoices,
  public.erp_trade_invoice_sources, public.erp_trade_invoice_lines, public.erp_payments, public.erp_stock_adjustments,
  public.erp_supplier_calls, public.erp_supplier_call_transcript_segments, public.erp_supplier_call_approvals,
  public.erp_supplier_call_approval_products, public.erp_supplier_call_results, public.erp_disputes, public.erp_follow_ups
  to service_role;

-- Stock movements and audit events are append-only evidence. Corrections are
-- represented by new rows; the application service cannot update or delete them.
revoke update, delete on table public.erp_stock_movements, public.erp_audit_events from service_role;
grant select, insert on table public.erp_stock_movements, public.erp_audit_events to service_role;

comment on table public.erp_stock_movements is 'Append-only inventory evidence; correct with a compensating movement.';
comment on table public.erp_audit_events is 'Append-only ERP audit evidence.';


-- DealTwin server foundation: cash ledgers, eight dealtwin_* tables, forced RLS, and least-privilege roles.
-- Login credentials are provisioned outside this migration.

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'dealtwin_app') then
    create role dealtwin_app nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'dealtwin_judge_reset') then
    create role dealtwin_judge_reset nologin nosuperuser nobypassrls;
  end if;
end
$roles$;

create table public.erp_cash_accounts (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null,
  code text not null,
  name text not null,
  currency text not null check (currency = 'IDR'),
  opening_balance_rupiah bigint not null check (opening_balance_rupiah >= 0),
  opening_balance_date date not null,
  opening_source_type text not null,
  opening_source_id text not null,
  opening_source_revision text not null,
  active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (tenant_id, id),
  unique (tenant_id, code)
);

create unique index erp_cash_accounts_one_active_idr_uidx
  on public.erp_cash_accounts (tenant_id)
  where active and currency = 'IDR';

create table public.erp_cash_movements (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null,
  account_id text not null,
  effective_date date not null,
  same_day_order integer not null check (same_day_order > 0),
  direction text not null check (direction in ('inflow', 'outflow')),
  amount_rupiah bigint not null check (amount_rupiah > 0),
  entry_kind text not null check (entry_kind in ('original', 'reversal')),
  reverses_movement_id text,
  reverses_entry_kind text generated always as (
    case when reverses_movement_id is null then null else 'original' end
  ) stored,
  source_type text not null,
  source_id text not null,
  source_revision text not null,
  actor_role text not null check (actor_role in ('admin', 'procurement', 'warehouse', 'sales', 'finance', 'approver', 'system')),
  actor_id text not null,
  reason text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (tenant_id, id),
  unique (tenant_id, id, entry_kind),
  unique (tenant_id, source_type, source_id),
  check (
    (entry_kind = 'original' and reverses_movement_id is null)
    or (entry_kind = 'reversal' and reverses_movement_id is not null)
  ),
  foreign key (tenant_id, account_id) references public.erp_cash_accounts(tenant_id, id) on delete restrict,
  foreign key (tenant_id, reverses_movement_id, reverses_entry_kind)
    references public.erp_cash_movements(tenant_id, id, entry_kind) on delete restrict
);

create unique index erp_cash_movements_reversal_of_original_uidx
  on public.erp_cash_movements (tenant_id, reverses_movement_id)
  where reverses_movement_id is not null;

create index erp_cash_movements_tenant_account_date_idx
  on public.erp_cash_movements (tenant_id, account_id, effective_date, same_day_order, id);

create or replace function public.erp_cash_movements_guard()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  account public.erp_cash_accounts%rowtype;
  original public.erp_cash_movements%rowtype;
begin
  if tg_op = 'UPDATE' then
    raise exception 'cash movements are append-only';
  end if;

  select * into account
  from public.erp_cash_accounts
  where tenant_id = new.tenant_id and id = new.account_id;
  if not found then
    raise exception 'cash movement account does not exist';
  end if;
  if new.effective_date < account.opening_balance_date
     or (new.effective_date = account.opening_balance_date and new.same_day_order <= 0) then
    raise exception 'cash movement precedes the opening anchor';
  end if;

  if new.entry_kind = 'reversal' then
    select * into original
    from public.erp_cash_movements
    where tenant_id = new.tenant_id and id = new.reverses_movement_id;
    if not found then
      raise exception 'reversal original does not exist';
    end if;
    if original.entry_kind <> 'original' then
      raise exception 'reversal must reference an original movement';
    end if;
    if original.account_id <> new.account_id then
      raise exception 'reversal account must match the original';
    end if;
    if original.amount_rupiah <> new.amount_rupiah then
      raise exception 'reversal amount must match the original';
    end if;
    if original.direction = new.direction then
      raise exception 'reversal direction must be opposite the original';
    end if;
    if new.effective_date < original.effective_date
       or (new.effective_date = original.effective_date and new.same_day_order < original.same_day_order) then
      raise exception 'reversal chronology must be at or after the original';
    end if;
    if new.source_type <> 'cash_movement_reversal' or new.source_id <> original.id then
      raise exception 'reversal provenance must identify the original movement';
    end if;
  end if;
  return new;
end
$fn$;

create trigger erp_cash_movements_guard
  before insert or update on public.erp_cash_movements
  for each row execute function public.erp_cash_movements_guard();

create table public.dealtwin_deals (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null,
  title text not null,
  customer_id text not null,
  status text not null check (status in ('DRAFT', 'COMPILED', 'PROOF_GENERATED', 'RESERVED', 'COMMITTED', 'STALE')),
  current_version_id text,
  committed_sales_order_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.erp_customers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, committed_sales_order_id) references public.erp_sales_orders(tenant_id, id) on delete restrict
);

create index dealtwin_deals_tenant_customer_idx on public.dealtwin_deals (tenant_id, customer_id);
create index dealtwin_deals_tenant_current_version_idx on public.dealtwin_deals (tenant_id, current_version_id);
create index dealtwin_deals_tenant_committed_so_idx on public.dealtwin_deals (tenant_id, committed_sales_order_id);
create index dealtwin_deals_tenant_status_idx on public.dealtwin_deals (tenant_id, status, created_at desc);

create table public.dealtwin_deal_versions (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null,
  deal_id text not null,
  version bigint not null check (version > 0),
  terms jsonb not null,
  terms_hash text not null check (terms_hash ~ '^[0-9a-f]{64}$'),
  created_by text not null,
  created_at timestamptz not null,
  primary key (tenant_id, id),
  unique (tenant_id, deal_id, version),
  foreign key (tenant_id, deal_id) references public.dealtwin_deals(tenant_id, id) on delete restrict
);

create index dealtwin_deal_versions_tenant_deal_idx on public.dealtwin_deal_versions (tenant_id, deal_id);
create unique index dealtwin_deal_versions_tenant_deal_id_uidx
  on public.dealtwin_deal_versions (tenant_id, deal_id, id);

alter table public.dealtwin_deals
  add constraint dealtwin_deals_current_version_fk
  foreign key (tenant_id, id, current_version_id)
  references public.dealtwin_deal_versions (tenant_id, deal_id, id) on delete restrict;

create table public.dealtwin_constraints (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null,
  deal_version_id text not null,
  position integer not null check (position > 0),
  kind text not null check (kind in (
    'customer_deposit_max_bps', 'customer_deposit_min_bps', 'customer_balance_due_days',
    'supplier_payment_due_days', 'protect_existing_supplier_due_dates', 'new_borrowing_allowed',
    'minimum_cash_rupiah', 'required_inventory_available', 'required_approval'
  )),
  operator text not null check (operator in ('lte', 'gte', 'eq')),
  value jsonb not null,
  provenance text not null check (provenance in ('user_confirmed', 'erp_policy', 'ai_extracted', 'judge_seed')),
  resolution text not null check (resolution in ('confirmed', 'pending_confirmation', 'unresolved')),
  approval_requirement text,
  created_at timestamptz not null,
  primary key (tenant_id, id),
  unique (tenant_id, deal_version_id, position),
  foreign key (tenant_id, deal_version_id) references public.dealtwin_deal_versions(tenant_id, id) on delete restrict
);

create index dealtwin_constraints_tenant_version_idx on public.dealtwin_constraints (tenant_id, deal_version_id);

create table public.dealtwin_erp_snapshots (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null,
  erp_revision bigint not null check (erp_revision >= 0),
  as_of_date date not null,
  requested_horizon_end date not null,
  adapter_version text not null,
  dependency_keys text[] not null,
  dependency_manifest jsonb not null,
  canonical_events jsonb not null,
  state_hash text not null check (state_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null,
  primary key (tenant_id, id)
);

create index dealtwin_erp_snapshots_tenant_revision_idx on public.dealtwin_erp_snapshots (tenant_id, erp_revision);

create table public.dealtwin_compile_runs (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null,
  deal_version_id text not null,
  snapshot_id text not null,
  kind text not null check (kind in ('base', 'stress', 'recompile')),
  engine_version text not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  result_hash text not null check (result_hash ~ '^[0-9a-f]{64}$'),
  outcome text not null check (outcome in ('COMPILES', 'CONDITIONALLY_VALID', 'DOES_NOT_COMPILE', 'UNRESOLVED')),
  cash_floor_rupiah bigint not null check (cash_floor_rupiah >= 0),
  shortfall_rupiah bigint check (shortfall_rupiah is null or shortfall_rupiah >= 0),
  worst_minimum_rupiah bigint,
  first_violation_date date,
  violation_data jsonb not null,
  parent_run_id text,
  created_at timestamptz not null,
  primary key (tenant_id, id),
  foreign key (tenant_id, deal_version_id) references public.dealtwin_deal_versions(tenant_id, id) on delete restrict,
  foreign key (tenant_id, snapshot_id) references public.dealtwin_erp_snapshots(tenant_id, id) on delete restrict,
  foreign key (tenant_id, parent_run_id) references public.dealtwin_compile_runs(tenant_id, id) on delete restrict
);

create index dealtwin_compile_runs_tenant_version_idx on public.dealtwin_compile_runs (tenant_id, deal_version_id);
create index dealtwin_compile_runs_tenant_snapshot_idx on public.dealtwin_compile_runs (tenant_id, snapshot_id);
create index dealtwin_compile_runs_tenant_parent_idx on public.dealtwin_compile_runs (tenant_id, parent_run_id);

create table public.dealtwin_proofs (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null,
  compile_run_id text not null,
  deal_id text not null,
  deal_version_id text not null,
  proof_hash text not null check (proof_hash ~ '^[0-9a-f]{64}$'),
  result_hash text not null check (result_hash ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('VALID', 'CONDITIONALLY_VALID', 'STALE', 'INVALID')),
  stale_reason text,
  dependency_keys text[] not null,
  proof_json jsonb not null,
  generated_at timestamptz not null,
  replayed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (tenant_id, id),
  unique (tenant_id, compile_run_id),
  foreign key (tenant_id, compile_run_id) references public.dealtwin_compile_runs(tenant_id, id) on delete restrict,
  foreign key (tenant_id, deal_id) references public.dealtwin_deals(tenant_id, id) on delete restrict,
  foreign key (tenant_id, deal_version_id) references public.dealtwin_deal_versions(tenant_id, id) on delete restrict
);

create index dealtwin_proofs_tenant_version_idx on public.dealtwin_proofs (tenant_id, deal_version_id);
create index dealtwin_proofs_tenant_status_idx on public.dealtwin_proofs (tenant_id, status);

create table public.dealtwin_approvals (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null,
  deal_version_id text not null,
  proof_id text not null,
  requirement_code text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  decided_by text,
  decided_at timestamptz,
  comment text,
  decision_idempotency_key text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (tenant_id, id),
  unique (tenant_id, proof_id, deal_version_id, requirement_code),
  foreign key (tenant_id, proof_id) references public.dealtwin_proofs(tenant_id, id) on delete restrict,
  foreign key (tenant_id, deal_version_id) references public.dealtwin_deal_versions(tenant_id, id) on delete restrict
);

create unique index dealtwin_approvals_decision_idempotency_uidx
  on public.dealtwin_approvals (tenant_id, decision_idempotency_key)
  where decision_idempotency_key is not null;

create index dealtwin_approvals_tenant_version_idx on public.dealtwin_approvals (tenant_id, deal_version_id);

create table public.dealtwin_liquidity_commitments (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null,
  proof_id text not null,
  deal_version_id text not null,
  account_id text not null,
  canonical_event_hash text not null check (canonical_event_hash ~ '^[0-9a-f]{64}$'),
  canonical_events jsonb not null,
  amount_rupiah bigint not null check (amount_rupiah > 0),
  direction text not null check (direction in ('inflow', 'outflow')),
  status text not null check (status in ('reserved', 'committed', 'released', 'expired', 'cancelled')),
  reserve_idempotency_key text not null,
  commit_idempotency_key text,
  release_idempotency_key text,
  expires_at timestamptz,
  released_at timestamptz,
  release_evidence jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (tenant_id, id),
  unique (tenant_id, proof_id, deal_version_id, canonical_event_hash),
  foreign key (tenant_id, proof_id) references public.dealtwin_proofs(tenant_id, id) on delete restrict,
  foreign key (tenant_id, deal_version_id) references public.dealtwin_deal_versions(tenant_id, id) on delete restrict,
  foreign key (tenant_id, account_id) references public.erp_cash_accounts(tenant_id, id) on delete restrict
);

create unique index dealtwin_commitments_reserve_idempotency_uidx
  on public.dealtwin_liquidity_commitments (tenant_id, reserve_idempotency_key)
  where reserve_idempotency_key is not null;
create unique index dealtwin_commitments_commit_idempotency_uidx
  on public.dealtwin_liquidity_commitments (tenant_id, commit_idempotency_key)
  where commit_idempotency_key is not null;
create unique index dealtwin_commitments_release_idempotency_uidx
  on public.dealtwin_liquidity_commitments (tenant_id, release_idempotency_key)
  where release_idempotency_key is not null;
create index dealtwin_commitments_tenant_account_idx
  on public.dealtwin_liquidity_commitments (tenant_id, account_id);
create index dealtwin_commitments_tenant_active_status_idx
  on public.dealtwin_liquidity_commitments (tenant_id, status)
  where status in ('reserved', 'committed');

create or replace function public.dealtwin_commitment_events_guard()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  event jsonb;
begin
  if tg_op = 'UPDATE' and (
    new.canonical_events is distinct from old.canonical_events
    or new.canonical_event_hash is distinct from old.canonical_event_hash
  ) then
    raise exception 'commitment canonical events are immutable';
  end if;
  if jsonb_typeof(new.canonical_events) <> 'array' then
    raise exception 'commitment canonical events must be a JSON array';
  end if;
  for event in select value from jsonb_array_elements(new.canonical_events)
  loop
    if jsonb_typeof(event->'amountRupiah') is distinct from 'string' then
      raise exception 'commitment events must carry exact money strings';
    end if;
  end loop;
  return new;
end
$fn$;

create trigger dealtwin_commitment_events_guard
  before insert or update on public.dealtwin_liquidity_commitments
  for each row execute function public.dealtwin_commitment_events_guard();

alter table public.erp_audit_events
  add constraint erp_audit_events_dealtwin_success_receipt_chk
  check (
    not (action like 'dealtwin.%' and detail->>'operationSucceeded' = 'true')
    or (
      coalesce(detail->>'idempotencyKey', '') <> ''
      and coalesce(detail->>'requestHash', '') <> ''
      and coalesce(detail->>'responseHash', '') <> ''
      and detail ? 'responseJson'
    )
  );

create unique index erp_audit_events_dealtwin_success_idempotency_uidx
  on public.erp_audit_events (tenant_id, action, (detail->>'idempotencyKey'))
  where action like 'dealtwin.%' and detail->>'operationSucceeded' = 'true';

create or replace function public.erp_audit_events_append_only()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  raise exception 'audit events are append-only';
end
$fn$;

create trigger erp_audit_events_append_only
  before update or delete on public.erp_audit_events
  for each row execute function public.erp_audit_events_append_only();

grant usage on schema public to dealtwin_app, dealtwin_judge_reset;

do $policies$
declare
  rel record;
  tenant_col text;
begin
  for rel in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and (c.relname like 'erp_%' or c.relname like 'dealtwin_%')
    order by c.relname
  loop
    tenant_col := case when rel.table_name = 'erp_tenants' then 'id' else 'tenant_id' end;
    execute format('alter table public.%I enable row level security', rel.table_name);
    execute format('alter table public.%I force row level security', rel.table_name);
    execute format(
      'drop policy if exists dealtwin_app_tenant on public.%I',
      rel.table_name
    );
    execute format(
      'create policy dealtwin_app_tenant on public.%I for all to dealtwin_app using (%I = current_setting(''app.tenant_id'', true)) with check (%I = current_setting(''app.tenant_id'', true))',
      rel.table_name, tenant_col, tenant_col
    );
    execute format(
      'drop policy if exists dealtwin_reset_tenant on public.%I',
      rel.table_name
    );
    execute format(
      'create policy dealtwin_reset_tenant on public.%I for all to dealtwin_judge_reset using (%I = current_setting(''app.tenant_id'', true) and %I = ''dealtwin-judge-v1'') with check (%I = current_setting(''app.tenant_id'', true) and %I = ''dealtwin-judge-v1'')',
      rel.table_name, tenant_col, tenant_col, tenant_col, tenant_col
    );
  end loop;
end
$policies$;

revoke all on table
  public.erp_tenants, public.erp_workspaces, public.erp_products, public.erp_suppliers,
  public.erp_customers, public.erp_warehouses, public.erp_purchase_requests, public.erp_purchase_request_lines,
  public.erp_request_for_quotations, public.erp_rfq_suppliers, public.erp_rfq_lines, public.erp_supplier_quotations,
  public.erp_supplier_quotation_lines, public.erp_purchase_orders, public.erp_purchase_order_lines,
  public.erp_goods_receipts, public.erp_goods_receipt_lines, public.erp_sales_orders, public.erp_sales_order_lines,
  public.erp_delivery_orders, public.erp_delivery_order_lines, public.erp_trade_invoices, public.erp_trade_invoice_sources,
  public.erp_trade_invoice_lines, public.erp_payments, public.erp_stock_adjustments, public.erp_stock_movements,
  public.erp_supplier_calls, public.erp_supplier_call_transcript_segments, public.erp_supplier_call_approvals,
  public.erp_supplier_call_approval_products, public.erp_supplier_call_results, public.erp_disputes, public.erp_follow_ups,
  public.erp_audit_events, public.erp_cash_accounts, public.erp_cash_movements,
  public.dealtwin_deals, public.dealtwin_deal_versions, public.dealtwin_constraints, public.dealtwin_erp_snapshots,
  public.dealtwin_compile_runs, public.dealtwin_proofs, public.dealtwin_approvals, public.dealtwin_liquidity_commitments
from public, anon, authenticated, dealtwin_app, dealtwin_judge_reset;

grant select, insert, update on table
  public.erp_tenants, public.erp_workspaces, public.erp_products, public.erp_suppliers,
  public.erp_customers, public.erp_warehouses, public.erp_purchase_requests, public.erp_purchase_request_lines,
  public.erp_request_for_quotations, public.erp_rfq_suppliers, public.erp_rfq_lines, public.erp_supplier_quotations,
  public.erp_supplier_quotation_lines, public.erp_purchase_orders, public.erp_purchase_order_lines,
  public.erp_goods_receipts, public.erp_goods_receipt_lines, public.erp_sales_orders, public.erp_sales_order_lines,
  public.erp_delivery_orders, public.erp_delivery_order_lines, public.erp_trade_invoices, public.erp_trade_invoice_sources,
  public.erp_trade_invoice_lines, public.erp_payments, public.erp_stock_adjustments,
  public.erp_supplier_calls, public.erp_supplier_call_transcript_segments, public.erp_supplier_call_approvals,
  public.erp_supplier_call_approval_products, public.erp_supplier_call_results, public.erp_disputes, public.erp_follow_ups,
  public.erp_cash_accounts, public.dealtwin_deals, public.dealtwin_proofs, public.dealtwin_approvals,
  public.dealtwin_liquidity_commitments
to dealtwin_app;

grant select, insert on table
  public.erp_stock_movements, public.erp_audit_events, public.erp_cash_movements,
  public.dealtwin_deal_versions, public.dealtwin_constraints, public.dealtwin_erp_snapshots, public.dealtwin_compile_runs
to dealtwin_app;

grant select, insert, update, delete on table
  public.erp_tenants, public.erp_workspaces, public.erp_products, public.erp_suppliers,
  public.erp_customers, public.erp_warehouses, public.erp_purchase_requests, public.erp_purchase_request_lines,
  public.erp_request_for_quotations, public.erp_rfq_suppliers, public.erp_rfq_lines, public.erp_supplier_quotations,
  public.erp_supplier_quotation_lines, public.erp_purchase_orders, public.erp_purchase_order_lines,
  public.erp_goods_receipts, public.erp_goods_receipt_lines, public.erp_sales_orders, public.erp_sales_order_lines,
  public.erp_delivery_orders, public.erp_delivery_order_lines, public.erp_trade_invoices, public.erp_trade_invoice_sources,
  public.erp_trade_invoice_lines, public.erp_payments, public.erp_stock_adjustments, public.erp_stock_movements,
  public.erp_supplier_calls, public.erp_supplier_call_transcript_segments, public.erp_supplier_call_approvals,
  public.erp_supplier_call_approval_products, public.erp_supplier_call_results, public.erp_disputes, public.erp_follow_ups,
  public.erp_cash_accounts, public.erp_cash_movements,
  public.dealtwin_deals, public.dealtwin_deal_versions, public.dealtwin_constraints, public.dealtwin_erp_snapshots,
  public.dealtwin_compile_runs, public.dealtwin_proofs, public.dealtwin_approvals, public.dealtwin_liquidity_commitments
to dealtwin_judge_reset;

grant select, insert on table public.erp_audit_events to dealtwin_judge_reset;
