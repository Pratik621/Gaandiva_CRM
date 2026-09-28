-- Multiple Team Leaders per campaign (junction table).
CREATE TABLE IF NOT EXISTS public.campaign_team_leader_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  team_leader_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (campaign_id, team_leader_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_tl_assignments_org
  ON public.campaign_team_leader_assignments (organization_id);
CREATE INDEX IF NOT EXISTS idx_campaign_tl_assignments_campaign
  ON public.campaign_team_leader_assignments (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_tl_assignments_tl
  ON public.campaign_team_leader_assignments (team_leader_id);

-- Backfill from legacy single column.
INSERT INTO public.campaign_team_leader_assignments (
  organization_id,
  campaign_id,
  team_leader_id,
  is_active
)
SELECT c.organization_id, c.id, c.assigned_team_leader_id, true
FROM public.campaigns c
WHERE c.assigned_team_leader_id IS NOT NULL
ON CONFLICT (campaign_id, team_leader_id) DO NOTHING;

ALTER TABLE public.campaign_team_leader_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_tl_assignments_select_tl_admin" ON public.campaign_team_leader_assignments;
CREATE POLICY "campaign_tl_assignments_select_tl_admin"
  ON public.campaign_team_leader_assignments FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_team_leader()
  );

DROP POLICY IF EXISTS "campaign_tl_assignments_select_own_tl" ON public.campaign_team_leader_assignments;
CREATE POLICY "campaign_tl_assignments_select_own_tl"
  ON public.campaign_team_leader_assignments FOR SELECT TO authenticated
  USING (team_leader_id = auth.uid());

DROP POLICY IF EXISTS "campaign_tl_assignments_insert_tl_admin" ON public.campaign_team_leader_assignments;
CREATE POLICY "campaign_tl_assignments_insert_tl_admin"
  ON public.campaign_team_leader_assignments FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_team_leader()
  );

DROP POLICY IF EXISTS "campaign_tl_assignments_update_tl_admin" ON public.campaign_team_leader_assignments;
CREATE POLICY "campaign_tl_assignments_update_tl_admin"
  ON public.campaign_team_leader_assignments FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_team_leader()
  );
