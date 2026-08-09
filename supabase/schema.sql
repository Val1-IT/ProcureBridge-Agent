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
  sale_price numeric(18,2) not null check (sale_price >= 0),
  purchase_price numeric(18,2) not null check (purchase_price >= 0),
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
  primary key (tenant_id, id), unique (tenant_id, request_number)
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
  primary key (tenant_id, id), unique (tenant_id, quotation_number),
  foreign key (tenant_id, request_for_quotation_id) references public.erp_request_for_quotations(tenant_id, id) on delete restrict,
  foreign key (tenant_id, supplier_id) references public.erp_suppliers(tenant_id, id) on delete restrict
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
  foreign key (tenant_id, supplier_quotation_id) references public.erp_supplier_quotations(tenant_id, id) on delete restrict,
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
  total_amount numeric(18,2) not null check (total_amount >= 0), due_date date not null,
  created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, invoice_number),
  check ((supplier_id is not null and customer_id is null) or (supplier_id is null and customer_id is not null)),
  foreign key (tenant_id, purchase_order_id) references public.erp_purchase_orders(tenant_id, id) on delete restrict,
  foreign key (tenant_id, sales_order_id) references public.erp_sales_orders(tenant_id, id) on delete restrict,
  foreign key (tenant_id, supplier_id) references public.erp_suppliers(tenant_id, id) on delete restrict,
  foreign key (tenant_id, customer_id) references public.erp_customers(tenant_id, id) on delete restrict
);

create table if not exists public.erp_trade_invoice_sources (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  trade_invoice_id text not null, source_document_id text not null,
  primary key (tenant_id, trade_invoice_id, source_document_id),
  foreign key (tenant_id, trade_invoice_id) references public.erp_trade_invoices(tenant_id, id) on delete cascade
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
  quantity_delta numeric(18,4) not null check (quantity_delta <> 0), reason text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  proposed_by_role text not null check (proposed_by_role in ('admin', 'procurement', 'warehouse', 'sales', 'finance', 'approver')),
  approved_by_role text check (approved_by_role in ('admin', 'procurement', 'warehouse', 'sales', 'finance', 'approver')),
  approved_at timestamptz, created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id), unique (tenant_id, adjustment_number),
  foreign key (tenant_id, product_id) references public.erp_products(tenant_id, id) on delete restrict,
  foreign key (tenant_id, warehouse_id) references public.erp_warehouses(tenant_id, id) on delete restrict
);

create table if not exists public.erp_stock_movements (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, type text check (type in ('opening', 'receipt', 'delivery', 'adjustment')),
  product_id text not null, warehouse_id text not null, quantity numeric(18,4) not null check (quantity > 0),
  direction text not null check (direction in ('in', 'out', 'adjustment')),
  source_type text not null check (source_type in ('seed', 'goods_receipt', 'delivery_order', 'adjustment')),
  source_id text not null,
  actor_role text not null check (actor_role in ('admin', 'procurement', 'warehouse', 'sales', 'finance', 'approver', 'system')),
  actor_id text not null, reason text, created_at timestamptz not null, updated_at timestamptz not null,
  primary key (tenant_id, id),
  foreign key (tenant_id, product_id) references public.erp_products(tenant_id, id) on delete restrict,
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
  text text not null, stage integer not null check (stage >= 0), offset_seconds integer not null check (offset_seconds >= 0),
  primary key (tenant_id, supplier_call_id, id),
  foreign key (tenant_id, supplier_call_id) references public.erp_supplier_calls(tenant_id, id) on delete cascade
);

create table if not exists public.erp_supplier_call_approvals (
  tenant_id text not null references public.erp_tenants(id) on delete restrict,
  id text not null, supplier_call_id text not null, supplier_id text not null, purchase_order_id text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')), objective text not null,
  maximum_delivery_date date not null, partial_delivery_allowed boolean not null default false,
  maximum_unit_price_increase_percent numeric(7,4) not null default 0 check (maximum_unit_price_increase_percent >= 0),
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
  check (supplier_id is not null or customer_id is not null),
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
  check (supplier_id is not null or customer_id is not null),
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
