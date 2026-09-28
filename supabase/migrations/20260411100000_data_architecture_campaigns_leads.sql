-- Data architecture alignment: core campaigns + leads fields from product spec.
-- Notes:
-- - Existing Gandiv columns (organization_id, campaign_id, name, CRM audit fields, etc.) are retained.
-- - Spec "company" is stored as company_name (documented below).
-- - Spec rep_id may mirror assigned_agent_id; backfilled when rep_id was null.

-- ── campaigns ───────────────────────────────────────────────────────────────

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS qualification_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS alert_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.campaigns.qualification_criteria IS 'Campaign-specific QA criteria definition (JSONB).';
COMMENT ON COLUMN public.campaigns.alert_config IS 'Per-campaign alert threshold overrides; default empty object.';

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS updated_at timestamptz;
UPDATE public.campaigns SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE public.campaigns ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.campaigns ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_status_check CHECK (
    status = ANY (
      ARRAY['draft', 'active', 'paused', 'completed', 'cancelled']::text[]
    )
  );

CREATE OR REPLACE FUNCTION public.touch_campaigns_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON public.campaigns;
CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_campaigns_updated_at();

COMMENT ON COLUMN public.campaigns.client_id IS 'FK clients.id. Spec: NOT NULL when every campaign is client-scoped; nullable for legacy rows.';
COMMENT ON COLUMN public.campaigns.start_date IS 'Spec: NOT NULL; nullable here for legacy imports.';
COMMENT ON COLUMN public.campaigns.end_date IS 'Spec: NOT NULL; nullable here for legacy imports.';

-- ── leads: command / compliance columns (idempotent) ─────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS risk_flags jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS consent_status text DEFAULT 'pending';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS channel text DEFAULT 'email';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS rep_id uuid REFERENCES public.users (id) ON DELETE SET NULL;

UPDATE public.leads SET risk_flags = '[]'::jsonb WHERE risk_flags IS NULL;
UPDATE public.leads SET consent_status = 'pending' WHERE consent_status IS NULL;
UPDATE public.leads SET channel = 'email' WHERE channel IS NULL OR trim(channel) = '';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ingested_at timestamptz;

UPDATE public.leads SET ingested_at = created_at WHERE ingested_at IS NULL;

ALTER TABLE public.leads ALTER COLUMN ingested_at SET DEFAULT now();
ALTER TABLE public.leads ALTER COLUMN ingested_at SET NOT NULL;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS qualified_at timestamptz;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS registered_at timestamptz;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS dq_reason_code varchar(100);

COMMENT ON COLUMN public.leads.company_name IS 'Canonical company / account name (maps to spec field "company").';
COMMENT ON COLUMN public.leads.assigned_agent_id IS 'Assigned agent (CRM). Often aligned with rep_id for telemarketing.';
COMMENT ON COLUMN public.leads.rep_id IS 'Assigned telemarketing rep (FK users).';
COMMENT ON COLUMN public.leads.dq_reason_code IS 'Primary DQ reason code when disqualified; see also disqualification_reasons.';

UPDATE public.leads SET rep_id = assigned_agent_id WHERE rep_id IS NULL AND assigned_agent_id IS NOT NULL;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_check CHECK (
    status = ANY (
      ARRAY[
        'new',
        'qa_pending',
        'qualified',
        'disqualified',
        'registered',
        'attended',
        'no_show',
        'contacted',
        'interested',
        'followup',
        'closed_won',
        'closed_lost'
      ]::text[]
    )
  );

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_consent_status_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_consent_status_check CHECK (
    consent_status = ANY (
      ARRAY['pending', 'verified', 'missing', 'disputed']::text[]
    )
  );

ALTER TABLE public.leads ALTER COLUMN consent_status SET NOT NULL;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_channel_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_channel_check CHECK (
    channel = ANY (ARRAY['email', 'telemarketing']::text[])
  );

ALTER TABLE public.leads ALTER COLUMN channel SET NOT NULL;
