/**
 * This script generates the SQL required to create the `courier_pickup_locations` table.
 * Since direct Postgres DB access is restricted in the local environment,
 * please run this script and execute the SQL output in your Supabase SQL Editor.
 * 
 * Run with: npx tsx scripts/apply-pickup-migrations.ts
 */

const ddl = `
-- Create normalized courier_pickup_locations table
CREATE TABLE IF NOT EXISTS public.courier_pickup_locations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  courier_config_id uuid NOT NULL REFERENCES public.courier_configs(id) ON DELETE CASCADE,
  provider text NOT NULL,
  courier_location_id text NOT NULL,
  name text NOT NULL,
  address text,
  phone text,
  area text,
  city text,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  last_synced_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Indexes for fast querying and constraint enforcement
CREATE INDEX IF NOT EXISTS idx_courier_pickup_locations_shop_config 
  ON public.courier_pickup_locations(shop_id, courier_config_id);

CREATE INDEX IF NOT EXISTS idx_courier_pickup_locations_shop_config_loc 
  ON public.courier_pickup_locations(shop_id, courier_config_id, courier_location_id);

CREATE INDEX IF NOT EXISTS idx_courier_pickup_locations_shop_config_active 
  ON public.courier_pickup_locations(shop_id, courier_config_id, is_active);

-- Unique constraint to prevent duplicate sync inserts
ALTER TABLE public.courier_pickup_locations
  DROP CONSTRAINT IF EXISTS unq_courier_pickup_locations_config_loc;

ALTER TABLE public.courier_pickup_locations
  ADD CONSTRAINT unq_courier_pickup_locations_config_loc UNIQUE (courier_config_id, courier_location_id);
`;

console.log("==========================================================");
console.log("PLEASE EXECUTE THE FOLLOWING SQL IN YOUR SUPABASE SQL EDITOR");
console.log("==========================================================");
console.log(ddl);
console.log("==========================================================");
