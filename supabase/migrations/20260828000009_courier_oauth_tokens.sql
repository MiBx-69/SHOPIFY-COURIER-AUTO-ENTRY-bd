-- ─── courier_oauth_tokens ───────────────────────────────────────────────────
-- Persists OAuth 2.0 access + refresh tokens for couriers that use OAuth
-- (currently: Pathao). Keyed by courier_config_id so multi-tenant isolation
-- is automatic: every shop's courier config has its own token row.

CREATE TABLE IF NOT EXISTS courier_oauth_tokens (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_config_id    uuid NOT NULL REFERENCES courier_configs(id) ON DELETE CASCADE,
  shop_id              uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- Token fields (stored as text; access_token will be short-lived; refresh is long-lived)
  access_token         text NOT NULL,
  refresh_token        text,
  expires_at           timestamptz NOT NULL,   -- when access_token expires

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (courier_config_id)
);

-- RLS: only service-role (admin client) can read/write; no anon access
ALTER TABLE courier_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- No public policies — all access via admin client only

-- Index for fast lookup by courier_config_id
CREATE INDEX IF NOT EXISTS idx_courier_oauth_tokens_config_id
  ON courier_oauth_tokens (courier_config_id);
