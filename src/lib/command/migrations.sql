-- ============================================================
-- Campaign Command Center + Compliance System — DB Migration
-- Run this in Supabase SQL editor (or via Supabase MCP)
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS)
-- ============================================================

-- ── 1. Extend leads table ────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS risk_flags       JSONB    DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS consent_status   TEXT     DEFAULT 'pending'
      CHECK (consent_status IN ('pending','verified','missing','disputed')),
  ADD COLUMN IF NOT EXISTS channel          TEXT     DEFAULT 'email'
      CHECK (channel IN ('email','telemarketing')),
  ADD COLUMN IF NOT EXISTS rep_id           UUID     REFERENCES users(id);

-- ── 2. campaign_metrics ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_metrics (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id             UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sponsor_name            VARCHAR(255),
  total_leads_allocated   INTEGER     DEFAULT 0,
  total_campaign_spend    NUMERIC(14,2) DEFAULT 0,
  total_leads_delivered   INTEGER     DEFAULT 0,
  daily_reporting         JSONB       DEFAULT '{}',
  channel_split           JSONB       DEFAULT '{}',
  deficit_leads           INTEGER     DEFAULT 0,
  lead_increment          INTEGER     DEFAULT 0,
  lead_replace            INTEGER     DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_campaign_id
  ON campaign_metrics (campaign_id);

-- ── 3. lead_history (immutable audit log) ────────────────────
CREATE TABLE IF NOT EXISTS lead_history (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  changed_by       UUID        NOT NULL REFERENCES users(id),
  change_type      TEXT        NOT NULL,   -- e.g. 'status_change', 'alert_resolved'
  old_value        JSONB,
  new_value        JSONB,
  reason           TEXT,
  ip_address       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  previous_status  TEXT,
  new_status       TEXT,
  trigger_source   TEXT        NOT NULL DEFAULT 'system'
                     CHECK (trigger_source IN ('system','manual')),
  reason_code      VARCHAR(255),
  metadata         JSONB       NOT NULL DEFAULT '{}',
  CONSTRAINT lead_history_status_change_new_status CHECK (
    change_type <> 'status_change'
    OR (new_status IS NOT NULL AND length(trim(new_status)) > 0)
  ),
  CONSTRAINT lead_history_manual_reason_code CHECK (
    trigger_source <> 'manual'
    OR (reason_code IS NOT NULL AND length(trim(reason_code)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_history_lead_id
  ON lead_history (lead_id);

CREATE OR REPLACE FUNCTION block_lead_history_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'lead_history is append-only: UPDATE and DELETE are forbidden (immutable audit log).';
END;
$$;

DROP TRIGGER IF EXISTS lead_history_no_update ON lead_history;
CREATE TRIGGER lead_history_no_update
  BEFORE UPDATE ON lead_history
  FOR EACH ROW EXECUTE FUNCTION block_lead_history_mutation();

DROP TRIGGER IF EXISTS lead_history_no_delete ON lead_history;
CREATE TRIGGER lead_history_no_delete
  BEFORE DELETE ON lead_history
  FOR EACH ROW EXECUTE FUNCTION block_lead_history_mutation();

REVOKE UPDATE, DELETE ON lead_history FROM PUBLIC;
REVOKE UPDATE, DELETE ON lead_history FROM anon;
REVOKE UPDATE, DELETE ON lead_history FROM authenticated;
GRANT SELECT, INSERT ON lead_history TO authenticated;

-- ── 4. consent_records (immutable) ───────────────────────────
CREATE TABLE IF NOT EXISTS consent_records (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id       UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  consent_given_at  TIMESTAMPTZ,
  consent_method    TEXT,          -- 'verbal', 'digital', 'written'
  ip_address        TEXT,
  recording_url     TEXT,
  consent_text      TEXT,
  sha256_hash       TEXT,          -- SHA-256 of consent payload for tamper detection
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_records_lead_id
  ON consent_records (lead_id);

CREATE OR REPLACE FUNCTION block_consent_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'consent_records is immutable — UPDATE/DELETE are not permitted';
END;
$$;

DROP TRIGGER IF EXISTS consent_no_update ON consent_records;
CREATE TRIGGER consent_no_update
  BEFORE UPDATE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION block_consent_mutation();

DROP TRIGGER IF EXISTS consent_no_delete ON consent_records;
CREATE TRIGGER consent_no_delete
  BEFORE DELETE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION block_consent_mutation();

-- ── 5. alerts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id      UUID        REFERENCES campaigns(id) ON DELETE SET NULL,
  lead_id          UUID        REFERENCES leads(id) ON DELETE SET NULL,
  alert_type       TEXT        NOT NULL,
  severity         TEXT        NOT NULL DEFAULT 'medium'
      CHECK (severity IN ('low','medium','high','critical')),
  title            TEXT        NOT NULL,
  message          TEXT,
  metadata         JSONB       DEFAULT '{}',
  is_resolved      BOOLEAN     DEFAULT FALSE,
  resolved_by      UUID        REFERENCES users(id),
  resolved_at      TIMESTAMPTZ,
  resolution_note  TEXT,
  created_by       UUID        REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_org_unresolved
  ON alerts (organization_id, is_resolved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_campaign_id
  ON alerts (campaign_id);

-- ══════════════════════════════════════════════════════════════
-- MIGRATION v2 — Analytics optimisation + Transactions + Indexes
-- ══════════════════════════════════════════════════════════════

-- ── 6. Add client_id to users (for client_viewer filtering) ──
CREATE TABLE IF NOT EXISTS clients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compatibility: existing deployments may already have `clients` with
-- `company_name` instead of `name`, and `contact_work_email` instead of `email`.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email VARCHAR(255);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'name'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'company_name'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_clients_company_name_compat ON clients(company_name);
  END IF;
END;
$$;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

CREATE INDEX IF NOT EXISTS idx_users_client_id ON users(client_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_client_id ON campaigns(client_id);

-- ── 7. Extend campaign_metrics with aggregate counters ────────
ALTER TABLE campaign_metrics
  ADD COLUMN IF NOT EXISTS sponsor_name        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS total_leads          INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qa_pending_count     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qualified_count      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS registered_count     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attended_count       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disqualified_count   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS no_show_count        INTEGER DEFAULT 0;

-- Unique constraint required for ON CONFLICT upsert in the RPC
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'campaign_metrics_campaign_id_unique'
  ) THEN
    ALTER TABLE campaign_metrics
      ADD CONSTRAINT campaign_metrics_campaign_id_unique UNIQUE (campaign_id);
  END IF;
END;
$$;

-- ── 8. Performance indexes ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_campaign_status
  ON leads (campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_leads_campaign_consent
  ON leads (campaign_id, consent_status);

CREATE INDEX IF NOT EXISTS idx_leads_campaign_created
  ON leads (campaign_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_campaign_resolved
  ON alerts (campaign_id, is_resolved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON leads (campaign_id);
CREATE INDEX IF NOT EXISTS idx_alerts_campaign_id_status ON alerts (campaign_id, is_resolved);

-- ── 8b. Daily campaign metrics history (append-only) ──────────
CREATE TABLE IF NOT EXISTS campaign_metrics_history (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id            UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date                   DATE NOT NULL DEFAULT CURRENT_DATE,
  total_leads_delivered  INTEGER DEFAULT 0,
  channel_split          JSONB DEFAULT '{}',
  deficit_leads          INTEGER DEFAULT 0,
  lead_increment         INTEGER DEFAULT 0,
  lead_replace           INTEGER DEFAULT 0,
  total_campaign_spend   NUMERIC(14,2) DEFAULT 0,
  updated_by             UUID REFERENCES users(id),
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE campaign_metrics_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_history_campaign_date
  ON campaign_metrics_history (campaign_id, date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_history_updated_by
  ON campaign_metrics_history (updated_by);

CREATE INDEX IF NOT EXISTS idx_alerts_lead_type_open
  ON alerts (lead_id, alert_type, is_resolved);

CREATE INDEX IF NOT EXISTS idx_lead_history_lead_created
  ON lead_history (lead_id, created_at DESC);

-- ── 9. Atomic transaction RPC ─────────────────────────────────
-- Called by the TypeScript rules engine to ensure
-- UPDATE lead + INSERT lead_history + UPDATE metrics + INSERT alert
-- all happen inside a single PostgreSQL transaction.
CREATE OR REPLACE FUNCTION cmd_process_lead_status_change(
  p_lead_id          UUID,
  p_new_status       TEXT,
  p_new_consent      TEXT,
  p_changed_by       UUID,
  p_reason           TEXT    DEFAULT NULL,
  p_old_status       TEXT    DEFAULT NULL,
  p_old_consent      TEXT    DEFAULT NULL,
  p_ip_address       TEXT    DEFAULT NULL,
  p_alert_type       TEXT    DEFAULT NULL,
  p_alert_title      TEXT    DEFAULT NULL,
  p_alert_message    TEXT    DEFAULT NULL,
  p_alert_severity   TEXT    DEFAULT 'medium',
  p_alert_metadata   JSONB   DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign_id       UUID;
  v_org_id            UUID;
  v_alert_id          UUID   := NULL;
  v_existing_alert_id UUID   := NULL;
  v_deduped           BOOLEAN := false;
BEGIN
  -- ① Resolve context
  SELECT campaign_id, organization_id
    INTO v_campaign_id, v_org_id
    FROM leads
   WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  -- ② Update lead
  UPDATE leads
     SET status         = p_new_status,
         consent_status = p_new_consent,
         updated_at     = NOW()
   WHERE id = p_lead_id;

  -- ③ Immutable history entry
  INSERT INTO lead_history
    (lead_id, changed_by, change_type, old_value, new_value, reason, ip_address,
     previous_status, new_status, trigger_source, reason_code, metadata)
  VALUES
    (p_lead_id, p_changed_by, 'status_change',
     jsonb_build_object('status', p_old_status, 'consent_status', p_old_consent),
     jsonb_build_object('status', p_new_status, 'consent_status', p_new_consent),
     p_reason, NULLIF(trim(p_ip_address), ''),
     p_old_status, p_new_status, 'system',
     CASE WHEN p_reason IS NOT NULL AND length(trim(p_reason)) > 0 THEN left(trim(p_reason), 255) ELSE NULL END,
     COALESCE(p_alert_metadata, '{}'::jsonb));

  -- ④ Upsert campaign_metrics aggregates atomically
  INSERT INTO campaign_metrics (campaign_id)
  VALUES (v_campaign_id)
  ON CONFLICT (campaign_id) DO NOTHING;

  UPDATE campaign_metrics SET
    total_leads         = (SELECT COUNT(*)           FROM leads WHERE campaign_id = v_campaign_id),
    qa_pending_count    = (SELECT COUNT(*)           FROM leads WHERE campaign_id = v_campaign_id AND status = 'qa_pending'),
    qualified_count     = (SELECT COUNT(*)           FROM leads WHERE campaign_id = v_campaign_id AND status = 'qualified'),
    registered_count    = (SELECT COUNT(*)           FROM leads WHERE campaign_id = v_campaign_id AND status = 'registered'),
    attended_count      = (SELECT COUNT(*)           FROM leads WHERE campaign_id = v_campaign_id AND status = 'attended'),
    disqualified_count  = (SELECT COUNT(*)           FROM leads WHERE campaign_id = v_campaign_id AND status = 'disqualified'),
    no_show_count       = (SELECT COUNT(*)           FROM leads WHERE campaign_id = v_campaign_id AND status = 'no_show'),
    total_leads_delivered = (SELECT COUNT(*)         FROM leads WHERE campaign_id = v_campaign_id AND status IN ('registered','attended')),
    updated_at          = NOW()
  WHERE campaign_id = v_campaign_id;

  -- ⑤ Alert with deduplication
  IF p_alert_type IS NOT NULL THEN
    SELECT id INTO v_existing_alert_id
      FROM alerts
     WHERE alert_type  = p_alert_type
       AND lead_id     = p_lead_id
       AND is_resolved = false
     LIMIT 1;

    IF v_existing_alert_id IS NULL THEN
      INSERT INTO alerts
        (organization_id, campaign_id, lead_id,
         alert_type, severity, title, message, metadata, created_by)
      VALUES
        (v_org_id, v_campaign_id, p_lead_id,
         p_alert_type, p_alert_severity::text, p_alert_title,
         p_alert_message, p_alert_metadata, p_changed_by)
      RETURNING id INTO v_alert_id;
    ELSE
      v_alert_id := v_existing_alert_id;
      v_deduped  := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',     true,
    'alert_id',    v_alert_id,
    'deduped',     v_deduped,
    'campaign_id', v_campaign_id
  );
END;
$$;

-- Grant execute to authenticated users (Supabase)
GRANT EXECUTE ON FUNCTION cmd_process_lead_status_change TO authenticated;

-- ── 10. Command Center RLS extensions ─────────────────────────
-- Existing CRM policies were built for admin/team_leader/agent/sales.
-- Command Center roles need explicit DB-level RLS permissions too.

CREATE OR REPLACE FUNCTION public.is_org_command_role(
  check_user_id uuid DEFAULT auth.uid(),
  role_name text DEFAULT ''
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = check_user_id
      AND lower(replace(r.name, ' ', '_')) = lower(replace(role_name, ' ', '_'))
  );
$$;

-- campaigns: command roles can read within org
DROP POLICY IF EXISTS "campaigns_select_command_roles" ON public.campaigns;
CREATE POLICY "campaigns_select_command_roles"
  ON public.campaigns FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (
      public.is_org_command_role(auth.uid(), 'internal_operator')
      OR public.is_org_command_role(auth.uid(), 'internal_admin')
      OR public.is_org_command_role(auth.uid(), 'client_viewer')
    )
  );

-- campaigns: operator/admin can insert within org
DROP POLICY IF EXISTS "campaigns_insert_command_roles" ON public.campaigns;
CREATE POLICY "campaigns_insert_command_roles"
  ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND (
      public.is_org_command_role(auth.uid(), 'internal_operator')
      OR public.is_org_command_role(auth.uid(), 'internal_admin')
    )
  );

-- campaigns: operator/admin can update within org
DROP POLICY IF EXISTS "campaigns_update_command_roles" ON public.campaigns;
CREATE POLICY "campaigns_update_command_roles"
  ON public.campaigns FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (
      public.is_org_command_role(auth.uid(), 'internal_operator')
      OR public.is_org_command_role(auth.uid(), 'internal_admin')
    )
  )
  WITH CHECK (organization_id = public.get_my_organization_id());

-- leads: command roles can read within org (for /dashboard/leads)
DROP POLICY IF EXISTS "leads_select_command_roles" ON public.leads;
CREATE POLICY "leads_select_command_roles"
  ON public.leads FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (
      public.is_org_command_role(auth.uid(), 'internal_operator')
      OR public.is_org_command_role(auth.uid(), 'internal_admin')
      OR public.is_org_command_role(auth.uid(), 'client_viewer')
    )
  );

-- leads: operator/admin can insert within org (campaign create import)
DROP POLICY IF EXISTS "leads_insert_command_roles" ON public.leads;
CREATE POLICY "leads_insert_command_roles"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND (
      public.is_org_command_role(auth.uid(), 'internal_operator')
      OR public.is_org_command_role(auth.uid(), 'internal_admin')
    )
  );

-- client_viewer must be tied to a client and can only see same-client campaigns
DROP POLICY IF EXISTS "campaigns_select_client_viewer_client_scope" ON public.campaigns;
CREATE POLICY "campaigns_select_client_viewer_client_scope"
  ON public.campaigns FOR SELECT TO authenticated
  USING (
    public.is_org_command_role(auth.uid(), 'client_viewer')
    AND client_id IS NOT NULL
    AND client_id = (
      SELECT u.client_id FROM public.users u WHERE u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "leads_select_client_viewer_client_scope" ON public.leads;
CREATE POLICY "leads_select_client_viewer_client_scope"
  ON public.leads FOR SELECT TO authenticated
  USING (
    public.is_org_command_role(auth.uid(), 'client_viewer')
    AND EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.users u ON u.id = auth.uid()
      WHERE c.id = leads.campaign_id
        AND c.client_id = u.client_id
    )
  );

DROP POLICY IF EXISTS "alerts_select_client_viewer_client_scope" ON public.alerts;
CREATE POLICY "alerts_select_client_viewer_client_scope"
  ON public.alerts FOR SELECT TO authenticated
  USING (
    public.is_org_command_role(auth.uid(), 'client_viewer')
    AND EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.users u ON u.id = auth.uid()
      WHERE c.id = alerts.campaign_id
        AND c.client_id = u.client_id
    )
  );

DROP POLICY IF EXISTS "lead_history_select_client_viewer_client_scope" ON public.lead_history;
CREATE POLICY "lead_history_select_client_viewer_client_scope"
  ON public.lead_history FOR SELECT TO authenticated
  USING (
    public.is_org_command_role(auth.uid(), 'client_viewer')
    AND EXISTS (
      SELECT 1
      FROM public.leads l
      JOIN public.campaigns c ON c.id = l.campaign_id
      JOIN public.users u ON u.id = auth.uid()
      WHERE l.id = lead_history.lead_id
        AND c.client_id = u.client_id
    )
  );

-- campaign_metrics_history: command roles can read by org campaigns
DROP POLICY IF EXISTS "campaign_metrics_history_select_command_roles" ON public.campaign_metrics_history;
CREATE POLICY "campaign_metrics_history_select_command_roles"
  ON public.campaign_metrics_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = campaign_metrics_history.campaign_id
        AND c.organization_id = public.get_my_organization_id()
        AND (
          public.is_org_command_role(auth.uid(), 'internal_operator')
          OR public.is_org_command_role(auth.uid(), 'internal_admin')
          OR public.is_org_command_role(auth.uid(), 'admin')
        )
    )
  );

-- campaign_metrics_history: client_viewer can read own-client campaigns only
DROP POLICY IF EXISTS "campaign_metrics_history_select_client_viewer_scope" ON public.campaign_metrics_history;
CREATE POLICY "campaign_metrics_history_select_client_viewer_scope"
  ON public.campaign_metrics_history FOR SELECT TO authenticated
  USING (
    public.is_org_command_role(auth.uid(), 'client_viewer')
    AND EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.users u ON u.id = auth.uid()
      WHERE c.id = campaign_metrics_history.campaign_id
        AND c.client_id = u.client_id
    )
  );

-- campaign_metrics_history: operator/admin append-only inserts
DROP POLICY IF EXISTS "campaign_metrics_history_insert_command_roles" ON public.campaign_metrics_history;
CREATE POLICY "campaign_metrics_history_insert_command_roles"
  ON public.campaign_metrics_history FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = campaign_metrics_history.campaign_id
        AND c.organization_id = public.get_my_organization_id()
    )
    AND (
      public.is_org_command_role(auth.uid(), 'internal_operator')
      OR public.is_org_command_role(auth.uid(), 'internal_admin')
      OR public.is_org_command_role(auth.uid(), 'admin')
    )
  );

-- ── 10. Seed new roles into the roles table ───────────────────
-- Replace 'YOUR_ORG_ID' with your actual organization UUID,
-- or run this as a loop if you have multiple orgs.
--
-- INSERT INTO roles (name, description, organization_id)
-- SELECT name, description, id AS organization_id
-- FROM (VALUES
--   ('client_viewer',     'Read-only access for external clients'),
--   ('internal_operator', 'Create/edit campaigns, manage leads'),
--   ('internal_admin',    'Full access — DQ override, alert management')
-- ) AS new_roles(name, description)
-- CROSS JOIN organizations
-- WHERE NOT EXISTS (
--   SELECT 1 FROM roles r
--   WHERE r.name = new_roles.name
--     AND r.organization_id = organizations.id
-- );
