-- Rename Lead Finder engine columns / source labels (no vendor branding).
-- Idempotent: safe if already renamed on a fresh DB that used the updated create migration.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lead_finder_runs'
      AND column_name = 'apify_run_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lead_finder_runs'
      AND column_name = 'engine_run_id'
  ) THEN
    ALTER TABLE public.lead_finder_runs RENAME COLUMN apify_run_id TO engine_run_id;
  END IF;
END $$;

ALTER TABLE public.lead_finder_leads
  ALTER COLUMN source SET DEFAULT 'lead_finder';

UPDATE public.lead_finder_leads
SET source = 'lead_finder'
WHERE source = 'apify_lead_finder';

COMMENT ON TABLE public.lead_finder_runs IS
  'Lead Finder engine runs (admin-only module); progress doubles as import resume offset.';
COMMENT ON TABLE public.lead_finder_leads IS
  'B2B prospects imported by Lead Finder — separate from operational campaign leads.';
