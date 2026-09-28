-- Campaign performance reports: tighten SELECT access for Shlok MVP + internal command roles.
-- External Campaign Report Generator continues to write via anon/authenticated write policies
-- (or service_role). Open SELECT-all is removed so other clients cannot read reports.
-- TODO: expand Campaign Report visibility beyond Shlok S (ssshlok554@gmail.com).

ALTER TABLE public.campaign_performance_reports ENABLE ROW LEVEL SECURITY;

-- Remove wide-open SELECT; keep write policies used by the external report generator.
DROP POLICY IF EXISTS "campaign_performance_reports_select_all" ON public.campaign_performance_reports;

REVOKE ALL ON TABLE public.campaign_performance_reports FROM anon;
REVOKE ALL ON TABLE public.campaign_performance_reports FROM authenticated;
GRANT SELECT ON TABLE public.campaign_performance_reports TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.campaign_performance_reports TO anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.campaign_performance_reports TO authenticated;

DROP POLICY IF EXISTS "campaign_performance_reports_select_mvp_shlok" ON public.campaign_performance_reports;
CREATE POLICY "campaign_performance_reports_select_mvp_shlok"
  ON public.campaign_performance_reports
  FOR SELECT
  USING (
    status = 'completed'
    AND is_web_vitals_saved = true
    AND lower(coalesce((
      SELECT u.email FROM public.users u WHERE u.id = (SELECT auth.uid())
    ), '')) = 'ssshlok554@gmail.com'
    AND (
      (
        crm_campaign_uuid IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.campaigns c
          WHERE c.id = crm_campaign_uuid
            AND c.client_id IS NOT NULL
            AND c.client_id = (
              SELECT u.client_id FROM public.users u WHERE u.id = (SELECT auth.uid())
            )
        )
      )
      OR (
        crm_campaign_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.campaigns c
          WHERE c.campaign_id = crm_campaign_id
            AND c.client_id IS NOT NULL
            AND c.client_id = (
              SELECT u.client_id FROM public.users u WHERE u.id = (SELECT auth.uid())
            )
        )
      )
    )
  );

DROP POLICY IF EXISTS "campaign_performance_reports_select_internal_command" ON public.campaign_performance_reports;
CREATE POLICY "campaign_performance_reports_select_internal_command"
  ON public.campaign_performance_reports
  FOR SELECT
  USING (
    status = 'completed'
    AND is_web_vitals_saved = true
    AND (
      public.is_org_command_role((SELECT auth.uid()), 'internal_operator')
      OR public.is_org_command_role((SELECT auth.uid()), 'internal_admin')
      OR public.is_org_command_role((SELECT auth.uid()), 'admin')
    )
    AND (
      (
        crm_campaign_uuid IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.campaigns c
          WHERE c.id = crm_campaign_uuid
            AND c.organization_id = (SELECT public.get_my_organization_id())
        )
      )
      OR (
        crm_campaign_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.campaigns c
          WHERE c.campaign_id = crm_campaign_id
            AND c.organization_id = (SELECT public.get_my_organization_id())
        )
      )
    )
  );
