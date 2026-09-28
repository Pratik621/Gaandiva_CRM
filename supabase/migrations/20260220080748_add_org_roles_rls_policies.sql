-- Organizations: Admins can update their organization
CREATE POLICY "org_update_admin"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (id = public.get_my_organization_id())
  WITH CHECK (id = public.get_my_organization_id());

-- Roles: Admins can create roles in their organization
CREATE POLICY "roles_insert_admin"
  ON public.roles FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_admin()
    AND organization_id = public.get_my_organization_id()
  );

-- Roles: Admins can update/delete roles in their organization
CREATE POLICY "roles_update_admin"
  ON public.roles FOR UPDATE
  TO authenticated
  USING (
    public.is_org_admin()
    AND organization_id = public.get_my_organization_id()
  )
  WITH CHECK (organization_id = public.get_my_organization_id());

CREATE POLICY "roles_delete_admin"
  ON public.roles FOR DELETE
  TO authenticated
  USING (
    public.is_org_admin()
    AND organization_id = public.get_my_organization_id()
  );
