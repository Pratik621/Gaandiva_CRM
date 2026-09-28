-- =============================================================================
-- SIMPLIFIED MANAGEMENT MODULE — allow "status updates only" Meta tokens.
-- A Conversions API token from Events Manager can send CRM lead events to a
-- dataset but can't read a Page's leads, so it's stored with page_id NULL:
-- skipped by the lead sync, still used to push sm_agent status changes.
-- =============================================================================

ALTER TABLE public.simplified_meta_sources
  ALTER COLUMN page_id DROP NOT NULL;

-- One status-only token per org + dataset (Page tokens stay unique per
-- org + page via uq_simplified_meta_sources_org_page).
CREATE UNIQUE INDEX IF NOT EXISTS uq_simplified_meta_sources_org_dataset_status_only
  ON public.simplified_meta_sources(organization_id, dataset_id)
  WHERE page_id IS NULL;

ALTER TABLE public.simplified_meta_sources
  DROP CONSTRAINT IF EXISTS simplified_meta_sources_page_or_dataset;
ALTER TABLE public.simplified_meta_sources
  ADD CONSTRAINT simplified_meta_sources_page_or_dataset
  CHECK (page_id IS NOT NULL OR dataset_id IS NOT NULL);
