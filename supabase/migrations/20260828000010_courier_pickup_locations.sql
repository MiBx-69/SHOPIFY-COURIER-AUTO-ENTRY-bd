-- ─── courier_pickup_locations ────────────────────────────────────────────────
-- Stores pickup locations fetched from courier APIs (Pathao stores, etc.)
-- Keyed by (courier_config_id, courier_location_id) to support upsert without
-- duplicates when the merchant re-syncs.

CREATE TABLE IF NOT EXISTS public.courier_pickup_locations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id               uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  courier_config_id     uuid NOT NULL REFERENCES public.courier_configs(id) ON DELETE CASCADE,
  provider              text NOT NULL,

  -- Courier's own ID for this location (e.g. Pathao store_id integer as text)
  courier_location_id   text NOT NULL,

  name                  text NOT NULL,
  address               text,
  phone                 text,
  area                  text,
  city                  text,
  is_active             boolean NOT NULL DEFAULT true,
  last_synced_at        timestamptz NOT NULL DEFAULT now(),

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate rows for the same courier location
  UNIQUE (courier_config_id, courier_location_id)
);

-- RLS: tenant isolation — a user can only see locations for shops they belong to
ALTER TABLE public.courier_pickup_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.courier_pickup_locations
  FOR ALL TO authenticated
  USING (private.has_shop_access(shop_id));

-- Fast lookups by shop + config (used in GET and setDefault)
CREATE INDEX IF NOT EXISTS idx_pickup_locations_config
  ON public.courier_pickup_locations (courier_config_id, shop_id);

NOTIFY pgrst, 'reload schema';
