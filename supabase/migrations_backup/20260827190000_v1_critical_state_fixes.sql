-- MiBx-Dispatch V1 production repair: canonical skip state, authoritative counts,
-- and a dispatch claim that safely reuses cancelled/stale dispatch rows.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_skipped boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_shop_skipped
  ON public.orders(shop_id, is_skipped);

-- Rebuild the materialized skip flag from the latest skip/restore event.
UPDATE public.orders o
SET is_skipped = COALESCE((
  SELECT e.event_type = 'dispatch_skipped'
  FROM public.order_events e
  WHERE e.order_id = o.id
    AND e.shop_id = o.shop_id
    AND e.event_type IN ('dispatch_skipped', 'dispatch_restored')
  ORDER BY e.occurred_at DESC, e.id DESC
  LIMIT 1
), false);

CREATE OR REPLACE FUNCTION public.get_order_counts(p_shop_id uuid)
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
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.has_shop_access(p_shop_id) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) AS all_count,
    COUNT(*) FILTER (
      WHERE o.cancelled_at IS NULL
        AND COALESCE(o.fulfillment_status, 'UNFULFILLED') != 'FULFILLED'
        AND o.dispatch_status IN ('not_dispatched','failed')
        AND o.customer_phone IS NOT NULL
        AND o.is_skipped = false
    ) AS ready_count,
    COUNT(*) FILTER (
      WHERE o.cancelled_at IS NULL
        AND o.fulfillment_status = 'UNFULFILLED'
        AND o.dispatch_status IN ('not_dispatched','failed')
        AND o.is_skipped = false
    ) AS unfulfilled_count,
    COUNT(*) FILTER (WHERE o.cancelled_at IS NULL AND o.financial_status = 'PENDING') AS pending_count,
    COUNT(*) FILTER (
      WHERE o.cancelled_at IS NULL
        AND (o.dispatch_status = 'failed' OR o.customer_phone IS NULL)
    ) AS attention_count,
    COUNT(*) FILTER (WHERE o.dispatch_status = 'dispatched') AS dispatched_count,
    COUNT(*) FILTER (WHERE o.dispatch_status = 'failed' AND o.is_skipped = false) AS failed_count,
    COUNT(*) FILTER (WHERE o.cancelled_at IS NULL AND o.fulfillment_status = 'ON_HOLD') AS on_hold_count,
    COUNT(*) FILTER (WHERE o.cancelled_at IS NULL AND o.fulfillment_status = 'PARTIALLY_FULFILLED') AS partially_fulfilled_count,
    COUNT(*) FILTER (WHERE o.fulfillment_status = 'FULFILLED') AS fulfilled_count,
    COUNT(*) FILTER (WHERE o.cancelled_at IS NOT NULL) AS cancelled_count,
    COUNT(*) FILTER (WHERE o.is_skipped = true) AS skipped_count
  FROM public.orders o
  WHERE o.shop_id = p_shop_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_counts(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_dispatch(p_order_id uuid, p_idempotency_key uuid)
RETURNS public.dispatches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result public.dispatches;
  target public.orders;
  v_user_id uuid := (SELECT auth.uid());
  v_stale_threshold interval := interval '5 minutes';
BEGIN
  SELECT * INTO target
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT private.has_permission(target.shop_id, 'dispatch_orders') THEN
    RAISE EXCEPTION 'Unauthorized to dispatch orders for this shop' USING ERRCODE = '42501';
  END IF;

  IF target.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Order is cancelled in Shopify and cannot be dispatched' USING ERRCODE = '22023';
  END IF;

  IF target.is_skipped THEN
    RAISE EXCEPTION 'Order is removed from dispatch queue. Restore it before dispatching.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO result
  FROM public.dispatches
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF FOUND THEN
    IF result.status = 'dispatched' THEN
      RETURN result;
    END IF;

    IF result.status = 'dispatching'
       AND result.updated_at > (now() - v_stale_threshold) THEN
      RAISE EXCEPTION 'Dispatch is already in progress for this order.' USING ERRCODE = '55P03';
    END IF;

    UPDATE public.dispatches
    SET idempotency_key = p_idempotency_key,
        status = 'dispatching',
        phase = 'created',
        courier_config_id = NULL,
        tracking_id = NULL,
        courier_reference = NULL,
        courier_status = 'unknown',
        dispatched_at = NULL,
        shopify_updated_at = NULL,
        safe_error_message = NULL,
        created_by = COALESCE(v_user_id, result.created_by),
        updated_at = now()
    WHERE id = result.id
    RETURNING * INTO result;

    UPDATE public.orders
    SET dispatch_status = 'dispatching', updated_at = now()
    WHERE id = target.id;

    RETURN result;
  END IF;

  INSERT INTO public.dispatches(
    shop_id, order_id, idempotency_key, status, phase,
    created_by, created_at, updated_at
  ) VALUES (
    target.shop_id, target.id, p_idempotency_key, 'dispatching', 'created',
    v_user_id, now(), now()
  ) RETURNING * INTO result;

  UPDATE public.orders
  SET dispatch_status = 'dispatching', updated_at = now()
  WHERE id = target.id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_dispatch(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_dispatch(uuid,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
