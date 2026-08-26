create or replace function public.claim_dispatch(p_order_id uuid, p_idempotency_key uuid) returns public.dispatches language plpgsql security definer set search_path = '' as $$
declare result public.dispatches; target public.orders;
begin
  select * into target from public.orders where id = p_order_id for update;
  if not found or not private.has_permission(target.shop_id, 'dispatch_orders') then raise exception 'not found' using errcode = 'P0002'; end if;
  if target.cancelled_at is not null then raise exception 'order is cancelled' using errcode = '22023'; end if;
  
  select * into result from public.dispatches where order_id = p_order_id;
  if found then
    -- If already successfully dispatched, return existing dispatch record
    if result.status = 'dispatched' then
      return result;
    end if;
    
    -- If previously failed, cancelled, or pending, reset state and update idempotency key for retry
    update public.dispatches 
    set idempotency_key = p_idempotency_key,
        status = 'pending',
        phase = 'claim_started',
        safe_error_message = null,
        created_by = coalesce((select auth.uid()), result.created_by)
    where id = result.id
    returning * into result;
    
    update public.orders set dispatch_status = 'dispatching' where id = target.id;
    return result;
  end if;
  
  insert into public.dispatches(shop_id, order_id, idempotency_key, created_by) 
  values (target.shop_id, target.id, p_idempotency_key, (select auth.uid())) 
  returning * into result;
  
  update public.orders set dispatch_status = 'dispatching' where id = target.id;
  return result;
end $$;
