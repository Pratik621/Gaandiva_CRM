-- InitPlan fixes for leads/campaigns-related RLS (command roles, client viewer, TL assignments).
-- Zero-downtime: DROP + CREATE in one transaction.

-- campaigns (command + client viewer)
DROP POLICY IF EXISTS "campaigns_insert_command_roles" ON public.campaigns;
CREATE POLICY "campaigns_insert_command_roles"
  ON public.campaigns FOR INSERT
  WITH CHECK (
    organization_id = (SELECT get_my_organization_id())
    AND (
      is_org_command_role((SELECT auth.uid()), 'internal_operator')
      OR is_org_command_role((SELECT auth.uid()), 'internal_admin')
    )
  );

DROP POLICY IF EXISTS "campaigns_select_command_roles" ON public.campaigns;
CREATE POLICY "campaigns_select_command_roles"
  ON public.campaigns FOR SELECT
  USING (
    organization_id = (SELECT get_my_organization_id())
    AND (
      is_org_command_role((SELECT auth.uid()), 'internal_operator')
      OR is_org_command_role((SELECT auth.uid()), 'internal_admin')
      OR is_org_command_role((SELECT auth.uid()), 'client_viewer')
    )
  );

DROP POLICY IF EXISTS "campaigns_update_command_roles" ON public.campaigns;
CREATE POLICY "campaigns_update_command_roles"
  ON public.campaigns FOR UPDATE
  USING (
    organization_id = (SELECT get_my_organization_id())
    AND (
      is_org_command_role((SELECT auth.uid()), 'internal_operator')
      OR is_org_command_role((SELECT auth.uid()), 'internal_admin')
    )
  )
  WITH CHECK (organization_id = (SELECT get_my_organization_id()));

DROP POLICY IF EXISTS "campaigns_select_client_viewer_client_scope" ON public.campaigns;
CREATE POLICY "campaigns_select_client_viewer_client_scope"
  ON public.campaigns FOR SELECT
  USING (
    is_org_command_role((SELECT auth.uid()), 'client_viewer')
    AND client_id IS NOT NULL
    AND client_id = (
      SELECT u.client_id
      FROM public.users u
      WHERE u.id = (SELECT auth.uid())
    )
  );

-- leads (command + client viewer)
DROP POLICY IF EXISTS "leads_insert_command_roles" ON public.leads;
CREATE POLICY "leads_insert_command_roles"
  ON public.leads FOR INSERT
  WITH CHECK (
    organization_id = (SELECT get_my_organization_id())
    AND (
      is_org_command_role((SELECT auth.uid()), 'internal_operator')
      OR is_org_command_role((SELECT auth.uid()), 'internal_admin')
    )
  );

DROP POLICY IF EXISTS "leads_select_command_roles" ON public.leads;
CREATE POLICY "leads_select_command_roles"
  ON public.leads FOR SELECT
  USING (
    organization_id = (SELECT get_my_organization_id())
    AND (
      is_org_command_role((SELECT auth.uid()), 'internal_operator')
      OR is_org_command_role((SELECT auth.uid()), 'internal_admin')
      OR is_org_command_role((SELECT auth.uid()), 'client_viewer')
    )
  );

DROP POLICY IF EXISTS "leads_select_client_viewer_client_scope" ON public.leads;
CREATE POLICY "leads_select_client_viewer_client_scope"
  ON public.leads FOR SELECT
  USING (
    is_org_command_role((SELECT auth.uid()), 'client_viewer')
    AND EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.users u ON u.id = (SELECT auth.uid())
      WHERE c.id = leads.campaign_id
        AND c.client_id = u.client_id
    )
  );

-- lead_history (client viewer)
DROP POLICY IF EXISTS "lead_history_select_client_viewer_client_scope" ON public.lead_history;
CREATE POLICY "lead_history_select_client_viewer_client_scope"
  ON public.lead_history FOR SELECT
  USING (
    is_org_command_role((SELECT auth.uid()), 'client_viewer')
    AND EXISTS (
      SELECT 1
      FROM public.leads l
      JOIN public.campaigns c ON c.id = l.campaign_id
      JOIN public.users u ON u.id = (SELECT auth.uid())
      WHERE l.id = lead_history.lead_id
        AND c.client_id = u.client_id
    )
  );

-- campaign_metrics_history (command + client viewer)
DROP POLICY IF EXISTS "campaign_metrics_history_insert_command_roles" ON public.campaign_metrics_history;
CREATE POLICY "campaign_metrics_history_insert_command_roles"
  ON public.campaign_metrics_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = campaign_metrics_history.campaign_id
        AND c.organization_id = (SELECT get_my_organization_id())
    )
    AND (
      is_org_command_role((SELECT auth.uid()), 'internal_operator')
      OR is_org_command_role((SELECT auth.uid()), 'internal_admin')
      OR is_org_command_role((SELECT auth.uid()), 'admin')
    )
  );

DROP POLICY IF EXISTS "campaign_metrics_history_select_client_viewer_scope" ON public.campaign_metrics_history;
CREATE POLICY "campaign_metrics_history_select_client_viewer_scope"
  ON public.campaign_metrics_history FOR SELECT
  USING (
    is_org_command_role((SELECT auth.uid()), 'client_viewer')
    AND EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.users u ON u.id = (SELECT auth.uid())
      WHERE c.id = campaign_metrics_history.campaign_id
        AND c.client_id = u.client_id
    )
  );

DROP POLICY IF EXISTS "campaign_metrics_history_select_command_roles" ON public.campaign_metrics_history;
CREATE POLICY "campaign_metrics_history_select_command_roles"
  ON public.campaign_metrics_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = campaign_metrics_history.campaign_id
        AND c.organization_id = (SELECT get_my_organization_id())
        AND (
          is_org_command_role((SELECT auth.uid()), 'internal_operator')
          OR is_org_command_role((SELECT auth.uid()), 'internal_admin')
          OR is_org_command_role((SELECT auth.uid()), 'admin')
        )
    )
  );

-- campaign_team_leader_assignments
DROP POLICY IF EXISTS "campaign_tl_assignments_select_own_tl" ON public.campaign_team_leader_assignments;
CREATE POLICY "campaign_tl_assignments_select_own_tl"
  ON public.campaign_team_leader_assignments FOR SELECT
  TO authenticated
  USING (team_leader_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "campaign_tl_assignments_insert_tl_admin" ON public.campaign_team_leader_assignments;
CREATE POLICY "campaign_tl_assignments_insert_tl_admin"
  ON public.campaign_team_leader_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = (SELECT get_my_organization_id())
    AND (SELECT is_org_admin_or_team_leader())
  );

DROP POLICY IF EXISTS "campaign_tl_assignments_select_tl_admin" ON public.campaign_team_leader_assignments;
CREATE POLICY "campaign_tl_assignments_select_tl_admin"
  ON public.campaign_team_leader_assignments FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT get_my_organization_id())
    AND (SELECT is_org_admin_or_team_leader())
  );

DROP POLICY IF EXISTS "campaign_tl_assignments_update_tl_admin" ON public.campaign_team_leader_assignments;
CREATE POLICY "campaign_tl_assignments_update_tl_admin"
  ON public.campaign_team_leader_assignments FOR UPDATE
  TO authenticated
  USING (
    organization_id = (SELECT get_my_organization_id())
    AND (SELECT is_org_admin_or_team_leader())
  );
