CREATE OR REPLACE FUNCTION private.has_org_access(target_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT exists (
    SELECT 1 FROM public.memberships m
    WHERE m.organization_id = target_org_id
    AND m.user_id = (SELECT auth.uid())
  )
$$;

DROP POLICY IF EXISTS "membership select" ON public.memberships;

CREATE POLICY "membership select" ON public.memberships
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR private.has_org_access(organization_id)
);
