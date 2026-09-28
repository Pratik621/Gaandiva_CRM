-- QA role: read campaigns and all leads in org; update lead status (and related fields).
-- Add is_org_qa() and RLS policies so QA can use the same APIs as TL/Sales for listing campaigns/leads.

CREATE OR REPLACE FUNCTION public.is_org_qa(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = check_user_id
      AND LOWER(REPLACE(r.name, ' ', '_')) = 'qa'
  );
$$;

-- Campaigns: QA can SELECT (same org)
CREATE POLICY "campaigns_select_qa"
  ON public.campaigns FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_qa()
  );

-- Campaign assignments: QA can SELECT (to show agents per campaign)
CREATE POLICY "campaign_assignments_select_qa"
  ON public.campaign_assignments FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_qa()
  );

-- Leads: QA can SELECT and UPDATE (same org)
DROP POLICY IF EXISTS "leads_select_tl_admin_sales" ON public.leads;
CREATE POLICY "leads_select_tl_admin_sales_qa"
  ON public.leads FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin_or_team_leader() OR public.is_org_sales() OR public.is_org_qa())
  );

-- Leads UPDATE: add QA (new policy so QA can update lead status)
CREATE POLICY "leads_update_qa"
  ON public.leads FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_qa()
  )
  WITH CHECK (organization_id = public.get_my_organization_id());

-- Users: QA can read org users (for agent names)
DROP POLICY IF EXISTS "users_select_org_tl_sales" ON public.users;
CREATE POLICY "users_select_org_tl_sales_qa"
  ON public.users FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin_or_team_leader() OR public.is_org_sales() OR public.is_org_qa())
  );
