-- QA status options: Qualified, Disqualified, Rectified
-- Disqualified: multiple reason codes (disqualification_reasons) + free-text Disqualification reason (disqualification_reason)
-- Rectified: free-text Rectified reason (rectified_reason)

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS disqualification_reasons text,
  ADD COLUMN IF NOT EXISTS disqualification_reason text,
  ADD COLUMN IF NOT EXISTS rectified_reason text;

COMMENT ON COLUMN public.leads.disqualification_reasons IS 'When qa_status=Disqualified: selected reason codes, comma-separated.';
COMMENT ON COLUMN public.leads.disqualification_reason IS 'When qa_status=Disqualified: free-text disqualification reason.';
COMMENT ON COLUMN public.leads.rectified_reason IS 'When qa_status=Rectified: free-text rectified reason.';
