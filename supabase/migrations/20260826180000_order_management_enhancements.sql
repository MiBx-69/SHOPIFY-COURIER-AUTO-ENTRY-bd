-- ─────────────────────────────────────────────────────────────────────────────
-- Order Management & Dispatch Enhancements Migration
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Extend dispatch_status enum if needed
alter type public.dispatch_status add value if not exists 'skipped';
alter type public.dispatch_status add value if not exists 'cancel_requested';
alter type public.dispatch_status add value if not exists 'unknown';

-- 2. Indexes for accelerated server-side filtering
create index if not exists orders_shop_created_idx on public.orders(shop_id, shopify_created_at desc);
create index if not exists orders_shop_financial_idx on public.orders(shop_id, financial_status);
create index if not exists orders_shop_fulfillment_idx on public.orders(shop_id, fulfillment_status);
create index if not exists orders_shop_cancelled_idx on public.orders(shop_id, cancelled_at);
create index if not exists order_events_order_event_idx on public.order_events(order_id, event_type, occurred_at desc);
create index if not exists saved_filters_shop_user_idx on public.saved_filters(shop_id, user_id);
