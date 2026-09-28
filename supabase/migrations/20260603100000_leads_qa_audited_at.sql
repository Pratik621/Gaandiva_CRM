ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS qa_audited_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_qa_audited_at ON public.leads (qa_audited_at);

COMMENT ON COLUMN public.leads.qa_audited_at IS 'When the QA user last saved QA audit fields on this lead.';

UPDATE public.leads
SET qa_audited_at = updated_at
WHERE qa_audited_by_id IS NOT NULL
  AND qa_audited_at IS NULL;
