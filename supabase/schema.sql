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
  status text not null check (status in ('overdue', 'partially_paid', 'paid')),
  dispute_status text not null default 'none' check (dispute_status in ('none', 'open', 'resolved')),
  last_contact_at timestamptz,
  next_action_at timestamptz,
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
  human_approved_by uuid references auth.users(id) on delete set null,
  human_approved_at timestamptz,
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
  approved_script text not null,
  approved_by uuid not null references auth.users(id) on delete restrict,
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
  requested_evidence text,
  assigned_to uuid references auth.users(id) on delete set null,
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

-- Server-only prototype boundary: no browser role receives table access.
revoke all on table public.customers, public.invoices, public.calls, public.call_approvals,
  public.payment_commitments, public.disputes, public.audit_logs, public.webhook_events
  from anon, authenticated;
grant all on table public.customers, public.invoices, public.calls, public.call_approvals,
  public.payment_commitments, public.disputes, public.audit_logs, public.webhook_events
  to service_role;
