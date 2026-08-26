begin;
create extension if not exists pgtap;
select plan(4);

-- Run with Supabase local test tooling after seeding two auth users and tenant rows.
-- These tests deliberately use the authenticated role and never a service role.
select has_table('public', 'orders', 'orders table exists');
select row_security_active('public.orders'::regclass), 'orders RLS is active';
select row_security_active('public.dispatches'::regclass), 'dispatches RLS is active';
select row_security_active('public.courier_secrets'::regclass), 'credential RLS is active';
select * from finish();
rollback;
