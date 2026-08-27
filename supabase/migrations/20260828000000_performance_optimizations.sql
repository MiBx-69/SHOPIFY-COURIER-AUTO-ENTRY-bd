-- ============================================================
-- Performance Optimizations & Order State
-- Created: 2026-08-28
-- Purpose: Add is_skipped boolean to the orders table to prevent 
--          expensive order_events table scans.
-- ============================================================

-- 1. Add column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_skipped BOOLEAN DEFAULT false NOT NULL;

-- 2. Backfill existing data
-- Set is_skipped = true for orders where the LAST event was 'dispatch_skipped'
UPDATE orders
SET is_skipped = true
WHERE id IN (
  SELECT DISTINCT order_id 
  FROM order_events oe1
  WHERE event_type = 'dispatch_skipped'
  AND NOT EXISTS (
    SELECT 1 FROM order_events oe2
    WHERE oe2.order_id = oe1.order_id
    AND oe2.event_type = 'dispatch_restored'
    AND oe2.occurred_at > oe1.occurred_at
  )
);

-- 3. Add Index for rapid filtering
CREATE INDEX IF NOT EXISTS idx_orders_is_skipped
  ON orders (shop_id, is_skipped, cancelled_at);

-- 4. Create trigger to automatically maintain is_skipped state
CREATE OR REPLACE FUNCTION maintain_order_is_skipped()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_type = 'dispatch_skipped' THEN
    UPDATE orders SET is_skipped = true WHERE id = NEW.order_id;
  ELSIF NEW.event_type = 'dispatch_restored' THEN
    UPDATE orders SET is_skipped = false WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_maintain_order_is_skipped ON order_events;
CREATE TRIGGER trigger_maintain_order_is_skipped
AFTER INSERT ON order_events
FOR EACH ROW
EXECUTE FUNCTION maintain_order_is_skipped();
