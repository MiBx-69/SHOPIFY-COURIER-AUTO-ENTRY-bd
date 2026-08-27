-- Redispatch + Shopify shipping-method based courier routing.
-- Shipping method is persisted from Shopify so dispatch selection does not need
-- to call Shopify at shipment time.

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS redispatch_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shipping_method_routing_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_method text,
  ADD COLUMN IF NOT EXISTS shipping_method_code text;

CREATE INDEX IF NOT EXISTS idx_orders_shop_shipping_method
  ON public.orders(shop_id, shipping_method);

CREATE TABLE IF NOT EXISTS public.courier_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  shipping_method_pattern text NOT NULL CHECK (char_length(trim(shipping_method_pattern)) BETWEEN 1 AND 160),
  match_type text NOT NULL DEFAULT 'contains' CHECK (match_type IN ('exact','contains')),
  courier_config_id uuid NOT NULL REFERENCES public.courier_configs(id) ON DELETE CASCADE,
  priority smallint NOT NULL DEFAULT 100 CHECK (priority > 0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_routing_rules_shop_priority
  ON public.courier_routing_rules(shop_id, priority, enabled);

CREATE INDEX IF NOT EXISTS idx_courier_routing_rules_shop_courier
  ON public.courier_routing_rules(shop_id, courier_config_id);

DROP TRIGGER IF EXISTS courier_routing_rules_touch ON public.courier_routing_rules;
CREATE TRIGGER courier_routing_rules_touch
  BEFORE UPDATE ON public.courier_routing_rules
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

ALTER TABLE public.courier_routing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "routing rules select" ON public.courier_routing_rules;
CREATE POLICY "routing rules select"
  ON public.courier_routing_rules
  FOR SELECT TO authenticated
  USING (private.has_shop_access(shop_id));

DROP POLICY IF EXISTS "routing rules manage" ON public.courier_routing_rules;
CREATE POLICY "routing rules manage"
  ON public.courier_routing_rules
  FOR ALL TO authenticated
  USING (private.has_permission(shop_id, 'manage_settings'))
  WITH CHECK (private.has_permission(shop_id, 'manage_settings'));

NOTIFY pgrst, 'reload schema';
