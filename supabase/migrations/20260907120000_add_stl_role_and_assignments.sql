-- Senior Team Leader (STL) role: sits above Team Leader.
-- OM assigns campaigns to an STL (campaign_stl_assignments, mirrors
-- campaign_team_leader_assignments) and assigns TLs to report to an STL
-- (users.stl_id). An STL can then delegate a campaign down to a TL — which
-- writes into the existing campaign_team_leader_assignments table so the
-- unmodified /tl area picks it up exactly as if OM had assigned it directly —
-- or assign agents on the campaign directly.

-- 1. Seed the "STL" role for every active org that doesn't already have one
-- (covers the org where it was already created by hand via /admin/roles).
INSERT INTO public.roles (organization_id, name, description)
SELECT
  o.id,
  'STL',
  'Senior Team Leader'
FROM public.organizations o
WHERE o.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.organization_id = o.id
      AND LOWER(REPLACE(r.name, ' ', '_')) IN ('stl', 'senior_team_leader')
  );

-- 2. Which STL a Team Leader reports to (assigned by OM). Deliberately a new
-- dedicated column rather than reusing reporting_manager_id, which already
-- drives unrelated agent-scoping logic elsewhere in the app.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stl_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_stl_id ON public.users (stl_id);

-- 3. Legacy/primary "assigned STL" column on campaigns, mirrors
-- campaigns.assigned_team_leader_id.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS assigned_stl_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_assigned_stl_id ON public.campaigns (assigned_stl_id);

-- 4. Multiple STLs per campaign (junction table), mirrors
-- campaign_team_leader_assignments.
CREATE TABLE IF NOT EXISTS public.campaign_stl_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  stl_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (campaign_id, stl_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_stl_assignments_org
  ON public.campaign_stl_assignments (organization_id);
CREATE INDEX IF NOT EXISTS idx_campaign_stl_assignments_campaign
  ON public.campaign_stl_assignments (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_stl_assignments_stl
  ON public.campaign_stl_assignments (stl_id);

ALTER TABLE public.campaign_stl_assignments ENABLE ROW LEVEL SECURITY;

-- 4b. Grant STL the same org-wide RLS reach TL/OM already have. `is_org_team_leader()`
-- gates SELECT/INSERT/UPDATE on campaigns, campaign_assignments, and leads (via
-- is_org_admin_or_team_leader()) for the whole org — per-user scoping happens in the
-- application layer's queries, exactly as it already does for TL/OM today, so this is
-- a coarse, safe widen (same pattern used in 20260519140000_operations_manager_tl_access.sql
-- to add operations_manager). Without it, an STL's own request-scoped Supabase client
-- would be blocked by RLS from reading/writing campaigns it is legitimately scoped to.
CREATE OR REPLACE FUNCTION public.is_org_team_leader(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = check_user_id
      AND LOWER(REPLACE(r.name, ' ', '_')) IN
        ('team_leader', 'tl', 'operations_manager', 'stl', 'senior_team_leader')
  );
$func$;

-- 5. Role-check helpers, mirroring is_org_team_leader / is_org_admin_or_team_leader
-- but for the STL role (also includes operations_manager and admin, same as
-- the existing TL helpers do, so OM/admin get org-wide access).
CREATE OR REPLACE FUNCTION public.is_org_stl(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = check_user_id
      AND LOWER(REPLACE(r.name, ' ', '_')) IN ('stl', 'senior_team_leader', 'operations_manager')
  );
$func$;

CREATE OR REPLACE FUNCTION public.is_org_admin_or_stl(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $func$
  SELECT public.is_org_admin(check_user_id) OR public.is_org_stl(check_user_id);
$func$;

DROP POLICY IF EXISTS "campaign_stl_assignments_select_stl_admin" ON public.campaign_stl_assignments;
CREATE POLICY "campaign_stl_assignments_select_stl_admin"
  ON public.campaign_stl_assignments FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_stl()
  );

DROP POLICY IF EXISTS "campaign_stl_assignments_select_own_stl" ON public.campaign_stl_assignments;
CREATE POLICY "campaign_stl_assignments_select_own_stl"
  ON public.campaign_stl_assignments FOR SELECT TO authenticated
  USING (stl_id = auth.uid());

DROP POLICY IF EXISTS "campaign_stl_assignments_insert_admin" ON public.campaign_stl_assignments;
CREATE POLICY "campaign_stl_assignments_insert_admin"
  ON public.campaign_stl_assignments FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_stl()
  );

DROP POLICY IF EXISTS "campaign_stl_assignments_update_admin" ON public.campaign_stl_assignments;
CREATE POLICY "campaign_stl_assignments_update_admin"
  ON public.campaign_stl_assignments FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_stl()
  );
