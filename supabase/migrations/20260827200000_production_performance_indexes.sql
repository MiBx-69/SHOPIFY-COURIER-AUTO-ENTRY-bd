-- ============================================================
-- Production Performance Indexes
-- Created: 2026-08-27
-- Purpose: Composite indexes to cover the most common filter
--          patterns in order listing, dispatch, and audit queries.
-- ============================================================

-- ─── Orders: Main filter pattern ───────────────────────────────────────────
-- Covers: shop_id + status filters + cancelled_at (used in every filter query)
CREATE INDEX IF NOT EXISTS idx_orders_shop_dispatch_status
  ON orders (shop_id, dispatch_status, cancelled_at);

CREATE INDEX IF NOT EXISTS idx_orders_shop_fulfillment
  ON orders (shop_id, fulfillment_status, cancelled_at);

CREATE INDEX IF NOT EXISTS idx_orders_shop_financial
  ON orders (shop_id, financial_status);

-- Covers order number search
CREATE INDEX IF NOT EXISTS idx_orders_shop_order_number
  ON orders (shop_id, order_number DESC);

-- Covers updated_at for sorting
CREATE INDEX IF NOT EXISTS idx_orders_shop_updated
  ON orders (shop_id, shopify_updated_at DESC);

-- ─── Order Events: Skip/restore lookups ────────────────────────────────────
-- Covers the skip event query in /api/orders/counts
CREATE INDEX IF NOT EXISTS idx_order_events_skip_lookup
  ON order_events (shop_id, event_type, occurred_at ASC)
  WHERE event_type IN ('dispatch_skipped', 'dispatch_restored');

-- General event lookup by order
CREATE INDEX IF NOT EXISTS idx_order_events_order_id
  ON order_events (order_id, occurred_at DESC);

-- ─── Dispatches ────────────────────────────────────────────────────────────
-- Covers dispatches lookup by order (already has unique index on order_id
-- from the initial schema, but ensure it exists)
CREATE INDEX IF NOT EXISTS idx_dispatches_order_id
  ON dispatches (order_id)
  WHERE order_id IS NOT NULL;

-- ─── Dispatch Attempts ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dispatch_attempts_dispatch_id
  ON dispatch_attempts (dispatch_id, started_at DESC);

-- ─── Audit Logs: Pagination ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_time
  ON audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_shop_time
  ON audit_logs (shop_id, created_at DESC)
  WHERE shop_id IS NOT NULL;

-- ─── Webhook Events ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_webhook_events_shop_status
  ON webhook_events (shop_id, status, received_at DESC);

-- ─── Security Events ──────────────────────────────────────────────────────
-- Covers the security events query in settings/security page
CREATE INDEX IF NOT EXISTS idx_security_events_user_time
  ON security_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ─── Memberships: User → Organization lookup ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_memberships_user_org
  ON memberships (user_id, organization_id);

-- ─── Courier Configs ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_courier_configs_shop_priority
  ON courier_configs (shop_id, priority ASC, enabled DESC);

-- ─── Sync Jobs ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sync_jobs_shop_status
  ON sync_jobs (shop_id, status, created_at DESC)
  WHERE status = 'queued';
