-- QA bulk import and server-side lead creation: allow INSERT within own organization.
-- (SELECT/UPDATE for QA are already covered by leads_select_qa_scored and leads_update_qa.)

CREATE POLICY "leads_insert_qa"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND public.is_org_qa()
  );
