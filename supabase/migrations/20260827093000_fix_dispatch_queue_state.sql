-- Fix dispatch queue state handling.
-- dispatch_status is an enum and intentionally has no 'skipped' value;
-- skipped is represented by the latest dispatch_skipped/dispatch_restored event.

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
  v_is_skipped boolean;
begin
  select * into target
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if not private.has_permission(target.shop_id, 'dispatch_orders') then
    raise exception 'Unauthorized to dispatch orders for this shop' using errcode = '42501';
  end if;

  if target.cancelled_at is not null then
    raise exception 'Order is cancelled in Shopify and cannot be dispatched' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.order_events e
    where e.order_id = target.id
      and e.shop_id = target.shop_id
      and e.event_type = 'dispatch_skipped'
      and e.occurred_at > coalesce((
        select max(r.occurred_at)
        from public.order_events r
        where r.order_id = target.id
          and r.shop_id = target.shop_id
          and r.event_type = 'dispatch_restored'
          and r.occurred_at >= e.occurred_at
      ), '-infinity'::timestamptz)
  ) into v_is_skipped;

  if v_is_skipped then
    raise exception 'Order is removed from dispatch queue. Restore it before dispatching.' using errcode = '22023';
  end if;

  select * into result
  from public.dispatches
  where order_id = p_order_id;

  if found then
    if result.status = 'dispatched' then
      return result;
    end if;

    if result.status = 'dispatching' and result.updated_at > (now() - v_stale_threshold) then
      raise exception 'Dispatch is already in progress for this order.' using errcode = '55P03';
    end if;

    update public.dispatches
    set idempotency_key = p_idempotency_key,
        status = 'dispatching',
        phase = 'created',
        safe_error_message = null,
        created_by = coalesce(v_user_id, result.created_by),
        updated_at = now()
    where id = result.id
    returning * into result;

    update public.orders
    set dispatch_status = 'dispatching', updated_at = now()
    where id = target.id;
    return result;
  end if;

  insert into public.dispatches(
    shop_id, order_id, idempotency_key, status, phase, created_by, created_at, updated_at
  ) values (
    target.shop_id, target.id, p_idempotency_key, 'dispatching', 'created', v_user_id, now(), now()
  ) returning * into result;

  update public.orders
  set dispatch_status = 'dispatching', updated_at = now()
  where id = target.id;
  return result;
end $$;

revoke all on function public.claim_dispatch(uuid,uuid) from public;
grant execute on function public.claim_dispatch(uuid,uuid) to authenticated;
