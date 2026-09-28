-- ============================================================================
-- Lead Finder module (B2B lead search — admin only)
-- Runs + scraped leads + saved filter templates. Kept fully separate from the
-- operational campaign `leads` table so nothing leaks into agent/QA flows.
-- Idempotent: safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_finder_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  engine_run_id     text,
  dataset_id        text,
  filters           jsonb NOT NULL,
  batch_name        text NOT NULL,
  status            text NOT NULL DEFAULT 'RUNNING'
    CHECK (status IN ('RUNNING','IMPORTING','SUCCEEDED','FAILED','ABORTED')),
  total_found       integer NOT NULL DEFAULT 0,
  inserted_count    integer NOT NULL DEFAULT 0,
  updated_count     integer NOT NULL DEFAULT 0,
  skipped_count     integer NOT NULL DEFAULT 0,
  -- Rows processed so far; doubles as the resume offset for chunked imports.
  progress          integer NOT NULL DEFAULT 0,
  -- Self-continuing import safety guard.
  import_iterations integer NOT NULL DEFAULT 0,
  error_message     text,
  started_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz
);

CREATE INDEX IF NOT EXISTS lead_finder_runs_org_created_idx
  ON public.lead_finder_runs (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.lead_finder_leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id            uuid REFERENCES public.lead_finder_runs(id) ON DELETE SET NULL,
  batch_name        text,
  first_name        text,
  last_name         text,
  full_name         text,
  -- Stored pre-lowercased by the importer; unique per org (dedupe key).
  email             text,
  email_status      text,
  phone             text,
  mobile_number     text,
  job_title         text,
  seniority         text,
  linkedin_url      text,
  photo_url         text,
  company_name      text,
  company_website   text,
  company_linkedin  text,
  company_industry  text,
  company_size      text,
  company_location  text,
  contact_city      text,
  contact_state     text,
  contact_country   text,
  source            text NOT NULL DEFAULT 'lead_finder',
  -- Complete original record — no field is ever lost.
  raw_data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_finder_leads_org_email_uniq
  ON public.lead_finder_leads (organization_id, email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS lead_finder_leads_org_created_idx
  ON public.lead_finder_leads (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_finder_leads_org_batch_idx
  ON public.lead_finder_leads (organization_id, batch_name);
CREATE INDEX IF NOT EXISTS lead_finder_leads_run_idx
  ON public.lead_finder_leads (run_id);

CREATE TABLE IF NOT EXISTS public.lead_finder_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  filters          jsonb NOT NULL,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

-- ── RLS: admin-only on all three tables ─────────────────────────────────────
ALTER TABLE public.lead_finder_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_finder_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_finder_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_finder_runs_admin ON public.lead_finder_runs;
CREATE POLICY lead_finder_runs_admin
  ON public.lead_finder_runs FOR ALL TO authenticated
  USING (
    organization_id = (SELECT public.get_my_organization_id())
    AND (SELECT public.is_org_admin())
  )
  WITH CHECK (
    organization_id = (SELECT public.get_my_organization_id())
    AND (SELECT public.is_org_admin())
  );

DROP POLICY IF EXISTS lead_finder_leads_admin ON public.lead_finder_leads;
CREATE POLICY lead_finder_leads_admin
  ON public.lead_finder_leads FOR ALL TO authenticated
  USING (
    organization_id = (SELECT public.get_my_organization_id())
    AND (SELECT public.is_org_admin())
  )
  WITH CHECK (
    organization_id = (SELECT public.get_my_organization_id())
    AND (SELECT public.is_org_admin())
  );

DROP POLICY IF EXISTS lead_finder_templates_admin ON public.lead_finder_templates;
CREATE POLICY lead_finder_templates_admin
  ON public.lead_finder_templates FOR ALL TO authenticated
  USING (
    organization_id = (SELECT public.get_my_organization_id())
    AND (SELECT public.is_org_admin())
  )
  WITH CHECK (
    organization_id = (SELECT public.get_my_organization_id())
    AND (SELECT public.is_org_admin())
  );

COMMENT ON TABLE public.lead_finder_runs IS
  'Lead Finder engine runs (admin-only module); progress doubles as import resume offset.';
COMMENT ON TABLE public.lead_finder_leads IS
  'B2B prospects imported by Lead Finder — separate from operational campaign leads.';
