-- Allow Team Leaders and Sales to read user_roles for users in their org
-- (needed for Assign Agents, team management, etc.)
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_roles.user_id
        AND u.organization_id = public.get_my_organization_id()
        AND (public.is_org_admin_or_team_leader() OR public.is_org_sales())
    )
  );
