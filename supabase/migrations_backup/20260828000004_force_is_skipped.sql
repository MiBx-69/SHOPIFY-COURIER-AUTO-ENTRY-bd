-- Force add column if missing
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_skipped BOOLEAN DEFAULT false NOT NULL;

-- Create index if not exists
CREATE INDEX IF NOT EXISTS idx_orders_shop_skipped ON orders(shop_id, is_skipped);

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
    AND oe2.occurred_at > oe1.occurred_at
  )
);
