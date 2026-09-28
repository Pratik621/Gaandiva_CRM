-- =============================================================================
-- CAMPAIGN MODULE: Campaigns, Assignments, Leads
-- Team Leader can manage campaigns; Agents see only assigned campaigns/leads
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CAMPAIGNS
-- -----------------------------------------------------------------------------
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  industry text,
  geography text,
  target_designation text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. CAMPAIGN_ASSIGNMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE public.campaign_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE(campaign_id, agent_id)
);

-- -----------------------------------------------------------------------------
-- 3. LEADS
-- -----------------------------------------------------------------------------
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  assigned_agent_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  name text,
  company_name text,
  phone text,
  email text,
  city text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'interested', 'followup', 'closed_won', 'closed_lost')),
  followup_date date,
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_campaigns_organization_id ON public.campaigns(organization_id);
CREATE INDEX idx_campaigns_status ON public.campaigns(status);
CREATE INDEX idx_campaigns_created_by ON public.campaigns(created_by);

CREATE INDEX idx_campaign_assignments_organization_id ON public.campaign_assignments(organization_id);
CREATE INDEX idx_campaign_assignments_campaign_id ON public.campaign_assignments(campaign_id);
CREATE INDEX idx_campaign_assignments_agent_id ON public.campaign_assignments(agent_id);

CREATE INDEX idx_leads_organization_id ON public.leads(organization_id);
CREATE INDEX idx_leads_campaign_id ON public.leads(campaign_id);
CREATE INDEX idx_leads_assigned_agent_id ON public.leads(assigned_agent_id);
CREATE INDEX idx_leads_status ON public.leads(status);

-- -----------------------------------------------------------------------------
-- HELPER: Check if current user is team leader
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_team_leader(check_user_id uuid DEFAULT auth.uid())
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
      AND LOWER(REPLACE(r.name, ' ', '_')) IN ('team_leader', 'tl')
  );
$$;

-- -----------------------------------------------------------------------------
-- HELPER: Check if admin or team leader
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_admin_or_team_leader(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_org_admin(check_user_id) OR public.is_org_team_leader(check_user_id);
$$;

-- -----------------------------------------------------------------------------
-- HELPER: Check if user is assigned to campaign
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_assigned_to_campaign(p_campaign_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.campaign_assignments
    WHERE campaign_id = p_campaign_id
      AND agent_id = p_user_id
      AND is_active = true
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS: CAMPAIGNS
-- Team Leader/Admin: full access to org campaigns
-- Agent: only campaigns they are assigned to
-- -----------------------------------------------------------------------------
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_select_tl_admin"
  ON public.campaigns FOR SELECT
  TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_team_leader()
  );

CREATE POLICY "campaigns_select_assigned_agent"
  ON public.campaigns FOR SELECT
  TO authenticated
  USING (
    public.is_assigned_to_campaign(id)
  );

CREATE POLICY "campaigns_insert_tl_admin"
  ON public.campaigns FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_team_leader()
  );

CREATE POLICY "campaigns_update_tl_admin"
  ON public.campaigns FOR UPDATE
  TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_team_leader()
  )
  WITH CHECK (organization_id = public.get_my_organization_id());

CREATE POLICY "campaigns_delete_tl_admin"
  ON public.campaigns FOR DELETE
  TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_team_leader()
  );

-- -----------------------------------------------------------------------------
-- RLS: CAMPAIGN_ASSIGNMENTS
-- -----------------------------------------------------------------------------
ALTER TABLE public.campaign_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_assignments_select_tl_admin"
  ON public.campaign_assignments FOR SELECT
  TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_team_leader()
  );

CREATE POLICY "campaign_assignments_select_own_agent"
  ON public.campaign_assignments FOR SELECT
  TO authenticated
  USING (agent_id = auth.uid());

CREATE POLICY "campaign_assignments_insert_tl_admin"
  ON public.campaign_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_team_leader()
  );

CREATE POLICY "campaign_assignments_update_tl_admin"
  ON public.campaign_assignments FOR UPDATE
  TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_team_leader()
  );

-- -----------------------------------------------------------------------------
-- RLS: LEADS
-- Team Leader/Admin: all leads in org
-- Agent: only leads assigned to them
-- -----------------------------------------------------------------------------
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_select_tl_admin"
  ON public.leads FOR SELECT
  TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_team_leader()
  );

CREATE POLICY "leads_select_assigned_agent"
  ON public.leads FOR SELECT
  TO authenticated
  USING (assigned_agent_id = auth.uid());

CREATE POLICY "leads_insert_tl_admin"
  ON public.leads FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_team_leader()
  );

CREATE POLICY "leads_insert_assigned_agent"
  ON public.leads FOR INSERT
  TO authenticated
  WITH CHECK (assigned_agent_id = auth.uid());

CREATE POLICY "leads_update_tl_admin"
  ON public.leads FOR UPDATE
  TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_admin_or_team_leader()
  );

CREATE POLICY "leads_update_assigned_agent"
  ON public.leads FOR UPDATE
  TO authenticated
  USING (assigned_agent_id = auth.uid());

-- -----------------------------------------------------------------------------
-- TRIGGER: updated_at for leads
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_leads_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_leads_updated_at();
