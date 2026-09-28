-- =============================================================================
-- CLIENTS TABLE: Sales / Admin can add and manage clients (company + contact + requirements)
-- =============================================================================

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Company Information
  company_name text NOT NULL,
  company_website text,
  industry_type text,
  company_size text,
  year_established integer,
  company_address text,
  city text,
  state text,
  country text,

  -- Primary Contact Person
  contact_full_name text,
  contact_designation text,
  contact_work_email text,
  contact_mobile text,
  contact_linkedin text,

  -- Business Details
  services_products_offered text,
  target_market text,
  target_geography text,
  current_revenue_range text,
  existing_crm boolean,
  existing_crm_which text,

  -- Requirements
  problem_solving text,
  services_looking_for text,
  budget_range text,
  expected_start_date date
);

CREATE INDEX idx_clients_organization_id ON public.clients(organization_id);
CREATE INDEX idx_clients_created_at ON public.clients(created_at DESC);
CREATE INDEX idx_clients_company_name ON public.clients(company_name);

-- -----------------------------------------------------------------------------
-- RLS: Sales, TL, Admin can select/insert/update/delete clients in their org
-- -----------------------------------------------------------------------------
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select_sales_tl_admin"
  ON public.clients FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin_or_team_leader() OR public.is_org_sales())
  );

CREATE POLICY "clients_insert_sales_tl_admin"
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin_or_team_leader() OR public.is_org_sales())
  );

CREATE POLICY "clients_update_sales_tl_admin"
  ON public.clients FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin_or_team_leader() OR public.is_org_sales())
  )
  WITH CHECK (organization_id = public.get_my_organization_id());

CREATE POLICY "clients_delete_sales_tl_admin"
  ON public.clients FOR DELETE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin_or_team_leader() OR public.is_org_sales())
  );
