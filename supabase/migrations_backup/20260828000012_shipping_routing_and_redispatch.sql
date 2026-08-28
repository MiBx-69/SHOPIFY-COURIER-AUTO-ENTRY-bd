-- Add shipping rules and redispatch settings to shops table
ALTER TABLE public.shops
ADD COLUMN IF NOT EXISTS shipping_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS redispatch_settings jsonb NOT NULL DEFAULT '{"auto_restore": true, "use_shipping_rules": true, "one_click_instant": true}'::jsonb;

-- Add shipping lines and shipping title to orders table
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS shipping_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS shipping_title text;

-- Create or replace claim_redispatch function
CREATE OR REPLACE FUNCTION public.claim_redispatch(
  p_order_id uuid, 
  p_idempotency_key uuid
)
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

  -- Automatically un-skip the order for redispatch
  IF target.is_skipped THEN
    UPDATE public.orders
    SET is_skipped = false,
        dispatch_status = 'dispatching',
        updated_at = now()
    WHERE id = target.id;
  ELSE
    UPDATE public.orders
    SET dispatch_status = 'dispatching',
        updated_at = now()
    WHERE id = target.id;
  END IF;

  -- Look for an existing dispatch (active, failed, or completed)
  SELECT * INTO result
  FROM public.dispatches
  WHERE order_id = p_order_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- If there's an in-progress dispatch within the stale threshold, throw concurrency error
    IF result.status = 'dispatching' AND result.updated_at > (now() - v_stale_threshold) THEN
      RAISE EXCEPTION 'Dispatch is already in progress for this order.' USING ERRCODE = '55P03';
    END IF;

    -- Reset previous dispatch record to fresh dispatching state
    UPDATE public.dispatches
    SET idempotency_key = p_idempotency_key,
        status = 'dispatching',
        phase = 'created',
        safe_error_message = NULL,
        created_by = COALESCE(v_user_id, result.created_by),
        updated_at = now()
    WHERE id = result.id
    RETURNING * INTO result;

    RETURN result;
  END IF;

  -- No dispatch found; insert a brand new dispatch attempt
  INSERT INTO public.dispatches(
    shop_id, order_id, idempotency_key, status, phase, created_by, created_at, updated_at
  ) VALUES (
    target.shop_id, target.id, p_idempotency_key, 'dispatching', 'created', v_user_id, now(), now()
  ) RETURNING * INTO result;

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.claim_redispatch(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_redispatch(uuid,uuid) TO authenticated;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
