-- ─────────────────────────────────────────────────────────────────────────────
-- Robust Dispatch Claim & Stale Lock Recovery System
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.claim_dispatch(p_order_id uuid, p_idempotency_key uuid) 
returns public.dispatches 
language plpgsql 
security definer 
set search_path = '' 
as $$
declare 
  result public.dispatches; 
  target public.orders;
  v_user_id uuid := (select auth.uid());
  v_stale_threshold interval := interval '5 minutes';
begin
  -- 1. Atomic row-level lock on the target order to prevent race conditions
  select * into target from public.orders where id = p_order_id for update;
  
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if not private.has_permission(target.shop_id, 'dispatch_orders') then 
    raise exception 'Unauthorized to dispatch orders for this shop' using errcode = '42501'; 
  end if;
  
  -- 2. Business state checks
  if target.cancelled_at is not null then 
    raise exception 'Order is cancelled in Shopify and cannot be dispatched' using errcode = '22023'; 
  end if;

  if target.is_skipped is true then
    raise exception 'Order is removed from dispatch queue. Restore it before dispatching.' using errcode = '22023';
  end if;
  
  -- 3. Check existing dispatch record
  select * into result from public.dispatches where order_id = p_order_id;
  
  if found then
    -- Case A: Already successfully dispatched -> return existing record safely
    if result.status = 'dispatched' then
      return result;
    end if;

    -- Case B: Currently actively dispatching/processing (within 5-minute timeout) -> reject concurrent attempt
    if result.status = 'dispatching' and result.updated_at > (now() - v_stale_threshold) then
      raise exception 'Dispatch is already in progress for this order.' using errcode = '55P03';
    end if;
    
    -- Case C: Retry or Stale Lock Recovery (status is failed, cancelled, unknown, or stale dispatching)
    update public.dispatches 
    set idempotency_key = p_idempotency_key,
        status = 'dispatching',
        phase = 'created',
        safe_error_message = null,
        created_by = coalesce(v_user_id, result.created_by),
        updated_at = now()
    where id = result.id
    returning * into result;
    
    update public.orders set dispatch_status = 'dispatching', updated_at = now() where id = target.id;
    return result;
  end if;
  
  -- Case D: Fresh first-time dispatch claim
  insert into public.dispatches(
    shop_id, 
    order_id, 
    idempotency_key, 
    status, 
    phase, 
    created_by, 
    created_at, 
    updated_at
  ) 
  values (
    target.shop_id, 
    target.id, 
    p_idempotency_key, 
    'dispatching', 
    'created', 
    v_user_id, 
    now(), 
    now()
  ) 
  returning * into result;
  
  update public.orders set dispatch_status = 'dispatching', updated_at = now() where id = target.id;
  return result;
end $$;

revoke all on function public.claim_dispatch(uuid,uuid) from public;
grant execute on function public.claim_dispatch(uuid,uuid) to authenticated;

-- Recover any existing stuck orders that don't have completed courier shipments
update public.dispatches 
set status = 'failed', 
    phase = 'failed', 
    safe_error_message = coalesce(safe_error_message, 'Previous attempt was interrupted or timed out. Ready to retry.'),
    updated_at = now()
where status = 'dispatching' 
  and updated_at < (now() - interval '5 minutes')
  and tracking_id is null;

update public.orders o
set dispatch_status = 'failed',
    updated_at = now()
from public.dispatches d
where d.order_id = o.id 
  and d.status = 'failed' 
  and o.dispatch_status = 'dispatching';
