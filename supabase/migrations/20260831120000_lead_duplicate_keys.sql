-- Campaign-scoped lead duplicate detection via indexed keys.
-- Matches app rules in src/lib/leads/checkDuplicateLead.ts.
-- Existing duplicate rows are grandfathered: oldest lead keeps each key; others remain editable.

-- ---------------------------------------------------------------------------
-- 1) Index table (RLS deny-all; only SECURITY DEFINER triggers/RPCs touch it)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lead_duplicate_keys (
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  key_type text NOT NULL,
  normalized_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, key_type, normalized_value),
  CONSTRAINT lead_duplicate_keys_key_type_check CHECK (
    key_type = ANY (
      ARRAY[
        'email',
        'prospect_linkedin_url',
        'job_title_link',
        'full_name_company_name',
        'full_name_company_domain'
      ]::text[]
    )
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

-- ---------------------------------------------------------------------------
-- 2) Normalization helpers (IMMUTABLE, search_path locked)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lead_duplicate_normalize_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(trim(coalesce(p_value, '')));
$$;

CREATE OR REPLACE FUNCTION public.lead_duplicate_normalize_domain(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
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
SET search_path = ''
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
SET search_path = ''
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
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.lead_duplicate_fields_changed(
  p_old public.leads,
  p_new public.leads
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    p_old.first_name IS DISTINCT FROM p_new.first_name
    OR p_old.last_name IS DISTINCT FROM p_new.last_name
    OR p_old.company_name IS DISTINCT FROM p_new.company_name
    OR p_old.domain IS DISTINCT FROM p_new.domain
    OR p_old.contact_linkedin_url IS DISTINCT FROM p_new.contact_linkedin_url
    OR p_old.job_title_link IS DISTINCT FROM p_new.job_title_link
    OR p_old.email IS DISTINCT FROM p_new.email
    OR p_old.campaign_id IS DISTINCT FROM p_new.campaign_id
    OR p_old.organization_id IS DISTINCT FROM p_new.organization_id;
$$;

-- Fast duplicate lookup via lead_duplicate_keys (index-only path).
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
SET search_path = ''
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
    ck.duplicate_reason
  FROM candidate_keys ck
  JOIN public.lead_duplicate_keys ldk
    ON ldk.organization_id = p_organization_id
   AND ldk.campaign_id = p_campaign_id
   AND ldk.key_type = ck.key_type
   AND ldk.normalized_value = ck.normalized_value
  JOIN public.leads l
    ON l.id = ldk.lead_id
  WHERE (p_exclude_lead_id IS NULL OR l.id <> p_exclude_lead_id)
  ORDER BY ck.sort_order, l.created_at, l.id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_campaign_duplicate_lead(
  uuid, uuid, uuid, text, text, text, text, text, text, text
) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 3) Triggers: BEFORE enforce, AFTER sync keys
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_lead_duplicate_keys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_duplicate record;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NOT public.lead_duplicate_fields_changed(OLD, NEW) THEN
    RETURN NEW;
  END IF;

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
    RAISE EXCEPTION 'Duplicate lead'
      USING ERRCODE = '23505',
            DETAIL = 'This lead already exists in this campaign.',
            HINT = coalesce(v_duplicate.duplicate_reason, 'Duplicate lead');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_lead_duplicate_keys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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
  ) AS keys
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.lead_duplicate_keys ldk
    WHERE ldk.organization_id = NEW.organization_id
      AND ldk.campaign_id = NEW.campaign_id
      AND ldk.key_type = keys.key_type
      AND ldk.normalized_value = keys.normalized_value
      AND ldk.lead_id <> NEW.id
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_lead_duplicate_keys() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_lead_duplicate_keys() FROM PUBLIC;

DROP TRIGGER IF EXISTS leads_enforce_duplicate_keys ON public.leads;
CREATE TRIGGER leads_enforce_duplicate_keys
  BEFORE INSERT OR UPDATE OF
    first_name,
    last_name,
    company_name,
    domain,
    contact_linkedin_url,
    job_title_link,
    email,
    campaign_id,
    organization_id
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_lead_duplicate_keys();

DROP TRIGGER IF EXISTS leads_sync_duplicate_keys ON public.leads;
CREATE TRIGGER leads_sync_duplicate_keys
  AFTER INSERT OR UPDATE OF
    first_name,
    last_name,
    company_name,
    domain,
    contact_linkedin_url,
    job_title_link,
    email,
    campaign_id,
    organization_id
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_duplicate_keys();

-- ---------------------------------------------------------------------------
-- 4) Backfill: oldest lead per key wins; grandfathered rows keep working
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM set_config('statement_timeout', '900000', true);

  INSERT INTO public.lead_duplicate_keys (
    lead_id,
    organization_id,
    campaign_id,
    key_type,
    normalized_value
  )
  SELECT
    ranked.lead_id,
    ranked.organization_id,
    ranked.campaign_id,
    ranked.key_type,
    ranked.normalized_value
  FROM (
    SELECT
      l.id AS lead_id,
      l.organization_id,
      l.campaign_id,
      keys.key_type,
      keys.normalized_value,
      row_number() OVER (
        PARTITION BY l.organization_id, l.campaign_id, keys.key_type, keys.normalized_value
        ORDER BY l.created_at, l.id
      ) AS row_rank
    FROM public.leads l
    CROSS JOIN LATERAL public.lead_duplicate_candidate_keys(
      l.first_name,
      l.last_name,
      l.company_name,
      l.domain,
      l.contact_linkedin_url,
      l.job_title_link,
      l.email
    ) AS keys
  ) ranked
  WHERE ranked.row_rank = 1
  ON CONFLICT DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Audit RPC (admin / TL / QA only, org-scoped)
-- ---------------------------------------------------------------------------

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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
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

  IF NOT (
    public.is_org_admin(v_user_id)
    OR public.is_org_team_leader(v_user_id)
    OR public.is_org_qa(v_user_id)
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org_id THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.campaigns c
    WHERE c.id = p_campaign_id
      AND c.organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Campaign not found' USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
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
    WHERE l.organization_id = v_org_id
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
    r.campaign_id,
    r.campaign_name,
    r.lead_db_id,
    r.lead_id,
    r.agent_name,
    r.creation_time,
    r.duplicate_reason,
    r.original_lead_id AS recommended_original_row_to_keep,
    array_to_string(
      array_remove(r.grouped_lead_ids, r.original_lead_id),
      ', '
    ) AS extra_rows_requiring_review
  FROM ranked r
  WHERE r.row_rank > 1
  ORDER BY r.campaign_name, r.duplicate_reason, r.creation_time, r.lead_db_id;
END;
$$;

REVOKE ALL ON FUNCTION public.lead_duplicate_audit_report(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_duplicate_audit_report(uuid, uuid) TO authenticated;

COMMENT ON TABLE public.lead_duplicate_keys IS
  'Indexed duplicate keys per lead; scope-unique index enforces one owner per campaign key.';
COMMENT ON FUNCTION public.find_campaign_duplicate_lead IS
  'Internal fast duplicate lookup via lead_duplicate_keys; not granted to clients.';
COMMENT ON FUNCTION public.lead_duplicate_audit_report IS
  'Org-scoped duplicate audit for admin/TL/QA; returns non-canonical duplicate rows.';
