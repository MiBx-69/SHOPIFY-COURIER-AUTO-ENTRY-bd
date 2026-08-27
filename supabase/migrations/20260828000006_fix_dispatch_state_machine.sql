-- Fix claim_dispatch state machine

CREATE OR REPLACE FUNCTION public.claim_dispatch(p_order_id uuid, p_idempotency_key uuid)
RETURNS public.dispatches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result public.dispatches;
  target public.orders;
  v_user_id uuid := (select auth.uid());
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

  -- Verify skipped status directly from the orders table instead of order_events
  IF target.is_skipped THEN
    RAISE EXCEPTION 'Order is removed from dispatch queue. Restore it before dispatching.' USING ERRCODE = '22023';
  END IF;

  -- Look for an existing ACTIVE or IN-PROGRESS dispatch, ignoring cancelled ones
  SELECT * INTO result
  FROM public.dispatches
  WHERE order_id = p_order_id
    AND status != 'cancelled'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF result.status = 'dispatched' THEN
      RETURN result;
    END IF;

    IF result.status = 'dispatching' AND result.updated_at > (now() - v_stale_threshold) THEN
      RAISE EXCEPTION 'Dispatch is already in progress for this order.' USING ERRCODE = '55P03';
    END IF;

    -- Resume stale dispatch attempt
    UPDATE public.dispatches
    SET idempotency_key = p_idempotency_key,
        status = 'dispatching',
        phase = 'created',
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

  -- No active dispatch found. Insert a brand new dispatch attempt.
  INSERT INTO public.dispatches(
    shop_id, order_id, idempotency_key, status, phase, created_by, created_at, updated_at
  ) VALUES (
    target.shop_id, target.id, p_idempotency_key, 'dispatching', 'created', v_user_id, now(), now()
  ) RETURNING * INTO result;

  UPDATE public.orders
  SET dispatch_status = 'dispatching', updated_at = now()
  WHERE id = target.id;
  
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.claim_dispatch(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_dispatch(uuid,uuid) TO authenticated;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
