-- Email-specific client_viewer campaign access for kstagnito2@rh-hub.com.
-- Additive RLS: supplements the default client_id scope with explicit campaign ids.

CREATE OR REPLACE FUNCTION public.is_client_viewer_email_campaign_override_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND lower(trim(u.email)) = 'kstagnito2@rh-hub.com'
  );
$$;

CREATE OR REPLACE FUNCTION public.client_viewer_email_campaign_override_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ARRAY[
    '4562aeae-e14b-4c24-b6c5-c63c9d9e8bbb'::uuid,
    '92e6bc07-b9f8-49e0-829b-fe39c6ac5f72'::uuid,
    '06038f73-3764-4300-a6c8-81a157674a65'::uuid
  ];
$$;

DROP POLICY IF EXISTS "campaigns_select_client_viewer_email_campaign_override" ON public.campaigns;
CREATE POLICY "campaigns_select_client_viewer_email_campaign_override"
  ON public.campaigns FOR SELECT TO authenticated
  USING (
    public.is_org_command_role((SELECT auth.uid()), 'client_viewer')
    AND public.is_client_viewer_email_campaign_override_user()
    AND id = ANY (public.client_viewer_email_campaign_override_ids())
  );

DROP POLICY IF EXISTS "leads_select_client_viewer_email_campaign_override" ON public.leads;
CREATE POLICY "leads_select_client_viewer_email_campaign_override"
  ON public.leads FOR SELECT TO authenticated
  USING (
    public.is_org_command_role((SELECT auth.uid()), 'client_viewer')
    AND public.is_client_viewer_email_campaign_override_user()
    AND campaign_id = ANY (public.client_viewer_email_campaign_override_ids())
  );

DROP POLICY IF EXISTS "alerts_select_client_viewer_email_campaign_override" ON public.alerts;
CREATE POLICY "alerts_select_client_viewer_email_campaign_override"
  ON public.alerts FOR SELECT TO authenticated
  USING (
    public.is_org_command_role((SELECT auth.uid()), 'client_viewer')
    AND public.is_client_viewer_email_campaign_override_user()
    AND campaign_id = ANY (public.client_viewer_email_campaign_override_ids())
  );

DROP POLICY IF EXISTS "lead_history_select_client_viewer_email_campaign_override" ON public.lead_history;
CREATE POLICY "lead_history_select_client_viewer_email_campaign_override"
  ON public.lead_history FOR SELECT TO authenticated
  USING (
    public.is_org_command_role((SELECT auth.uid()), 'client_viewer')
    AND public.is_client_viewer_email_campaign_override_user()
    AND EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_history.lead_id
        AND l.campaign_id = ANY (public.client_viewer_email_campaign_override_ids())
    )
  );

DROP POLICY IF EXISTS "campaign_metrics_history_select_client_viewer_email_campaign_override" ON public.campaign_metrics_history;
CREATE POLICY "campaign_metrics_history_select_client_viewer_email_campaign_override"
  ON public.campaign_metrics_history FOR SELECT TO authenticated
  USING (
    public.is_org_command_role((SELECT auth.uid()), 'client_viewer')
    AND public.is_client_viewer_email_campaign_override_user()
    AND campaign_id = ANY (public.client_viewer_email_campaign_override_ids())
  );
