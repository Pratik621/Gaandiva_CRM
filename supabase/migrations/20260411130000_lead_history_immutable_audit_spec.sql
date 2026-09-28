-- lead_history: immutable append-only audit log (architectural spec).
-- Retains change_type + old_value/new_value for polymorphic events (e.g. alert_resolved).
-- Adds first-class status + trigger metadata columns; enforces append-only via trigger + REVOKE.

-- ── Columns (spec-aligned) ───────────────────────────────────────────────────

ALTER TABLE public.lead_history
  ADD COLUMN IF NOT EXISTS previous_status text,
  ADD COLUMN IF NOT EXISTS new_status text,
  ADD COLUMN IF NOT EXISTS trigger_source text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS reason_code varchar(255),
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.lead_history.previous_status IS 'Lead status before change (NULL for non-status events or initial).';
COMMENT ON COLUMN public.lead_history.new_status IS 'Lead status after change; required when change_type = status_change.';
COMMENT ON COLUMN public.lead_history.trigger_source IS 'system | manual (per spec).';
COMMENT ON COLUMN public.lead_history.reason_code IS 'Short reason; mandatory when trigger_source = manual (non-empty).';
COMMENT ON COLUMN public.lead_history.metadata IS 'Extra context (override, alert_id, etc.).';
COMMENT ON COLUMN public.lead_history.created_at IS 'UTC time of change (architectural spec name: timestamp).';
COMMENT ON COLUMN public.lead_history.reason IS 'Legacy free-text / long description; prefer reason_code for new manual entries.';
COMMENT ON COLUMN public.lead_history.ip_address IS 'Client IP; stored as text to allow forwarded-for chains (normalize to a single inet upstream when possible).';

ALTER TABLE public.lead_history DROP CONSTRAINT IF EXISTS lead_history_trigger_source_check;
ALTER TABLE public.lead_history
  ADD CONSTRAINT lead_history_trigger_source_check CHECK (
    trigger_source IN ('system', 'manual')
  );

-- Backfill canonical status fields from JSON (status_change rows)
UPDATE public.lead_history lh
SET
  previous_status = COALESCE(lh.previous_status, lh.old_value->>'status'),
  new_status = COALESCE(
    NULLIF(trim(lh.new_status), ''),
    NULLIF(trim(lh.new_value->>'status'), '')
  )
WHERE lh.change_type = 'status_change';

ALTER TABLE public.lead_history DROP CONSTRAINT IF EXISTS lead_history_status_change_new_status;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.lead_history
    WHERE change_type = 'status_change'
      AND (new_status IS NULL OR length(trim(new_status)) = 0)
  ) THEN
    ALTER TABLE public.lead_history
      ADD CONSTRAINT lead_history_status_change_new_status CHECK (
        change_type <> 'status_change'
        OR (new_status IS NOT NULL AND length(trim(new_status)) > 0)
      );
  END IF;
END $$;

ALTER TABLE public.lead_history DROP CONSTRAINT IF EXISTS lead_history_manual_reason_code;
ALTER TABLE public.lead_history
  ADD CONSTRAINT lead_history_manual_reason_code CHECK (
    trigger_source <> 'manual'
    OR (reason_code IS NOT NULL AND length(trim(reason_code)) > 0)
  );

-- changed_by NOT NULL (spec): backfill then enforce when safe
UPDATE public.lead_history lh
SET changed_by = l.created_by
FROM public.leads l
WHERE lh.lead_id = l.id
  AND lh.changed_by IS NULL
  AND l.created_by IS NOT NULL;

UPDATE public.lead_history
SET changed_by = (SELECT id FROM public.users ORDER BY created_at ASC NULLS LAST LIMIT 1)
WHERE changed_by IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lead_history WHERE changed_by IS NULL) THEN
    ALTER TABLE public.lead_history ALTER COLUMN changed_by SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lead_history WHERE created_at IS NULL) THEN
    ALTER TABLE public.lead_history ALTER COLUMN created_at SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_history_lead_created
  ON public.lead_history (lead_id, created_at DESC);

-- ── Immutable: block UPDATE/DELETE ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.block_lead_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'lead_history is append-only: UPDATE and DELETE are forbidden (immutable audit log).';
END;
$$;

DROP TRIGGER IF EXISTS lead_history_no_update ON public.lead_history;
CREATE TRIGGER lead_history_no_update
  BEFORE UPDATE ON public.lead_history
  FOR EACH ROW
  EXECUTE FUNCTION public.block_lead_history_mutation();

DROP TRIGGER IF EXISTS lead_history_no_delete ON public.lead_history;
CREATE TRIGGER lead_history_no_delete
  BEFORE DELETE ON public.lead_history
  FOR EACH ROW
  EXECUTE FUNCTION public.block_lead_history_mutation();

-- ── Revoke mutation privileges (application roles) ──────────────────────────
-- Table owner / superuser can still maintain; authenticated app users cannot UPDATE/DELETE.

REVOKE UPDATE, DELETE ON public.lead_history FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.lead_history FROM anon;
REVOKE UPDATE, DELETE ON public.lead_history FROM authenticated;
GRANT SELECT, INSERT ON public.lead_history TO authenticated;

-- ── RPC: write full audit row on status change ─────────────────────────────

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
    updated_at = now()
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

GRANT EXECUTE ON FUNCTION public.cmd_process_lead_status_change TO authenticated;
