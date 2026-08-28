-- Shopify Multi-Courier Dispatch Platform: tenant-safe core schema.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create schema if not exists private;
revoke all on schema private from public;

create type public.app_role as enum ('owner','admin','manager','dispatcher','viewer');
create type public.dispatch_status as enum ('not_dispatched','dispatching','dispatched','failed','cancelled');
create type public.courier_status as enum ('created','picked_up','in_transit','delivered','returned','cancelled','unknown');
create type public.dispatch_phase as enum ('created','courier_created','shopify_update_pending','completed','failed','unknown');
create type public.provider_name as enum ('redx','pathao','steadfast');
create type public.job_status as enum ('queued','running','completed','failed','cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  timezone text not null default 'Asia/Dhaka',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'viewer',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shop_domain text not null unique check (shop_domain LIKE '%.myshopify.com'),
  shopify_shop_gid text not null unique,
  name text not null,
  currency char(3) not null default 'BDT',
  timezone text not null default 'Asia/Dhaka',
  dispatch_mode text not null default 'priority' check (dispatch_mode in ('priority','manual','round_robin','lowest_cost','area_based','weight_based')),
  connection_status text not null default 'pending' check (connection_status in ('pending','healthy','attention','disconnected')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tokens are deliberately in a private, non-Data-API table. Ciphertext is AES-GCM
-- envelope-encrypted by trusted server/Edge Function code before insertion.
create table public.shopify_installations (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  access_token_ciphertext text not null,
  access_token_iv text not null,
  access_token_tag text not null,
  scopes text[] not null default '{}',
  installed_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  shopify_order_id text not null,
  shopify_order_gid text not null,
  order_number bigint not null,
  name text not null,
  customer_name text,
  customer_email text,
  customer_phone text,
  shipping_address jsonb not null default '{}'::jsonb,
  billing_address jsonb not null default '{}'::jsonb,
  note text,
  subtotal_minor bigint not null default 0,
  discount_minor bigint not null default 0,
  shipping_minor bigint not null default 0,
  tax_minor bigint not null default 0,
  total_minor bigint not null default 0,
  currency char(3) not null default 'BDT',
  financial_status text,
  fulfillment_status text,
  fulfillment_order_status text,
  cancelled_at timestamptz,
  closed_at timestamptz,
  shopify_created_at timestamptz,
  shopify_updated_at timestamptz,
  dispatch_status public.dispatch_status not null default 'not_dispatched',
  changed_after_dispatch boolean not null default false,
  search_document tsvector generated always as (
    to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(customer_name,'') || ' ' || coalesce(customer_phone,'') || ' ' || coalesce(customer_email,''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, shopify_order_id),
  unique (shop_id, shopify_order_gid),
  unique (shop_id, order_number)
);

create table public.order_line_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  shopify_line_item_id text not null,
  product_id text,
  variant_id text,
  title text not null,
  variant_title text,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price_minor bigint not null,
  total_price_minor bigint not null,
  product_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (order_id, shopify_line_item_id)
);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table public.couriers (
  id uuid primary key default gen_random_uuid(),
  provider public.provider_name not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);
insert into public.couriers (provider, display_name) values ('redx','REDX'),('pathao','Pathao'),('steadfast','Steadfast');

create table public.courier_configs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  courier_id uuid not null references public.couriers(id) on delete restrict,
  enabled boolean not null default false,
  priority smallint not null default 100 check (priority > 0),
  connection_status text not null default 'not_configured' check (connection_status in ('not_configured','connected','failed')),
  credentials_last_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, courier_id),
  unique (shop_id, priority) deferrable initially immediate
);
create table public.courier_secrets (
  courier_config_id uuid primary key references public.courier_configs(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  updated_at timestamptz not null default now()
);

create table public.dispatches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  courier_config_id uuid references public.courier_configs(id) on delete restrict,
  idempotency_key uuid not null,
  status public.dispatch_status not null default 'dispatching',
  phase public.dispatch_phase not null default 'created',
  tracking_id text,
  courier_reference text,
  courier_status public.courier_status not null default 'unknown',
  dispatched_at timestamptz,
  shopify_updated_at timestamptz,
  safe_error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id),
  unique (shop_id, idempotency_key)
);

create table public.dispatch_attempts (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.dispatches(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  provider public.provider_name not null,
  idempotency_key uuid not null,
  status text not null check (status in ('started','success','known_failure','unknown')),
  external_reference text,
  error_code text,
  safe_error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  request_metadata jsonb not null default '{}'::jsonb,
  response_metadata jsonb not null default '{}'::jsonb,
  unique (dispatch_id, idempotency_key)
);

create table public.courier_shipments (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null unique references public.dispatches(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  provider public.provider_name not null,
  tracking_id text not null,
  courier_reference text,
  status public.courier_status not null default 'created',
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, provider, tracking_id)
);
create table public.courier_tracking_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.courier_shipments(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  status public.courier_status not null,
  message text,
  occurred_at timestamptz not null,
  raw_metadata jsonb not null default '{}'::jsonb,
  unique (shipment_id, status, occurred_at)
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  webhook_id text not null,
  shop_id uuid not null references public.shops(id) on delete cascade,
  topic text not null,
  api_version text,
  payload_hash text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received','processing','processed','failed')),
  error text,
  unique (shop_id, webhook_id),
  unique (shop_id, topic, payload_hash)
);
create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  kind text not null check (kind in ('initial','orders','products','fulfillments','reconciliation','shopify_update')),
  status public.job_status not null default 'queued',
  cursor text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.sync_errors (
  id uuid primary key default gen_random_uuid(),
  sync_job_id uuid references public.sync_jobs(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  operation text not null,
  safe_message text not null,
  technical_code text,
  retryable boolean not null default true,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shop_id uuid references public.shops(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  request_id uuid,
  created_at timestamptz not null default now()
);
create table public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  filters jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, user_id, name)
);
create table public.order_internal_notes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  author_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index memberships_user_org_idx on public.memberships(user_id, organization_id);
create index shops_organization_idx on public.shops(organization_id);
create index orders_shop_updated_idx on public.orders(shop_id, shopify_updated_at desc);
create index orders_shop_status_idx on public.orders(shop_id, dispatch_status, fulfillment_status);
create index orders_search_idx on public.orders using gin(search_document);
create index orders_phone_trgm_idx on public.orders using gin(customer_phone gin_trgm_ops);
create index line_items_sku_idx on public.order_line_items(shop_id, sku);
create index dispatches_shop_order_idx on public.dispatches(shop_id, order_id);
create index dispatches_tracking_idx on public.dispatches(shop_id, tracking_id);
create unique index dispatches_shop_tracking_unique_idx on public.dispatches(shop_id, tracking_id) where tracking_id is not null;
create index webhook_received_idx on public.webhook_events(shop_id, received_at desc);
create index audit_logs_shop_created_idx on public.audit_logs(shop_id, created_at desc);
create index sync_jobs_shop_status_idx on public.sync_jobs(shop_id, status, created_at);

create or replace function private.touch_updated_at() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger organizations_touch before update on public.organizations for each row execute function private.touch_updated_at();
create trigger memberships_touch before update on public.memberships for each row execute function private.touch_updated_at();
create trigger shops_touch before update on public.shops for each row execute function private.touch_updated_at();
create trigger orders_touch before update on public.orders for each row execute function private.touch_updated_at();
create trigger courier_configs_touch before update on public.courier_configs for each row execute function private.touch_updated_at();
create trigger dispatches_touch before update on public.dispatches for each row execute function private.touch_updated_at();
create trigger shipments_touch before update on public.courier_shipments for each row execute function private.touch_updated_at();
create trigger filters_touch before update on public.saved_filters for each row execute function private.touch_updated_at();
create trigger jobs_touch before update on public.sync_jobs for each row execute function private.touch_updated_at();

create or replace function private.has_shop_access(target_shop_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shops s join public.memberships m on m.organization_id = s.organization_id where s.id = target_shop_id and m.user_id = (select auth.uid()))
$$;
create or replace function private.has_permission(target_shop_id uuid, permission text) returns boolean language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from public.shops s join public.memberships m on m.organization_id = s.organization_id
  where s.id = target_shop_id and m.user_id = (select auth.uid()) and (
   m.role in ('owner','admin') or (m.role = 'manager' and permission in ('view_orders','dispatch_orders','view_dispatch_history','manage_couriers','manage_members','manage_settings','view_audit_logs')) or
   (m.role = 'dispatcher' and permission in ('view_orders','dispatch_orders','view_dispatch_history')) or
   (m.role = 'viewer' and permission in ('view_orders','view_dispatch_history'))
  )
 )
$$;
revoke all on function private.has_shop_access(uuid) from public;
revoke all on function private.has_permission(uuid,text) from public;
grant usage on schema private to authenticated;
grant execute on function private.has_shop_access(uuid), private.has_permission(uuid,text) to authenticated;

-- Auth trigger is the only automatic profile writer and runs with a restricted search path.
create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id, full_name) values (new.id, nullif(new.raw_user_meta_data->>'full_name','')) on conflict (id) do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- A transactional, locking dispatch claim. External calls happen only after this claim succeeds.
create or replace function public.claim_dispatch(p_order_id uuid, p_idempotency_key uuid) returns public.dispatches language plpgsql security definer set search_path = '' as $$
declare result public.dispatches; target public.orders;
begin
  select * into target from public.orders where id = p_order_id for update;
  if not found or not private.has_permission(target.shop_id, 'dispatch_orders') then raise exception 'not found' using errcode = 'P0002'; end if;
  if target.cancelled_at is not null then raise exception 'order is cancelled' using errcode = '22023'; end if;
  select * into result from public.dispatches where order_id = p_order_id;
  if found then return result; end if;
  insert into public.dispatches(shop_id, order_id, idempotency_key, created_by) values (target.shop_id, target.id, p_idempotency_key, (select auth.uid())) returning * into result;
  update public.orders set dispatch_status = 'dispatching' where id = target.id;
  return result;
end $$;
revoke all on function public.claim_dispatch(uuid,uuid) from public;
grant execute on function public.claim_dispatch(uuid,uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.shops enable row level security;
alter table public.orders enable row level security;
alter table public.order_line_items enable row level security;
alter table public.order_events enable row level security;
alter table public.couriers enable row level security;
alter table public.courier_configs enable row level security;
alter table public.dispatches enable row level security;
alter table public.dispatch_attempts enable row level security;
alter table public.courier_shipments enable row level security;
alter table public.courier_tracking_events enable row level security;
alter table public.webhook_events enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.sync_errors enable row level security;
alter table public.audit_logs enable row level security;
alter table public.saved_filters enable row level security;
alter table public.order_internal_notes enable row level security;
alter table public.security_events enable row level security;
alter table public.shopify_installations enable row level security;
alter table public.courier_secrets enable row level security;

create policy "own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "organization membership select" on public.organizations for select to authenticated using (exists (select 1 from public.memberships m where m.organization_id = id and m.user_id = (select auth.uid())));
create policy "membership select" on public.memberships for select to authenticated using (user_id = (select auth.uid()) or exists (select 1 from public.memberships self where self.organization_id = memberships.organization_id and self.user_id = (select auth.uid()) and self.role in ('owner','admin','manager')));
create policy "shops select" on public.shops for select to authenticated using (private.has_shop_access(id));
create policy "orders select" on public.orders for select to authenticated using (private.has_permission(shop_id,'view_orders'));
create policy "line items select" on public.order_line_items for select to authenticated using (private.has_permission(shop_id,'view_orders'));
create policy "order events select" on public.order_events for select to authenticated using (private.has_permission(shop_id,'view_orders'));
create policy "couriers select" on public.couriers for select to authenticated using (true);
create policy "courier configs select" on public.courier_configs for select to authenticated using (private.has_permission(shop_id,'manage_couriers'));
create policy "dispatches select" on public.dispatches for select to authenticated using (private.has_permission(shop_id,'view_dispatch_history'));
create policy "attempts select" on public.dispatch_attempts for select to authenticated using (private.has_permission(shop_id,'view_dispatch_history'));
create policy "shipments select" on public.courier_shipments for select to authenticated using (private.has_permission(shop_id,'view_dispatch_history'));
create policy "tracking select" on public.courier_tracking_events for select to authenticated using (private.has_permission(shop_id,'view_dispatch_history'));
create policy "sync jobs select" on public.sync_jobs for select to authenticated using (private.has_permission(shop_id,'manage_shopify'));
create policy "sync errors select" on public.sync_errors for select to authenticated using (private.has_permission(shop_id,'manage_shopify'));
create policy "audit select" on public.audit_logs for select to authenticated using (private.has_permission(coalesce(shop_id, (select s.id from public.shops s where s.organization_id = audit_logs.organization_id limit 1)), 'view_audit_logs'));
create policy "saved filters own" on public.saved_filters for all to authenticated using (user_id = (select auth.uid()) and private.has_permission(shop_id,'view_orders')) with check (user_id = (select auth.uid()) and private.has_permission(shop_id,'view_orders'));
create policy "notes select" on public.order_internal_notes for select to authenticated using (private.has_permission(shop_id,'view_orders'));
create policy "notes insert" on public.order_internal_notes for insert to authenticated with check (author_id = (select auth.uid()) and private.has_permission(shop_id,'view_orders'));
create policy "security events own" on public.security_events for select to authenticated using (user_id = (select auth.uid()));

revoke all on all tables in schema public from anon;
revoke all on public.shopify_installations, public.courier_secrets from anon, authenticated;
grant select on public.profiles, public.organizations, public.memberships, public.shops, public.orders, public.order_line_items, public.order_events, public.couriers, public.courier_configs, public.dispatches, public.dispatch_attempts, public.courier_shipments, public.courier_tracking_events, public.sync_jobs, public.sync_errors, public.audit_logs, public.saved_filters, public.order_internal_notes, public.security_events to authenticated;
grant insert, update, delete on public.saved_filters to authenticated;
grant insert on public.order_internal_notes to authenticated;

alter table public.orders replica identity full;
alter table public.dispatches replica identity full;
alter table public.courier_shipments replica identity full;
alter table public.sync_jobs replica identity full;
alter publication supabase_realtime add table public.orders, public.dispatches, public.courier_shipments, public.sync_jobs;
