-- Separate QA status from agent/sales status.
-- - status: used by agents (new, contacted, interested, followup, closed_won, closed_lost)
-- - qa_status: used by QA team (pending_review, approved, rejected, needs_changes)

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS qa_status text;

COMMENT ON COLUMN public.leads.qa_status IS 'QA review status: pending_review, approved, rejected, needs_changes. Distinct from status (agent/sales pipeline).';

-- Optional: constraint for valid values (comment only; avoid breaking if you add more later)
-- ALTER TABLE public.leads ADD CONSTRAINT leads_qa_status_check
--   CHECK (qa_status IS NULL OR qa_status IN ('pending_review', 'approved', 'rejected', 'needs_changes'));
