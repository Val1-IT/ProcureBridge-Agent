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
