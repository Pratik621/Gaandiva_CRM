-- =============================================================================
-- SIMPLIFIED MANAGEMENT MODULE — Meta lead source metadata + sync stats
--   1. simplified_leads: source + Meta identifiers (page / form / campaign /
--      ad set / ad, Meta created_time, inbox_url) as real columns, backfilled
--      from raw_data for leads that already carry a Meta lead id.
--   2. Source-field guard: sm_agent / sm_marketing can't edit the original
--      Meta data (name, phone, email, form answers, Meta ids) of a Meta lead.
--   3. simplified_meta_sources: discovered forms + per-sync statistics.
-- Touches only simplified_* tables used by sm_marketing / sm_agent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. SIMPLIFIED_LEADS source columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.simplified_leads
  ADD COLUMN IF NOT EXISTS source             text,
  ADD COLUMN IF NOT EXISTS meta_page_id       text,
  ADD COLUMN IF NOT EXISTS meta_form_id       text,
  ADD COLUMN IF NOT EXISTS meta_form_name     text,
  ADD COLUMN IF NOT EXISTS meta_campaign_id   text,
  ADD COLUMN IF NOT EXISTS meta_campaign_name text,
  ADD COLUMN IF NOT EXISTS meta_adset_id      text,
  ADD COLUMN IF NOT EXISTS meta_adset_name    text,
  ADD COLUMN IF NOT EXISTS meta_ad_id         text,
  ADD COLUMN IF NOT EXISTS meta_ad_name       text,
  ADD COLUMN IF NOT EXISTS meta_platform      text,
  ADD COLUMN IF NOT EXISTS meta_created_time  timestamptz,
  ADD COLUMN IF NOT EXISTS inbox_url          text;

-- Leads the token sync already inserted: source_row_hash = 'id:<meta id>'
-- (a Meta sheet export stores 'id:l:<meta id>' instead).
UPDATE public.simplified_leads
SET source = CASE
  WHEN meta_lead_id IS NOT NULL AND source_row_hash = 'id:' || meta_lead_id THEN 'meta'
  WHEN source_row_hash IS NOT NULL THEN 'google_sheet'
  ELSE 'manual'
END
WHERE source IS NULL;

ALTER TABLE public.simplified_leads
  ALTER COLUMN source SET DEFAULT 'manual',
  ALTER COLUMN source SET NOT NULL;

ALTER TABLE public.simplified_leads DROP CONSTRAINT IF EXISTS simplified_leads_source_check;
ALTER TABLE public.simplified_leads
  ADD CONSTRAINT simplified_leads_source_check CHECK (source IN ('meta', 'google_sheet', 'manual', 'import'));

-- Backfill Meta metadata from raw_data for leads with a Meta lead id (API
-- or sheet export). Sheet exports prefix ids ("f:", "c:", "as:", "ag:").
UPDATE public.simplified_leads
SET
  meta_form_id       = NULLIF(regexp_replace(COALESCE(raw_data->>'form_id', ''), '^[a-z]+:', '', 'i'), ''),
  meta_form_name     = NULLIF(raw_data->>'form_name', ''),
  meta_campaign_id   = NULLIF(regexp_replace(COALESCE(raw_data->>'campaign_id', ''), '^[a-z]+:', '', 'i'), ''),
  meta_campaign_name = NULLIF(raw_data->>'campaign_name', ''),
  meta_adset_id      = NULLIF(regexp_replace(COALESCE(raw_data->>'adset_id', ''), '^[a-z]+:', '', 'i'), ''),
  meta_adset_name    = NULLIF(raw_data->>'adset_name', ''),
  meta_ad_id         = NULLIF(regexp_replace(COALESCE(raw_data->>'ad_id', ''), '^[a-z]+:', '', 'i'), ''),
  meta_ad_name       = NULLIF(raw_data->>'ad_name', ''),
  meta_platform      = NULLIF(raw_data->>'platform', ''),
  inbox_url          = COALESCE(inbox_url, NULLIF(raw_data->>'inbox_url', ''))
WHERE meta_lead_id IS NOT NULL
  AND meta_form_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_simplified_leads_source       ON public.simplified_leads(source);
CREATE INDEX IF NOT EXISTS idx_simplified_leads_meta_form_id ON public.simplified_leads(meta_form_id);

-- -----------------------------------------------------------------------------
-- 2. SOURCE-FIELD GUARD — Meta form data is source data. sm_agent /
--    sm_marketing may work the lead (status, notes, callback) but not rewrite
--    what Meta sent. The service role (sync) and other roles are unaffected.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_simplified_lead_source_fields()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF OLD.source = 'meta'
     AND auth.uid() IS NOT NULL
     AND (public.is_org_sm_agent(auth.uid()) OR public.is_org_sm_marketing(auth.uid()))
     AND NOT public.is_org_admin(auth.uid())
     AND (NEW.name, NEW.phone, NEW.email, NEW.raw_data, NEW.source, NEW.meta_lead_id,
          NEW.meta_page_id, NEW.meta_form_id, NEW.meta_campaign_id, NEW.meta_ad_id, NEW.meta_created_time)
         IS DISTINCT FROM
         (OLD.name, OLD.phone, OLD.email, OLD.raw_data, OLD.source, OLD.meta_lead_id,
          OLD.meta_page_id, OLD.meta_form_id, OLD.meta_campaign_id, OLD.meta_ad_id, OLD.meta_created_time)
  THEN
    RAISE EXCEPTION 'Meta source data on this lead is read-only'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_simplified_lead_source_fields ON public.simplified_leads;
CREATE TRIGGER trg_guard_simplified_lead_source_fields
  BEFORE UPDATE ON public.simplified_leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_simplified_lead_source_fields();

-- -----------------------------------------------------------------------------
-- 3. SIMPLIFIED_META_SOURCES — discovered forms + last sync statistics
--    discovered_forms: [{ id, name, status, leads_read, imported, duplicates, error }]
-- -----------------------------------------------------------------------------
ALTER TABLE public.simplified_meta_sources
  ADD COLUMN IF NOT EXISTS discovered_forms      jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_sync_duplicates  integer,
  ADD COLUMN IF NOT EXISTS last_sync_forms       integer,
  ADD COLUMN IF NOT EXISTS last_sync_errors      integer;
