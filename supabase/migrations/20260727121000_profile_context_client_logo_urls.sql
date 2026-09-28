-- Extend get_my_profile_context to return client_logo_urls (multi-logo header).
-- Keeps client_logo_url as the first logo for backward-compatible readers.
-- Zero-downtime: CREATE OR REPLACE; app still accepts single client_logo_url.

CREATE OR REPLACE FUNCTION public.get_my_profile_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_me public.users%ROWTYPE;
  v_roles text[];
  v_is_om boolean;
  v_manager_name text;
  v_campaigns jsonb := '[]'::jsonb;
  v_logo text;
  v_logos text[] := '{}';
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_me FROM public.users WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Roles (raw names, same as user_roles -> roles(name) join)
  SELECT coalesce(array_agg(r.name), '{}')
  INTO v_roles
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_uid AND r.name IS NOT NULL AND r.name <> '';

  -- hasOperationsManagerAccess(): normalize = lowercase + whitespace -> "_"
  v_is_om := EXISTS (
    SELECT 1 FROM unnest(v_roles) AS n
    WHERE lower(regexp_replace(n, '\s+', '_', 'g')) = 'operations_manager'
  );

  -- Manager name: full_name || email (empty string falls through, like JS)
  IF v_me.reporting_manager_id IS NOT NULL THEN
    SELECT coalesce(nullif(m.full_name, ''), nullif(m.email, ''))
    INTO v_manager_name
    FROM public.users m
    WHERE m.id = v_me.reporting_manager_id;
  END IF;

  -- Assigned campaigns: OM = all org campaigns; else active assignments; else TL campaigns
  IF v_is_om AND v_me.organization_id IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name), '[]'::jsonb)
    INTO v_campaigns
    FROM public.campaigns c
    WHERE c.organization_id = v_me.organization_id;
  ELSIF NOT v_is_om THEN
    IF EXISTS (
      SELECT 1 FROM public.campaign_assignments ca
      WHERE ca.agent_id = v_uid AND ca.is_active = true
    ) THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name), '[]'::jsonb)
      INTO v_campaigns
      FROM public.campaigns c
      WHERE c.id IN (
        SELECT ca.campaign_id FROM public.campaign_assignments ca
        WHERE ca.agent_id = v_uid AND ca.is_active = true
      );
    ELSE
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name), '[]'::jsonb)
      INTO v_campaigns
      FROM public.campaigns c
      WHERE c.assigned_team_leader_id = v_uid;
    END IF;
  END IF;

  -- Client logos: own client first, then org's "DC" client for dc-role users
  IF v_me.organization_id IS NOT NULL THEN
    IF v_me.client_id IS NOT NULL THEN
      SELECT
        CASE
          WHEN c.logo_urls IS NOT NULL AND cardinality(c.logo_urls) > 0 THEN c.logo_urls
          WHEN c.logo_url IS NOT NULL AND btrim(c.logo_url) <> '' THEN ARRAY[c.logo_url]
          ELSE '{}'::text[]
        END
      INTO v_logos
      FROM public.clients c
      WHERE c.id = v_me.client_id AND c.organization_id = v_me.organization_id;
    END IF;
    IF cardinality(coalesce(v_logos, '{}')) = 0 AND EXISTS (
      SELECT 1 FROM unnest(v_roles) AS n
      WHERE lower(regexp_replace(btrim(n), '\s+', '_', 'g')) = 'dc'
    ) THEN
      SELECT
        CASE
          WHEN c.logo_urls IS NOT NULL AND cardinality(c.logo_urls) > 0 THEN c.logo_urls
          WHEN c.logo_url IS NOT NULL AND btrim(c.logo_url) <> '' THEN ARRAY[c.logo_url]
          ELSE '{}'::text[]
        END
      INTO v_logos
      FROM public.clients c
      WHERE c.organization_id = v_me.organization_id
        AND lower(btrim(c.name)) = 'dc'
      LIMIT 1;
    END IF;
  END IF;

  v_logos := coalesce(v_logos, '{}');
  v_logo := CASE WHEN cardinality(v_logos) > 0 THEN v_logos[1] ELSE NULL END;

  RETURN jsonb_build_object(
    'id', v_me.id,
    'full_name', v_me.full_name,
    'email', v_me.email,
    'phone', v_me.phone,
    'employee_id', v_me.employee_id,
    'agent_code', v_me.agent_code,
    'date_of_birth', v_me.date_of_birth,
    'avatar_url', v_me.avatar_url,
    'joining_date', coalesce(to_jsonb(v_me.joining_date), to_jsonb(v_me.created_at)),
    'status', v_me.status,
    'created_at', v_me.created_at,
    'reporting_manager_id', v_me.reporting_manager_id,
    'designation', v_me.designation,
    'department', v_me.department,
    'employment_type', v_me.employment_type,
    'organization_id', v_me.organization_id,
    'client_id', v_me.client_id,
    'roles', to_jsonb(v_roles),
    'manager_name', v_manager_name,
    'assigned_campaigns', v_campaigns,
    'client_logo_url', v_logo,
    'client_logo_urls', to_jsonb(v_logos)
  );
END;
$function$;
