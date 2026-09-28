-- =============================================================================
-- Allow sm_agent to insert simplified_leads directly (needed for the Import
-- bulk-add-leads flow now available on the agent portal, not just marketing).
-- Org-wide, matching the existing sm_agent select/update policies.
--
-- STATUS (2026-09-23): NOT YET RUN. The Import button/modal that needs this
-- is currently commented out in src/app/marketing/campaigns/page.tsx,
-- src/app/marketing/campaigns/[id]/page.tsx, src/app/sm-agent/leads/page.tsx,
-- and src/app/sm-agent/leads/[id]/page.tsx (search each file for
-- "TODO: re-enable once the sm_agent INSERT RLS policy is applied").
-- Run this migration BEFORE uncommenting those — sm_marketing's own import
-- already has insert access, only sm_agent needs this grant.
-- =============================================================================

CREATE POLICY "simplified_leads_insert_sm_agent"
  ON public.simplified_leads FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_my_organization_id() AND public.is_org_sm_agent());
