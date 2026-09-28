-- =============================================================================
-- SIMPLIFIED MANAGEMENT MODULE — Marketing portal (sm_marketing role)
-- Campaigns -> (discovered from Google Sheet "Campaign ID" column) -> Leads
-- Isolated from the main campaigns/leads pipeline: no team_leader,
-- operations_manager, qa, or mis policy exists anywhere in this file.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. SIMPLIFIED_CAMPAIGNS (safety net — table already created manually;
--    IF NOT EXISTS keeps this migration runnable standalone too)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simplified_campaigns (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_code     text        UNIQUE,
  name              text        NOT NULL,
  description       text,
  status            text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  call_form_schema  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_by        uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 1. SIMPLIFIED_AD_SOURCES (Google Sheet URLs the marketing team registers)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simplified_ad_sources (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sheet_url         text        NOT NULL,
  label             text,
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  last_synced_at    timestamptz,
  last_sync_status  text        CHECK (last_sync_status IN ('success', 'error')),
  last_sync_error   text,
  last_sync_rows    integer,
  added_by          uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Extend SIMPLIFIED_CAMPAIGNS: link back to the sheet a campaign was
--    discovered from, and the raw "Campaign ID" value from that sheet.
-- -----------------------------------------------------------------------------
ALTER TABLE public.simplified_campaigns
  ADD COLUMN IF NOT EXISTS external_campaign_id   text,
  ADD COLUMN IF NOT EXISTS simplified_ad_source_id uuid REFERENCES public.simplified_ad_sources(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_simplified_campaigns_org_external_id
  ON public.simplified_campaigns(organization_id, external_campaign_id)
  WHERE external_campaign_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. SIMPLIFIED_LEADS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simplified_leads (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  simplified_campaign_id  uuid        NOT NULL REFERENCES public.simplified_campaigns(id) ON DELETE CASCADE,
  assigned_agent_id       uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  name                    text,
  phone                   text,
  email                   text,
  company_name            text,
  raw_data                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  source_row_hash         text,
  status                  text        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'callback', 'resolved')),
  callback_at             timestamptz,
  call_form_response      jsonb,
  resolved_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_simplified_leads_campaign_row_hash
  ON public.simplified_leads(simplified_campaign_id, source_row_hash)
  WHERE source_row_hash IS NOT NULL;

-- -----------------------------------------------------------------------------
-- INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_simplified_ad_sources_organization_id ON public.simplified_ad_sources(organization_id);
CREATE INDEX IF NOT EXISTS idx_simplified_ad_sources_status          ON public.simplified_ad_sources(status);

CREATE INDEX IF NOT EXISTS idx_simplified_campaigns_ad_source_id ON public.simplified_campaigns(simplified_ad_source_id);

CREATE INDEX IF NOT EXISTS idx_simplified_leads_campaign_id       ON public.simplified_leads(simplified_campaign_id);
CREATE INDEX IF NOT EXISTS idx_simplified_leads_organization_id   ON public.simplified_leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_simplified_leads_assigned_agent_id ON public.simplified_leads(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_simplified_leads_status            ON public.simplified_leads(status);

-- -----------------------------------------------------------------------------
-- HELPER: is current user in the sm_marketing role
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_sm_marketing(check_user_id uuid DEFAULT auth.uid())
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
      AND LOWER(REPLACE(r.name, ' ', '_')) = 'sm_marketing'
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS: SIMPLIFIED_CAMPAIGNS
-- Admin: full org access. sm_marketing: full org access (single working role
-- for this module — adds sources, works leads). No TL/OM/QA/MIS policy exists.
-- -----------------------------------------------------------------------------
ALTER TABLE public.simplified_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "simplified_campaigns_select_admin" ON public.simplified_campaigns;
DROP POLICY IF EXISTS "simplified_campaigns_select_owner" ON public.simplified_campaigns;
DROP POLICY IF EXISTS "simplified_campaigns_select_assigned_agent" ON public.simplified_campaigns;
DROP POLICY IF EXISTS "simplified_campaigns_insert_sales_admin" ON public.simplified_campaigns;
DROP POLICY IF EXISTS "simplified_campaigns_update_owner_admin" ON public.simplified_campaigns;
DROP POLICY IF EXISTS "simplified_campaigns_delete_admin" ON public.simplified_campaigns;

CREATE POLICY "simplified_campaigns_select_org"
  ON public.simplified_campaigns FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

CREATE POLICY "simplified_campaigns_insert_org"
  ON public.simplified_campaigns FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

CREATE POLICY "simplified_campaigns_update_org"
  ON public.simplified_campaigns FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

CREATE POLICY "simplified_campaigns_delete_admin"
  ON public.simplified_campaigns FOR DELETE TO authenticated
  USING (organization_id = public.get_my_organization_id() AND public.is_org_admin());

-- -----------------------------------------------------------------------------
-- RLS: SIMPLIFIED_AD_SOURCES
-- -----------------------------------------------------------------------------
ALTER TABLE public.simplified_ad_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "simplified_ad_sources_select_org"
  ON public.simplified_ad_sources FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

CREATE POLICY "simplified_ad_sources_insert_org"
  ON public.simplified_ad_sources FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

CREATE POLICY "simplified_ad_sources_update_org"
  ON public.simplified_ad_sources FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

CREATE POLICY "simplified_ad_sources_delete_org"
  ON public.simplified_ad_sources FOR DELETE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

-- -----------------------------------------------------------------------------
-- RLS: SIMPLIFIED_LEADS
-- -----------------------------------------------------------------------------
ALTER TABLE public.simplified_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "simplified_leads_select_org"
  ON public.simplified_leads FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

CREATE POLICY "simplified_leads_insert_org"
  ON public.simplified_leads FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

CREATE POLICY "simplified_leads_update_org"
  ON public.simplified_leads FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

-- -----------------------------------------------------------------------------
-- TRIGGERS: updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_simplified_campaigns_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_simplified_campaigns_updated_at ON public.simplified_campaigns;
CREATE TRIGGER trg_simplified_campaigns_updated_at
  BEFORE UPDATE ON public.simplified_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_simplified_campaigns_updated_at();

CREATE OR REPLACE FUNCTION public.set_simplified_ad_sources_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_simplified_ad_sources_updated_at ON public.simplified_ad_sources;
CREATE TRIGGER trg_simplified_ad_sources_updated_at
  BEFORE UPDATE ON public.simplified_ad_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_simplified_ad_sources_updated_at();

CREATE OR REPLACE FUNCTION public.set_simplified_leads_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_simplified_leads_updated_at ON public.simplified_leads;
CREATE TRIGGER trg_simplified_leads_updated_at
  BEFORE UPDATE ON public.simplified_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_simplified_leads_updated_at();
