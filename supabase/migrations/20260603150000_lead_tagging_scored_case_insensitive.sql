-- QA RLS and UI expect scored leads; some rows were saved as lowercase "scored".

UPDATE public.leads
SET lead_tagging = 'Scored'
WHERE lead_tagging IS NOT NULL
  AND lower(trim(lead_tagging)) = 'scored'
  AND lead_tagging IS DISTINCT FROM 'Scored';

DROP POLICY IF EXISTS "leads_select_qa_scored" ON public.leads;

CREATE POLICY "leads_select_qa_scored"
  ON public.leads FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND public.is_org_qa()
    AND lower(trim(lead_tagging)) = 'scored'
  );
