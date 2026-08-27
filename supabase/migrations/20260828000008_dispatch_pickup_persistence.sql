create table public.courier_pickup_preferences (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  courier_config_id uuid not null references public.courier_configs(id) on delete cascade,
  pickup_location_id text not null,
  pickup_location_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (shop_id, courier_config_id)
);

alter table public.courier_pickup_preferences enable row level security;
create policy "Tenant isolation" on public.courier_pickup_preferences for all to authenticated using (private.has_shop_access(shop_id));

alter table public.dispatches
add column pickup_location_id text,
add column pickup_location_name text,
add column pickup_provider_id text,
add column pickup_address text,
add column pickup_phone text;

NOTIFY pgrst, 'reload schema';
