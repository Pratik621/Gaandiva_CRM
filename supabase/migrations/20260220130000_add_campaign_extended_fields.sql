-- Add extended campaign fields for Sales
-- If campaigns table doesn't exist, create full campaign module first (handles case where 20260220120000 wasn't run)

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaigns') THEN
    -- Create campaigns table (campaign module not yet applied)
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
      created_at timestamptz NOT NULL DEFAULT now(),
      client_name text,
      lead_type text,
      cpl numeric(12,2),
      revenue numeric(12,2),
      booked numeric(12,2),
      total_allocation integer,
      post_qa integer,
      achieved integer,
      pending_allocation integer,
      region text,
      weekly_call text,
      weekly_report text,
      additional_comments text,
      assigned_team_leader_id uuid REFERENCES public.users(id) ON DELETE SET NULL
    );

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

    CREATE OR REPLACE FUNCTION public.is_org_team_leader(check_user_id uuid DEFAULT auth.uid())
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $func$
      SELECT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = check_user_id AND LOWER(REPLACE(r.name, ' ', '_')) IN ('team_leader', 'tl'));
    $func$;

    CREATE OR REPLACE FUNCTION public.is_org_admin_or_team_leader(check_user_id uuid DEFAULT auth.uid())
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $func$
      SELECT public.is_org_admin(check_user_id) OR public.is_org_team_leader(check_user_id);
    $func$;

    CREATE OR REPLACE FUNCTION public.is_assigned_to_campaign(p_campaign_id uuid, p_user_id uuid DEFAULT auth.uid())
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $func$
      SELECT EXISTS (SELECT 1 FROM public.campaign_assignments WHERE campaign_id = p_campaign_id AND agent_id = p_user_id AND is_active = true);
    $func$;

    ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.campaign_assignments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "campaigns_select_assigned_agent" ON public.campaigns FOR SELECT TO authenticated USING (public.is_assigned_to_campaign(id));
    CREATE POLICY "campaign_assignments_select_tl_admin" ON public.campaign_assignments FOR SELECT TO authenticated
      USING (organization_id = public.get_my_organization_id() AND public.is_org_admin_or_team_leader());
    CREATE POLICY "campaign_assignments_select_own_agent" ON public.campaign_assignments FOR SELECT TO authenticated USING (agent_id = auth.uid());
    CREATE POLICY "campaign_assignments_insert_tl_admin" ON public.campaign_assignments FOR INSERT TO authenticated
      WITH CHECK (organization_id = public.get_my_organization_id() AND public.is_org_admin_or_team_leader());
    CREATE POLICY "campaign_assignments_update_tl_admin" ON public.campaign_assignments FOR UPDATE TO authenticated
      USING (organization_id = public.get_my_organization_id() AND public.is_org_admin_or_team_leader());
    CREATE POLICY "leads_select_tl_admin" ON public.leads FOR SELECT TO authenticated
      USING (organization_id = public.get_my_organization_id() AND public.is_org_admin_or_team_leader());
    CREATE POLICY "leads_select_assigned_agent" ON public.leads FOR SELECT TO authenticated USING (assigned_agent_id = auth.uid());
    CREATE POLICY "leads_insert_tl_admin" ON public.leads FOR INSERT TO authenticated
      WITH CHECK (organization_id = public.get_my_organization_id() AND public.is_org_admin_or_team_leader());
    CREATE POLICY "leads_insert_assigned_agent" ON public.leads FOR INSERT TO authenticated WITH CHECK (assigned_agent_id = auth.uid());
    CREATE POLICY "leads_update_tl_admin" ON public.leads FOR UPDATE TO authenticated
      USING (organization_id = public.get_my_organization_id() AND public.is_org_admin_or_team_leader());
    CREATE POLICY "leads_update_assigned_agent" ON public.leads FOR UPDATE TO authenticated USING (assigned_agent_id = auth.uid());

    CREATE OR REPLACE FUNCTION public.update_leads_updated_at() RETURNS trigger LANGUAGE plpgsql AS $func$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $func$;
    CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_leads_updated_at();
  END IF;
END $migration$;

-- Add extended columns if campaigns exists but doesn't have them yet
DO $alter$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaigns') THEN
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS client_name text;
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS lead_type text;
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS cpl numeric(12,2);
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS revenue numeric(12,2);
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS booked numeric(12,2);
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS total_allocation integer;
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS post_qa integer;
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS achieved integer;
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS pending_allocation integer;
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS region text;
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS weekly_call text;
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS weekly_report text;
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS additional_comments text;
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS assigned_team_leader_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $alter$;

-- Helper: Check if current user has Sales role
CREATE OR REPLACE FUNCTION public.is_org_sales(check_user_id uuid DEFAULT auth.uid())
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
      AND LOWER(REPLACE(r.name, ' ', '_')) = 'sales'
  );
$$;

-- Create/update TL/Admin/Sales policies (drop first if they exist from create_campaign_module)
DROP POLICY IF EXISTS "campaigns_select_tl_admin" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_select_tl_admin_sales" ON public.campaigns;
CREATE POLICY "campaigns_select_tl_admin_sales"
  ON public.campaigns FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin_or_team_leader() OR public.is_org_sales())
  );

DROP POLICY IF EXISTS "campaigns_insert_tl_admin" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_insert_tl_admin_sales" ON public.campaigns;
CREATE POLICY "campaigns_insert_tl_admin_sales"
  ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin_or_team_leader() OR public.is_org_sales())
  );

DROP POLICY IF EXISTS "campaigns_update_tl_admin" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_update_tl_admin_sales" ON public.campaigns;
CREATE POLICY "campaigns_update_tl_admin_sales"
  ON public.campaigns FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin_or_team_leader() OR public.is_org_sales())
  )
  WITH CHECK (organization_id = public.get_my_organization_id());

DROP POLICY IF EXISTS "campaigns_delete_tl_admin" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_delete_tl_admin_sales" ON public.campaigns;
CREATE POLICY "campaigns_delete_tl_admin_sales"
  ON public.campaigns FOR DELETE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin_or_team_leader() OR public.is_org_sales())
  );

