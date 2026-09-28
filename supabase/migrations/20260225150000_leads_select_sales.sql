-- Allow Sales role to SELECT leads in their organization (same as TL/Admin)
-- Fix: Agents add leads to campaigns but Sales saw "Leads (0)" because leads RLS did not include Sales.

DROP POLICY IF EXISTS "leads_select_tl_admin" ON public.leads;
CREATE POLICY "leads_select_tl_admin_sales"
  ON public.leads FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin_or_team_leader() OR public.is_org_sales())
  );
