-- =============================================================================
-- Attribution: track which agent/user last updated a simplified lead
-- (status, notes, callback). Name is snapshotted alongside the id so the UI
-- can show it without an extra join or losing it if the user is later removed.
-- =============================================================================

ALTER TABLE public.simplified_leads
  ADD COLUMN IF NOT EXISTS updated_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_name text;
