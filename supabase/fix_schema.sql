ALTER TABLE public.shops
ADD COLUMN IF NOT EXISTS shipping_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS redispatch_settings jsonb NOT NULL DEFAULT '{"auto_restore": true, "use_shipping_rules": true, "one_click_instant": true}'::jsonb;
NOTIFY pgrst, 'reload schema';
