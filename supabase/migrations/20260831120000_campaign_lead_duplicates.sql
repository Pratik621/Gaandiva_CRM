CREATE TABLE IF NOT EXISTS public.lead_duplicate_keys (
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  key_type text NOT NULL,
  normalized_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, key_type, normalized_value),
  CONSTRAINT lead_duplicate_keys_key_type_check CHECK (
    key_type = ANY (ARRAY['email', 'prospect_linkedin_url', 'job_title_link', 'full_name_company_name', 'full_name_company_domain']::text[])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_duplicate_keys_scope_unique
  ON public.lead_duplicate_keys (organization_id, campaign_id, key_type, normalized_value);

CREATE INDEX IF NOT EXISTS lead_duplicate_keys_campaign_idx
  ON public.lead_duplicate_keys (organization_id, campaign_id, lead_id);

ALTER TABLE public.lead_duplicate_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_duplicate_keys_no_access" ON public.lead_duplicate_keys;
CREATE POLICY "lead_duplicate_keys_no_access"
  ON public.lead_duplicate_keys
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.lead_duplicate_normalize_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(trim(coalesce(p_value, '')));
$$;

CREATE OR REPLACE FUNCTION public.lead_duplicate_normalize_domain(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_raw text := public.lead_duplicate_normalize_text(p_value);
BEGIN
  IF v_raw = '' THEN
    RETURN '';
  END IF;

  v_raw := regexp_replace(v_raw, '^https?://', '');
  v_raw := regexp_replace(v_raw, '^www\.', '');
  v_raw := split_part(v_raw, '/', 1);
  v_raw := split_part(v_raw, '?', 1);
  v_raw := split_part(v_raw, '#', 1);
  RETURN v_raw;
END;
$$;

CREATE OR REPLACE FUNCTION public.lead_duplicate_normalize_company_base(
  p_value text,
  p_is_domain boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_raw text := public.lead_duplicate_normalize_text(p_value);
BEGIN
  IF v_raw = '' THEN
    RETURN '';
  END IF;

  IF p_is_domain THEN
    v_raw := split_part(public.lead_duplicate_normalize_domain(v_raw), '.', 1);
  ELSE
    v_raw := regexp_replace(
      v_raw,
      '\m(private|pvt|limited|ltd|incorporated|inc|corporation|corp|llc|l\.l\.c|lcc|llp|plc|gmbh)\M\.?',
      ' ',
      'gi'
    );
  END IF;

  RETURN regexp_replace(v_raw, '[^a-z0-9]', '', 'g');
END;
$$;

CREATE OR REPLACE FUNCTION public.lead_duplicate_normalize_linkedin_url(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_raw text := public.lead_duplicate_normalize_text(p_value);
BEGIN
  IF v_raw = '' THEN
    RETURN '';
  END IF;

  v_raw := regexp_replace(v_raw, '^https?://', '');
  v_raw := regexp_replace(v_raw, '^www\.', '');
  v_raw := split_part(v_raw, '?', 1);
  v_raw := split_part(v_raw, '#', 1);
  v_raw := regexp_replace(v_raw, '/+$', '');
  RETURN v_raw;
END;
$$;

CREATE OR REPLACE FUNCTION public.lead_duplicate_candidate_keys(
  p_first_name text,
  p_last_name text,
  p_company_name text,
  p_domain text,
  p_contact_linkedin_url text,
  p_job_title_link text,
  p_email text
)
RETURNS TABLE (
  key_type text,
  normalized_value text,
  duplicate_reason text,
  sort_order integer
)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT
      public.lead_duplicate_normalize_text(p_first_name) AS first_name,
      public.lead_duplicate_normalize_text(p_last_name) AS last_name,
      public.lead_duplicate_normalize_company_base(p_company_name, false) AS company_base,
      public.lead_duplicate_normalize_company_base(p_domain, true) AS domain_base,
      public.lead_duplicate_normalize_linkedin_url(p_contact_linkedin_url) AS linkedin_url,
      public.lead_duplicate_normalize_linkedin_url(p_job_title_link) AS job_title_link,
      public.lead_duplicate_normalize_text(p_email) AS email
  ),
  base_rows AS (
    SELECT
      'email'::text AS key_type,
      email AS normalized_value,
      'Email ID'::text AS duplicate_reason,
      1 AS sort_order
    FROM normalized
    WHERE email <> ''

    UNION ALL

    SELECT
      'prospect_linkedin_url',
      linkedin_url,
      'Prospect LinkedIn URL',
      2
    FROM normalized
    WHERE linkedin_url <> ''

    UNION ALL

    SELECT
      'job_title_link',
      job_title_link,
      'Job Title Link',
      3
    FROM normalized
    WHERE job_title_link <> ''

    UNION ALL

    SELECT
      'full_name_company_name',
      first_name || '|' || last_name || '|' || company_base,
      'First Name + Last Name + Company Name',
      4
    FROM normalized
    WHERE first_name <> '' AND last_name <> '' AND company_base <> ''
  ),
  company_domain_rows AS (
    SELECT DISTINCT
      'full_name_company_domain'::text AS key_type,
      n.first_name || '|' || n.last_name || '|' || base_value AS normalized_value,
      'First Name + Last Name + Company Domain'::text AS duplicate_reason,
      5 AS sort_order
    FROM normalized n
    CROSS JOIN LATERAL (
      VALUES (n.company_base), (n.domain_base)
    ) AS bases(base_value)
    WHERE n.first_name <> ''
      AND n.last_name <> ''
      AND base_value <> ''
  )
  SELECT * FROM base_rows
  UNION ALL
  SELECT * FROM company_domain_rows;
$$;

CREATE OR REPLACE FUNCTION public.find_campaign_duplicate_lead(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_exclude_lead_id uuid,
  p_first_name text,
  p_last_name text,
  p_company_name text,
  p_domain text,
  p_contact_linkedin_url text,
  p_job_title_link text,
  p_email text
)
RETURNS TABLE (
  lead_row_id uuid,
  duplicate_lead_id text,
  duplicate_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidate_keys AS (
    SELECT *
    FROM public.lead_duplicate_candidate_keys(
      p_first_name,
      p_last_name,
      p_company_name,
      p_domain,
      p_contact_linkedin_url,
      p_job_title_link,
      p_email
    )
  )
  SELECT
    l.id AS lead_row_id,
    l.lead_id AS duplicate_lead_id,
    candidate_keys.duplicate_reason
  FROM public.leads l
  JOIN LATERAL public.lead_duplicate_candidate_keys(
    l.first_name,
    l.last_name,
    l.company_name,
    l.domain,
    l.contact_linkedin_url,
    l.job_title_link,
    l.email
  ) existing_keys ON true
  JOIN candidate_keys
    ON candidate_keys.key_type = existing_keys.key_type
   AND candidate_keys.normalized_value = existing_keys.normalized_value
  WHERE l.organization_id = p_organization_id
    AND l.campaign_id = p_campaign_id
    AND (p_exclude_lead_id IS NULL OR l.id <> p_exclude_lead_id)
  ORDER BY candidate_keys.sort_order, l.created_at, l.id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.sync_lead_duplicate_keys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duplicate record;
BEGIN
  SELECT *
  INTO v_duplicate
  FROM public.find_campaign_duplicate_lead(
    NEW.organization_id,
    NEW.campaign_id,
    NEW.id,
    NEW.first_name,
    NEW.last_name,
    NEW.company_name,
    NEW.domain,
    NEW.contact_linkedin_url,
    NEW.job_title_link,
    NEW.email
  );

  IF FOUND THEN
    RAISE unique_violation
      USING MESSAGE = 'Duplicate lead',
            DETAIL = 'This lead already exists in this campaign.',
            HINT = coalesce(v_duplicate.duplicate_reason, 'Duplicate lead');
  END IF;

  DELETE FROM public.lead_duplicate_keys
  WHERE lead_id = NEW.id;

  INSERT INTO public.lead_duplicate_keys (
    lead_id,
    organization_id,
    campaign_id,
    key_type,
    normalized_value
  )
  SELECT
    NEW.id,
    NEW.organization_id,
    NEW.campaign_id,
    keys.key_type,
    keys.normalized_value
  FROM public.lead_duplicate_candidate_keys(
    NEW.first_name,
    NEW.last_name,
    NEW.company_name,
    NEW.domain,
    NEW.contact_linkedin_url,
    NEW.job_title_link,
    NEW.email
  ) AS keys;

  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    RAISE unique_violation
      USING MESSAGE = 'Duplicate lead',
            DETAIL = 'This lead already exists in this campaign.';
END;
$$;

DROP TRIGGER IF EXISTS leads_sync_duplicate_keys ON public.leads;
CREATE TRIGGER leads_sync_duplicate_keys
  AFTER INSERT OR UPDATE OF first_name, last_name, company_name, domain, contact_linkedin_url, job_title_link, email, campaign_id, organization_id
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_duplicate_keys();

CREATE OR REPLACE FUNCTION public.lead_duplicate_audit_report(
  p_organization_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS TABLE (
  campaign_id uuid,
  campaign_name text,
  lead_db_id uuid,
  lead_id text,
  agent_name text,
  creation_time timestamptz,
  duplicate_reason text,
  recommended_original_row_to_keep text,
  extra_rows_requiring_review text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH expanded AS (
    SELECT
      l.organization_id,
      l.campaign_id,
      c.name AS campaign_name,
      l.id AS lead_db_id,
      l.lead_id,
      coalesce(u.full_name, l.creator_display_name, u.email, l.assigned_agent_id::text) AS agent_name,
      l.created_at AS creation_time,
      keys.key_type,
      keys.normalized_value,
      keys.duplicate_reason
    FROM public.leads l
    JOIN public.campaigns c ON c.id = l.campaign_id
    LEFT JOIN public.users u ON u.id = l.assigned_agent_id
    JOIN LATERAL public.lead_duplicate_candidate_keys(
      l.first_name,
      l.last_name,
      l.company_name,
      l.domain,
      l.contact_linkedin_url,
      l.job_title_link,
      l.email
    ) keys ON true
    WHERE (p_organization_id IS NULL OR l.organization_id = p_organization_id)
      AND (p_campaign_id IS NULL OR l.campaign_id = p_campaign_id)
  ),
  grouped AS (
    SELECT
      organization_id,
      campaign_id,
      campaign_name,
      key_type,
      normalized_value,
      duplicate_reason,
      count(*) AS duplicate_count
    FROM expanded
    GROUP BY 1, 2, 3, 4, 5, 6
    HAVING count(*) > 1
  ),
  ranked AS (
    SELECT
      e.*,
      g.duplicate_count,
      row_number() OVER (
        PARTITION BY e.organization_id, e.campaign_id, e.key_type, e.normalized_value
        ORDER BY e.creation_time, e.lead_db_id
      ) AS row_rank,
      first_value(e.lead_id) OVER (
        PARTITION BY e.organization_id, e.campaign_id, e.key_type, e.normalized_value
        ORDER BY e.creation_time, e.lead_db_id
      ) AS original_lead_id,
      array_agg(e.lead_id ORDER BY e.creation_time, e.lead_db_id) OVER (
        PARTITION BY e.organization_id, e.campaign_id, e.key_type, e.normalized_value
      ) AS grouped_lead_ids
    FROM expanded e
    JOIN grouped g
      ON g.organization_id = e.organization_id
     AND g.campaign_id = e.campaign_id
     AND g.key_type = e.key_type
     AND g.normalized_value = e.normalized_value
  )
  SELECT
    campaign_id,
    campaign_name,
    lead_db_id,
    lead_id,
    agent_name,
    creation_time,
    duplicate_reason,
    original_lead_id AS recommended_original_row_to_keep,
    array_to_string(
      array_remove(grouped_lead_ids, original_lead_id),
      ', '
    ) AS extra_rows_requiring_review
  FROM ranked
  WHERE row_rank > 1
  ORDER BY campaign_name, duplicate_reason, creation_time, lead_db_id;
$$;

CREATE OR REPLACE FUNCTION public.agent_create_campaign_lead(
  p_campaign_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_duplicate record;
  v_payload public.leads;
  v_inserted public.leads;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT u.organization_id
  INTO v_org_id
  FROM public.users u
  WHERE u.id = v_user_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.campaign_assignments ca
    JOIN public.campaigns c ON c.id = ca.campaign_id
    WHERE ca.campaign_id = p_campaign_id
      AND ca.agent_id = v_user_id
      AND ca.is_active = true
      AND ca.organization_id = v_org_id
      AND c.organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'You are not assigned to this campaign' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_org_id::text || ':' || p_campaign_id::text, 0));

  SELECT * INTO v_payload
  FROM jsonb_populate_record(NULL::public.leads, coalesce(p_payload, '{}'::jsonb));

  SELECT *
  INTO v_duplicate
  FROM public.find_campaign_duplicate_lead(
    v_org_id,
    p_campaign_id,
    NULL,
    v_payload.first_name,
    v_payload.last_name,
    v_payload.company_name,
    v_payload.domain,
    v_payload.contact_linkedin_url,
    v_payload.job_title_link,
    v_payload.email
  );

  IF FOUND THEN
    RETURN jsonb_build_object(
      'duplicate', true,
      'duplicate_lead_id', v_duplicate.duplicate_lead_id,
      'duplicate_reason', v_duplicate.duplicate_reason
    );
  END IF;

  INSERT INTO public.leads (
    organization_id,
    campaign_id,
    assigned_agent_id,
    name,
    first_name,
    last_name,
    salutation,
    company_name,
    phone,
    email,
    domain,
    direct_number,
    company_number,
    phone_number_link,
    job_title,
    job_level,
    department,
    job_function,
    job_title_link,
    tenurity,
    vv_status,
    email_status,
    ev_tool,
    address,
    address2,
    address_link,
    city,
    state,
    country,
    zip_code,
    employee_size,
    actual_employee_size,
    see_all_employees,
    industry,
    industry_type_link,
    employee_size_link,
    asset_title,
    asset_title2,
    company_website_link,
    revenue_range,
    revenue_link,
    sic_code,
    sic_code_link,
    naics_code,
    naics_code_link,
    founded_years,
    founded_years_link,
    contact_linkedin_url,
    company_linkedin_url,
    scored,
    scored_timezone,
    appointment,
    appointment_timezone,
    lead_type,
    lead_tagging,
    ra_comment,
    special_comments,
    call_back,
    call_notes,
    primary_reason,
    secondary_reason,
    qa_comments,
    cq1,
    cq2,
    cq3,
    cq4,
    cq5,
    extra_cq,
    audit_date,
    qa_name,
    status,
    lead_disposition,
    followup_date,
    notes,
    billable_status,
    created_by
  )
  VALUES (
    v_org_id,
    p_campaign_id,
    v_user_id,
    v_payload.name,
    v_payload.first_name,
    v_payload.last_name,
    v_payload.salutation,
    v_payload.company_name,
    v_payload.phone,
    v_payload.email,
    v_payload.domain,
    v_payload.direct_number,
    v_payload.company_number,
    v_payload.phone_number_link,
    v_payload.job_title,
    v_payload.job_level,
    v_payload.department,
    v_payload.job_function,
    v_payload.job_title_link,
    v_payload.tenurity,
    v_payload.vv_status,
    v_payload.email_status,
    v_payload.ev_tool,
    v_payload.address,
    v_payload.address2,
    v_payload.address_link,
    v_payload.city,
    v_payload.state,
    v_payload.country,
    v_payload.zip_code,
    v_payload.employee_size,
    v_payload.actual_employee_size,
    v_payload.see_all_employees,
    v_payload.industry,
    v_payload.industry_type_link,
    v_payload.employee_size_link,
    v_payload.asset_title,
    v_payload.asset_title2,
    v_payload.company_website_link,
    v_payload.revenue_range,
    v_payload.revenue_link,
    v_payload.sic_code,
    v_payload.sic_code_link,
    v_payload.naics_code,
    v_payload.naics_code_link,
    v_payload.founded_years,
    v_payload.founded_years_link,
    v_payload.contact_linkedin_url,
    v_payload.company_linkedin_url,
    v_payload.scored,
    v_payload.scored_timezone,
    v_payload.appointment,
    v_payload.appointment_timezone,
    v_payload.lead_type,
    v_payload.lead_tagging,
    v_payload.ra_comment,
    v_payload.special_comments,
    v_payload.call_back,
    v_payload.call_notes,
    v_payload.primary_reason,
    v_payload.secondary_reason,
    v_payload.qa_comments,
    v_payload.cq1,
    v_payload.cq2,
    v_payload.cq3,
    v_payload.cq4,
    v_payload.cq5,
    coalesce(v_payload.extra_cq, '{}'::jsonb),
    v_payload.audit_date,
    v_payload.qa_name,
    coalesce(v_payload.status, 'new'),
    v_payload.lead_disposition,
    v_payload.followup_date,
    v_payload.notes,
    v_payload.billable_status,
    v_user_id
  )
  RETURNING *
  INTO v_inserted;

  RETURN jsonb_build_object(
    'duplicate', false,
    'id', v_inserted.id,
    'lead_id', v_inserted.lead_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_update_campaign_lead(
  p_campaign_id uuid,
  p_lead_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_existing public.leads;
  v_candidate public.leads;
  v_duplicate record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT u.organization_id
  INTO v_org_id
  FROM public.users u
  WHERE u.id = v_user_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.campaign_assignments ca
    JOIN public.campaigns c ON c.id = ca.campaign_id
    WHERE ca.campaign_id = p_campaign_id
      AND ca.agent_id = v_user_id
      AND ca.is_active = true
      AND ca.organization_id = v_org_id
      AND c.organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'You are not assigned to this campaign' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.leads l
  WHERE l.id = p_lead_id
    AND l.organization_id = v_org_id
    AND l.campaign_id = p_campaign_id
    AND l.assigned_agent_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('not_found', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_org_id::text || ':' || p_campaign_id::text, 0));

  SELECT * INTO v_candidate
  FROM jsonb_populate_record(v_existing, coalesce(p_payload, '{}'::jsonb));

  SELECT *
  INTO v_duplicate
  FROM public.find_campaign_duplicate_lead(
    v_org_id,
    p_campaign_id,
    p_lead_id,
    v_candidate.first_name,
    v_candidate.last_name,
    v_candidate.company_name,
    v_candidate.domain,
    v_candidate.contact_linkedin_url,
    v_candidate.job_title_link,
    v_candidate.email
  );

  IF FOUND THEN
    RETURN jsonb_build_object(
      'duplicate', true,
      'duplicate_lead_id', v_duplicate.duplicate_lead_id,
      'duplicate_reason', v_duplicate.duplicate_reason
    );
  END IF;

  UPDATE public.leads
  SET
    name = v_candidate.name,
    first_name = v_candidate.first_name,
    last_name = v_candidate.last_name,
    salutation = v_candidate.salutation,
    company_name = v_candidate.company_name,
    phone = v_candidate.phone,
    email = v_candidate.email,
    domain = v_candidate.domain,
    direct_number = v_candidate.direct_number,
    company_number = v_candidate.company_number,
    phone_number_link = v_candidate.phone_number_link,
    job_title = v_candidate.job_title,
    job_level = v_candidate.job_level,
    department = v_candidate.department,
    job_function = v_candidate.job_function,
    job_title_link = v_candidate.job_title_link,
    tenurity = v_candidate.tenurity,
    vv_status = v_candidate.vv_status,
    email_status = v_candidate.email_status,
    ev_tool = v_candidate.ev_tool,
    address = v_candidate.address,
    address2 = v_candidate.address2,
    address_link = v_candidate.address_link,
    city = v_candidate.city,
    state = v_candidate.state,
    country = v_candidate.country,
    zip_code = v_candidate.zip_code,
    employee_size = v_candidate.employee_size,
    actual_employee_size = v_candidate.actual_employee_size,
    see_all_employees = v_candidate.see_all_employees,
    industry = v_candidate.industry,
    industry_type_link = v_candidate.industry_type_link,
    employee_size_link = v_candidate.employee_size_link,
    asset_title = v_candidate.asset_title,
    asset_title2 = v_candidate.asset_title2,
    company_website_link = v_candidate.company_website_link,
    revenue_range = v_candidate.revenue_range,
    revenue_link = v_candidate.revenue_link,
    sic_code = v_candidate.sic_code,
    sic_code_link = v_candidate.sic_code_link,
    naics_code = v_candidate.naics_code,
    naics_code_link = v_candidate.naics_code_link,
    founded_years = v_candidate.founded_years,
    founded_years_link = v_candidate.founded_years_link,
    contact_linkedin_url = v_candidate.contact_linkedin_url,
    company_linkedin_url = v_candidate.company_linkedin_url,
    scored = v_candidate.scored,
    scored_timezone = v_candidate.scored_timezone,
    appointment = v_candidate.appointment,
    appointment_timezone = v_candidate.appointment_timezone,
    lead_type = v_candidate.lead_type,
    lead_tagging = v_candidate.lead_tagging,
    ra_comment = v_candidate.ra_comment,
    special_comments = v_candidate.special_comments,
    call_back = v_candidate.call_back,
    call_notes = v_candidate.call_notes,
    primary_reason = v_candidate.primary_reason,
    secondary_reason = v_candidate.secondary_reason,
    qa_comments = v_candidate.qa_comments,
    cq1 = v_candidate.cq1,
    cq2 = v_candidate.cq2,
    cq3 = v_candidate.cq3,
    cq4 = v_candidate.cq4,
    cq5 = v_candidate.cq5,
    extra_cq = coalesce(v_candidate.extra_cq, '{}'::jsonb),
    audit_date = v_candidate.audit_date,
    qa_name = v_candidate.qa_name,
    status = v_candidate.status,
    lead_disposition = v_candidate.lead_disposition,
    followup_date = v_candidate.followup_date,
    notes = v_candidate.notes,
    billable_status = v_candidate.billable_status
  WHERE id = p_lead_id
    AND organization_id = v_org_id
    AND campaign_id = p_campaign_id
    AND assigned_agent_id = v_user_id;

  RETURN jsonb_build_object(
    'duplicate', false,
    'id', p_lead_id,
    'lead_id', v_existing.lead_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_import_campaign_leads(
  p_campaign_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_index integer;
  v_total integer := coalesce(jsonb_array_length(coalesce(p_rows, '[]'::jsonb)), 0);
  v_row jsonb;
  v_duplicate record;
  v_created integer := 0;
  v_updated integer := 0;
  v_errors text[] := ARRAY[]::text[];
  v_duplicate_rows jsonb := '[]'::jsonb;
  v_existing_row_id uuid;
  v_existing_lead public.leads;
  v_candidate public.leads;
  v_lead_id_token text;
  v_derived_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT u.organization_id
  INTO v_org_id
  FROM public.users u
  WHERE u.id = v_user_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.campaign_assignments ca
    JOIN public.campaigns c ON c.id = ca.campaign_id
    WHERE ca.campaign_id = p_campaign_id
      AND ca.agent_id = v_user_id
      AND ca.is_active = true
      AND ca.organization_id = v_org_id
      AND c.organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'You are not assigned to this campaign' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_org_id::text || ':' || p_campaign_id::text, 0));

  FOR v_index IN 0..GREATEST(v_total - 1, -1) LOOP
    EXIT WHEN v_index < 0;
    v_row := p_rows -> v_index;
    v_existing_row_id := NULL;
    v_existing_lead := NULL;
    v_candidate := NULL;
    v_lead_id_token := nullif(trim(coalesce(v_row ->> 'lead_id', '')), '');

    IF nullif(trim(coalesce(v_row ->> 'id', '')), '') IS NOT NULL THEN
      v_existing_row_id := (v_row ->> 'id')::uuid;
    ELSIF v_lead_id_token IS NOT NULL THEN
      SELECT l.id
      INTO v_existing_row_id
      FROM public.leads l
      WHERE l.lead_id = v_lead_id_token
        AND l.campaign_id = p_campaign_id
        AND l.organization_id = v_org_id
        AND l.assigned_agent_id = v_user_id;

      IF v_existing_row_id IS NULL THEN
        v_errors := array_append(
          v_errors,
          format(
            'Row %s: Lead not found (%s). Export leads first and keep the lead_id column when editing.',
            v_index + 1,
            v_lead_id_token
          )
        );
        CONTINUE;
      END IF;
    END IF;

    IF v_existing_row_id IS NOT NULL THEN
      SELECT *
      INTO v_existing_lead
      FROM public.leads l
      WHERE l.id = v_existing_row_id
        AND l.campaign_id = p_campaign_id
        AND l.organization_id = v_org_id
        AND l.assigned_agent_id = v_user_id;

      IF NOT FOUND THEN
        v_errors := array_append(v_errors, format('Row %s: Lead not found or not assigned to you', v_index + 1));
        CONTINUE;
      END IF;

      SELECT * INTO v_candidate
      FROM jsonb_populate_record(v_existing_lead, v_row);
    ELSE
      SELECT * INTO v_candidate
      FROM jsonb_populate_record(NULL::public.leads, v_row);
    END IF;

    v_derived_name := coalesce(
      nullif(trim(concat_ws(' ', v_candidate.first_name, v_candidate.last_name)), ''),
      nullif(trim(coalesce(v_candidate.name, '')), ''),
      NULL
    );
    v_candidate.name := v_derived_name;

    IF v_existing_row_id IS NULL
      AND coalesce(v_candidate.name, '') = ''
      AND coalesce(v_candidate.company_name, '') = ''
      AND coalesce(v_candidate.email, '') = ''
      AND coalesce(v_candidate.phone, '') = '' THEN
      v_errors := array_append(
        v_errors,
        format('Row %s: At least one of name, company, email, or phone is required', v_index + 1)
      );
      CONTINUE;
    END IF;

    SELECT *
    INTO v_duplicate
    FROM public.find_campaign_duplicate_lead(
      v_org_id,
      p_campaign_id,
      v_existing_row_id,
      v_candidate.first_name,
      v_candidate.last_name,
      v_candidate.company_name,
      v_candidate.domain,
      v_candidate.contact_linkedin_url,
      v_candidate.job_title_link,
      v_candidate.email
    );

    IF FOUND THEN
      v_duplicate_rows := v_duplicate_rows || jsonb_build_array(
        jsonb_build_object(
          'row', v_index + 1,
          'lead_name', v_candidate.name,
          'existing_lead_id', v_duplicate.duplicate_lead_id,
          'reason', v_duplicate.duplicate_reason,
          'source', 'campaign'
        )
      );
      v_errors := array_append(
        v_errors,
        format(
          'Row %s: Duplicate lead (%s) by %s found in campaign.',
          v_index + 1,
          v_duplicate.duplicate_lead_id,
          v_duplicate.duplicate_reason
        )
      );
      CONTINUE;
    END IF;

    BEGIN
      IF v_existing_row_id IS NOT NULL THEN
        UPDATE public.leads
        SET
          name = v_candidate.name,
          first_name = v_candidate.first_name,
          last_name = v_candidate.last_name,
          salutation = v_candidate.salutation,
          company_name = v_candidate.company_name,
          phone = v_candidate.phone,
          email = v_candidate.email,
          domain = v_candidate.domain,
          direct_number = v_candidate.direct_number,
          company_number = v_candidate.company_number,
          phone_number_link = v_candidate.phone_number_link,
          job_title = v_candidate.job_title,
          job_level = v_candidate.job_level,
          department = v_candidate.department,
          job_function = v_candidate.job_function,
          job_title_link = v_candidate.job_title_link,
          tenurity = v_candidate.tenurity,
          vv_status = v_candidate.vv_status,
          address = v_candidate.address,
          address2 = v_candidate.address2,
          address_link = v_candidate.address_link,
          city = v_candidate.city,
          state = v_candidate.state,
          country = v_candidate.country,
          zip_code = v_candidate.zip_code,
          employee_size = v_candidate.employee_size,
          actual_employee_size = v_candidate.actual_employee_size,
          see_all_employees = v_candidate.see_all_employees,
          industry = v_candidate.industry,
          industry_type_link = v_candidate.industry_type_link,
          employee_size_link = v_candidate.employee_size_link,
          asset_title2 = v_candidate.asset_title2,
          company_website_link = v_candidate.company_website_link,
          revenue_range = v_candidate.revenue_range,
          revenue_link = v_candidate.revenue_link,
          sic_code = v_candidate.sic_code,
          sic_code_link = v_candidate.sic_code_link,
          naics_code = v_candidate.naics_code,
          naics_code_link = v_candidate.naics_code_link,
          founded_years = v_candidate.founded_years,
          founded_years_link = v_candidate.founded_years_link,
          contact_linkedin_url = v_candidate.contact_linkedin_url,
          company_linkedin_url = v_candidate.company_linkedin_url,
          scored = v_candidate.scored,
          scored_timezone = v_candidate.scored_timezone,
          appointment = v_candidate.appointment,
          appointment_timezone = v_candidate.appointment_timezone,
          lead_type = v_candidate.lead_type,
          lead_tagging = v_candidate.lead_tagging,
          ra_comment = v_candidate.ra_comment,
          special_comments = v_candidate.special_comments,
          call_back = v_candidate.call_back,
          call_notes = v_candidate.call_notes,
          followup_date = v_candidate.followup_date,
          notes = v_candidate.notes,
          status = coalesce(v_candidate.status, 'new')
        WHERE id = v_existing_row_id
          AND campaign_id = p_campaign_id
          AND organization_id = v_org_id
          AND assigned_agent_id = v_user_id;

        v_updated := v_updated + 1;
      ELSE
        INSERT INTO public.leads (
          organization_id,
          campaign_id,
          assigned_agent_id,
          created_by,
          name,
          first_name,
          last_name,
          salutation,
          company_name,
          phone,
          email,
          domain,
          direct_number,
          company_number,
          phone_number_link,
          job_title,
          job_level,
          department,
          job_function,
          job_title_link,
          tenurity,
          vv_status,
          address,
          address2,
          address_link,
          city,
          state,
          country,
          zip_code,
          employee_size,
          actual_employee_size,
          see_all_employees,
          industry,
          industry_type_link,
          employee_size_link,
          asset_title2,
          company_website_link,
          revenue_range,
          revenue_link,
          sic_code,
          sic_code_link,
          naics_code,
          naics_code_link,
          founded_years,
          founded_years_link,
          contact_linkedin_url,
          company_linkedin_url,
          scored,
          scored_timezone,
          appointment,
          appointment_timezone,
          lead_type,
          lead_tagging,
          ra_comment,
          special_comments,
          call_back,
          call_notes,
          followup_date,
          notes,
          status
        )
        VALUES (
          v_org_id,
          p_campaign_id,
          v_user_id,
          v_user_id,
          v_candidate.name,
          v_candidate.first_name,
          v_candidate.last_name,
          v_candidate.salutation,
          v_candidate.company_name,
          v_candidate.phone,
          v_candidate.email,
          v_candidate.domain,
          v_candidate.direct_number,
          v_candidate.company_number,
          v_candidate.phone_number_link,
          v_candidate.job_title,
          v_candidate.job_level,
          v_candidate.department,
          v_candidate.job_function,
          v_candidate.job_title_link,
          v_candidate.tenurity,
          v_candidate.vv_status,
          v_candidate.address,
          v_candidate.address2,
          v_candidate.address_link,
          v_candidate.city,
          v_candidate.state,
          v_candidate.country,
          v_candidate.zip_code,
          v_candidate.employee_size,
          v_candidate.actual_employee_size,
          v_candidate.see_all_employees,
          v_candidate.industry,
          v_candidate.industry_type_link,
          v_candidate.employee_size_link,
          v_candidate.asset_title2,
          v_candidate.company_website_link,
          v_candidate.revenue_range,
          v_candidate.revenue_link,
          v_candidate.sic_code,
          v_candidate.sic_code_link,
          v_candidate.naics_code,
          v_candidate.naics_code_link,
          v_candidate.founded_years,
          v_candidate.founded_years_link,
          v_candidate.contact_linkedin_url,
          v_candidate.company_linkedin_url,
          v_candidate.scored,
          v_candidate.scored_timezone,
          v_candidate.appointment,
          v_candidate.appointment_timezone,
          v_candidate.lead_type,
          v_candidate.lead_tagging,
          v_candidate.ra_comment,
          v_candidate.special_comments,
          v_candidate.call_back,
          v_candidate.call_notes,
          v_candidate.followup_date,
          v_candidate.notes,
          coalesce(v_candidate.status, 'new')
        );

        v_created := v_created + 1;
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        v_duplicate_rows := v_duplicate_rows || jsonb_build_array(
          jsonb_build_object(
            'row', v_index + 1,
            'lead_name', v_candidate.name,
            'existing_lead_id', coalesce(v_duplicate.duplicate_lead_id, 'existing lead'),
            'reason', coalesce(v_duplicate.duplicate_reason, 'Duplicate lead'),
            'source', 'campaign'
          )
        );
        v_errors := array_append(
          v_errors,
          format('Row %s: Duplicate lead. This lead already exists in this campaign.', v_index + 1)
        );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'total', v_total,
    'duplicates', jsonb_array_length(v_duplicate_rows),
    'duplicate_rows', v_duplicate_rows,
    'errors', to_jsonb(v_errors)
  );
END;
$$;
