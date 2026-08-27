CREATE OR REPLACE FUNCTION get_order_counts(p_shop_id uuid)
RETURNS TABLE (
  all_count bigint,
  ready_count bigint,
  unfulfilled_count bigint,
  pending_count bigint,
  attention_count bigint,
  dispatched_count bigint,
  failed_count bigint,
  on_hold_count bigint,
  partially_fulfilled_count bigint,
  fulfilled_count bigint,
  cancelled_count bigint,
  skipped_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as all_count,
    COUNT(*) FILTER (
      WHERE cancelled_at IS NULL 
      AND fulfillment_status != 'FULFILLED' 
      AND dispatch_status != 'dispatched'
      AND customer_phone IS NOT NULL
      AND is_skipped = false
    ) as ready_count,
    COUNT(*) FILTER (
      WHERE cancelled_at IS NULL 
      AND fulfillment_status = 'UNFULFILLED'
      AND dispatch_status != 'dispatched'
      AND is_skipped = false
    ) as unfulfilled_count,
    COUNT(*) FILTER (WHERE cancelled_at IS NULL AND financial_status = 'PENDING') as pending_count,
    COUNT(*) FILTER (
      WHERE cancelled_at IS NULL 
      AND (dispatch_status = 'failed' OR customer_phone IS NULL)
    ) as attention_count,
    COUNT(*) FILTER (WHERE dispatch_status = 'dispatched') as dispatched_count,
    COUNT(*) FILTER (WHERE dispatch_status = 'failed') as failed_count,
    COUNT(*) FILTER (WHERE cancelled_at IS NULL AND fulfillment_status = 'ON_HOLD') as on_hold_count,
    COUNT(*) FILTER (WHERE cancelled_at IS NULL AND fulfillment_status = 'PARTIALLY_FULFILLED') as partially_fulfilled_count,
    COUNT(*) FILTER (WHERE fulfillment_status = 'FULFILLED') as fulfilled_count,
    COUNT(*) FILTER (WHERE cancelled_at IS NOT NULL) as cancelled_count,
    COUNT(*) FILTER (WHERE is_skipped = true) as skipped_count
  FROM orders
  WHERE shop_id = p_shop_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_order_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_order_counts(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
