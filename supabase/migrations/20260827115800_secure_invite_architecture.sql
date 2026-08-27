-- Secure Invite-Only Architecture Migration

-- 1. Alter Roles (We map the requested roles into our existing enum where possible, or add them)
-- Add Developer and Staff roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'developer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';

-- 2. Create Types & Tables
create type public.invitation_status as enum ('pending','accepted','expired','revoked');

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'staff',
  name text,
  phone text,
  company_name text,
  invited_by uuid references auth.users(id) on delete set null,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure an email can only have one pending invitation per organization
create unique index idx_org_invitations_pending_email on public.organization_invitations (organization_id, lower(email)) where status = 'pending';
create trigger organization_invitations_touch before update on public.organization_invitations for each row execute function private.touch_updated_at();

-- Audit Logs Table
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_organization_id uuid references public.organizations(id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

-- 3. Update RLS Policies
alter table public.organization_invitations enable row level security;
alter table public.audit_logs enable row level security;

-- Admin/Owner access to invitations
create policy "Owners and Admins can view org invitations" on public.organization_invitations
  for select using (
    exists (
      select 1 from public.memberships
      where organization_id = public.organization_invitations.organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
    )
    or
    (auth.jwt()->'user_metadata'->>'app_role' = 'developer')
  );

create policy "Owners and Admins can manage org invitations" on public.organization_invitations
  for all using (
    exists (
      select 1 from public.memberships
      where organization_id = public.organization_invitations.organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
    )
    or
    (auth.jwt()->'user_metadata'->>'app_role' = 'developer')
  );

-- Audit logs are viewable by admins and developers
create policy "Admins and developers can view audit logs" on public.audit_logs
  for select using (
    exists (
      select 1 from public.memberships
      where organization_id = public.audit_logs.target_organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
    )
    or
    (auth.jwt()->'user_metadata'->>'app_role' = 'developer')
  );

-- Insert policy for audit logs allows any authenticated user (their own actions) or developers
create policy "Authenticated users can insert audit logs" on public.audit_logs
  for insert with check (
    actor_id = auth.uid()
  );

-- 4. Supabase Before User Created Hook
create or replace function private.verify_user_invitation(event jsonb) returns jsonb as $$
declare
  v_email text;
  v_invitation record;
begin
  v_email := lower(event->>'email');
  
  -- The bootstrap developer is hardcoded for the initial setup.
  if v_email = 'mib.bappi360@gmail.com' then
    -- Inject developer role
    return jsonb_set(event, '{user_metadata, app_role}', '"developer"');
  end if;

  -- Find a valid pending invitation
  select * into v_invitation
  from public.organization_invitations
  where lower(email) = v_email
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if v_invitation.id is null then
    raise exception 'This application is invitation-only. Please request an invitation from your administrator.';
  end if;

  -- Mark the invitation as accepted
  update public.organization_invitations
  set status = 'accepted', accepted_at = now(), updated_at = now()
  where id = v_invitation.id;

  -- Return the modified event injecting the organization_id and role into user_metadata
  event := jsonb_set(event, '{user_metadata, organization_id}', to_jsonb(v_invitation.organization_id));
  event := jsonb_set(event, '{user_metadata, app_role}', to_jsonb(v_invitation.role::text));
  
  return event;
end;
$$ language plpgsql security definer set search_path = public;

-- Grant execution permission to supabase_auth_admin
grant execute on function private.verify_user_invitation to supabase_auth_admin;

-- 5. Update the handle_new_user trigger to handle memberships
create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_role text;
begin
  insert into public.profiles(id, full_name) values (new.id, nullif(new.raw_user_meta_data->>'full_name','')) on conflict (id) do nothing;
  
  -- Create membership if organization_id exists (via invitation hook)
  if new.raw_user_meta_data->>'organization_id' is not null then
    v_org_id := (new.raw_user_meta_data->>'organization_id')::uuid;
    v_role := coalesce(new.raw_user_meta_data->>'app_role', 'staff');
    
    insert into public.memberships(organization_id, user_id, role)
    values (v_org_id, new.id, v_role::public.app_role)
    on conflict (organization_id, user_id) do update set role = excluded.role;
  end if;
  
  return new;
end $$;
