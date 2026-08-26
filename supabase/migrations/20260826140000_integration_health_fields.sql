-- Integration health fields for courier_configs and shopify_installations.
-- Adds last_tested_at, latency, and error message columns so the Settings UI
-- can display rich connection health without touching decrypted credentials.

-- courier_configs: add health tracking columns
alter table public.courier_configs
  add column if not exists last_tested_at     timestamptz,
  add column if not exists last_test_latency_ms integer,
  add column if not exists last_error_message  text;

-- shopify_installations: add health + api version tracking
alter table public.shopify_installations
  add column if not exists api_version          text,
  add column if not exists last_tested_at       timestamptz,
  add column if not exists last_test_status     text check (last_test_status in ('connected','auth_error','network_error','provider_error')),
  add column if not exists last_error_message   text;

-- Index for querying couriers by connection status + test date (dashboard use)
create index if not exists courier_configs_health_idx on public.courier_configs(shop_id, connection_status, last_tested_at desc);
