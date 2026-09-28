-- Allow Team Leaders and Sales to read users in their org (for displaying names in campaigns, etc.)
-- Admins already have users_select_org_admin; this adds TL and Sales access.
CREATE POLICY "users_select_org_tl_sales"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin_or_team_leader() OR public.is_org_sales())
  );
