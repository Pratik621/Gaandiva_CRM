-- Track which QA user performed the audit (reliable vs qa_name text alone).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS qa_audited_by_id uuid REFERENCES public.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_qa_audited_by_id ON public.leads (qa_audited_by_id);

COMMENT ON COLUMN public.leads.qa_audited_by_id IS 'QA user who last updated QA audit fields (qa_status, comments, etc.).';

-- Backfill from qa_name where it matches an active QA user.
UPDATE public.leads l
SET qa_audited_by_id = u.id
FROM public.users u
WHERE l.qa_audited_by_id IS NULL
  AND l.qa_name IS NOT NULL
  AND trim(l.qa_name) <> ''
  AND (
    lower(trim(l.qa_name)) = lower(trim(coalesce(u.full_name, '')))
    OR lower(trim(l.qa_name)) = lower(trim(coalesce(u.email, '')))
  )
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = u.id
      AND lower(replace(r.name, ' ', '_')) = 'qa'
  );
