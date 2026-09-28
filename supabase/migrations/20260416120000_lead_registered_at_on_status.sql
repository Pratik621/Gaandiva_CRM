-- Stamp qualified_at / registered_at when leads move into those funnel stages.
-- registered_at represents client landing-page registration time; COALESCE preserves imports / webhooks.

COMMENT ON COLUMN public.leads.registered_at IS
  'Timestamp when the lead registered on the client landing page (LP). Set on import, integrations, or first transition to registered.';

CREATE OR REPLACE FUNCTION public.cmd_process_lead_status_change(
  p_lead_id uuid,
  p_new_status text,
  p_new_consent text,
  p_changed_by uuid,
  p_reason text DEFAULT NULL,
  p_old_status text DEFAULT NULL,
  p_old_consent text DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_alert_type text DEFAULT NULL,
  p_alert_title text DEFAULT NULL,
  p_alert_message text DEFAULT NULL,
  p_alert_severity text DEFAULT 'medium',
  p_alert_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id uuid;
  v_org_id uuid;
  v_alert_id uuid := NULL;
  v_existing_alert_id uuid := NULL;
  v_deduped boolean := false;
  v_reason_code varchar(255);
  v_meta jsonb;
BEGIN
  SELECT campaign_id, organization_id
    INTO v_campaign_id, v_org_id
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  UPDATE public.leads
  SET
    status = p_new_status,
    consent_status = p_new_consent,
    updated_at = now(),
    qualified_at = CASE
      WHEN p_new_status = 'qualified' THEN COALESCE(qualified_at, now())
      ELSE qualified_at
    END,
    registered_at = CASE
      WHEN p_new_status = 'registered' THEN COALESCE(registered_at, now())
      ELSE registered_at
    END
  WHERE id = p_lead_id;

  v_reason_code :=
    CASE
      WHEN p_reason IS NOT NULL AND length(trim(p_reason)) > 0 THEN left(trim(p_reason), 255)
      ELSE NULL
    END;

  v_meta := COALESCE(p_alert_metadata, '{}'::jsonb);

  INSERT INTO public.lead_history (
    lead_id,
    changed_by,
    change_type,
    old_value,
    new_value,
    reason,
    ip_address,
    previous_status,
    new_status,
    trigger_source,
    reason_code,
    metadata
  )
  VALUES (
    p_lead_id,
    p_changed_by,
    'status_change',
    jsonb_build_object('status', p_old_status, 'consent_status', p_old_consent),
    jsonb_build_object('status', p_new_status, 'consent_status', p_new_consent),
    p_reason,
    NULLIF(trim(p_ip_address), ''),
    p_old_status,
    p_new_status,
    'system',
    v_reason_code,
    v_meta
  );

  INSERT INTO public.campaign_metrics (campaign_id)
  VALUES (v_campaign_id)
  ON CONFLICT (campaign_id) DO NOTHING;

  UPDATE public.campaign_metrics
  SET
    total_leads = (SELECT count(*) FROM public.leads WHERE campaign_id = v_campaign_id),
    qa_pending_count = (SELECT count(*) FROM public.leads WHERE campaign_id = v_campaign_id AND status = 'qa_pending'),
    qualified_count = (SELECT count(*) FROM public.leads WHERE campaign_id = v_campaign_id AND status = 'qualified'),
    registered_count = (SELECT count(*) FROM public.leads WHERE campaign_id = v_campaign_id AND status = 'registered'),
    attended_count = (SELECT count(*) FROM public.leads WHERE campaign_id = v_campaign_id AND status = 'attended'),
    disqualified_count = (SELECT count(*) FROM public.leads WHERE campaign_id = v_campaign_id AND status = 'disqualified'),
    no_show_count = (SELECT count(*) FROM public.leads WHERE campaign_id = v_campaign_id AND status = 'no_show'),
    total_leads_delivered = (
      SELECT count(*)
      FROM public.leads
      WHERE campaign_id = v_campaign_id AND status IN ('registered', 'attended')
    ),
    updated_at = now()
  WHERE campaign_id = v_campaign_id;

  IF p_alert_type IS NOT NULL THEN
    SELECT id
      INTO v_existing_alert_id
    FROM public.alerts
    WHERE alert_type = p_alert_type
      AND lead_id = p_lead_id
      AND is_resolved = false
    LIMIT 1;

    IF v_existing_alert_id IS NULL THEN
      INSERT INTO public.alerts (
        organization_id,
        campaign_id,
        lead_id,
        alert_type,
        severity,
        title,
        message,
        metadata,
        created_by
      )
      VALUES (
        v_org_id,
        v_campaign_id,
        p_lead_id,
        p_alert_type,
        p_alert_severity::text,
        p_alert_title,
        p_alert_message,
        p_alert_metadata,
        p_changed_by
      )
      RETURNING id INTO v_alert_id;
    ELSE
      v_alert_id := v_existing_alert_id;
      v_deduped := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'alert_id', v_alert_id,
    'deduped', v_deduped,
    'campaign_id', v_campaign_id
  );
END;
$$;
