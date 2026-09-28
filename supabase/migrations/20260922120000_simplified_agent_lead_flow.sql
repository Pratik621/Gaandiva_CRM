-- =============================================================================
-- SIMPLIFIED MANAGEMENT MODULE — Agent lead flow (sm_agent role)
-- Adds: campaign assignments, configurable call outcomes, immutable call
-- history, and a richer lead status model. Purely additive on top of the
-- existing Marketing module (simplified_campaigns / simplified_ad_sources /
-- simplified_leads, sm_marketing role) except for the status value rename
-- called out in step 3 below. No policy in this file (or anywhere in the
-- Simplified module) ever mentions team_leader, operations_manager, qa, or
-- mis — isolation stays structural, not filter-based.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. SIMPLIFIED_CAMPAIGN_ASSIGNMENTS (which agents work a campaign)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simplified_campaign_assignments (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  simplified_campaign_id  uuid        NOT NULL REFERENCES public.simplified_campaigns(id) ON DELETE CASCADE,
  agent_id                uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_by             uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  is_active               boolean     NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (simplified_campaign_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_simplified_campaign_assignments_campaign_id ON public.simplified_campaign_assignments(simplified_campaign_id);
CREATE INDEX IF NOT EXISTS idx_simplified_campaign_assignments_agent_id    ON public.simplified_campaign_assignments(agent_id);

-- -----------------------------------------------------------------------------
-- 2. SIMPLIFIED_CALL_OUTCOMES (configurable outcome -> status mapping)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simplified_call_outcomes (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  simplified_campaign_id  uuid        REFERENCES public.simplified_campaigns(id) ON DELETE CASCADE,
  code                    text        NOT NULL,
  label                   text        NOT NULL,
  category                text        NOT NULL CHECK (category IN ('contact_progress', 'unreachable', 'invalid_closed')),
  resulting_status        text        NOT NULL CHECK (resulting_status IN ('new', 'follow_up', 'in_progress', 'closed')),
  requires_callback_at    boolean     NOT NULL DEFAULT false,
  is_terminal             boolean     NOT NULL DEFAULT false,
  sort_order              integer     NOT NULL DEFAULT 0,
  is_active               boolean     NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_simplified_call_outcomes_org_campaign_code
  ON public.simplified_call_outcomes(organization_id, COALESCE(simplified_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

CREATE INDEX IF NOT EXISTS idx_simplified_call_outcomes_organization_id ON public.simplified_call_outcomes(organization_id);
CREATE INDEX IF NOT EXISTS idx_simplified_call_outcomes_campaign_id     ON public.simplified_call_outcomes(simplified_campaign_id);

-- -----------------------------------------------------------------------------
-- 3. SIMPLIFIED_LEADS — additive columns + status vocabulary rename
--    ('callback' -> 'follow_up', 'resolved' -> 'closed', 'new' unchanged,
--    'in_progress' added). This is the one change touching already-shipped
--    Marketing portal code (status Tag/Select/dashboard counters).
-- -----------------------------------------------------------------------------
ALTER TABLE public.simplified_leads
  ADD COLUMN IF NOT EXISTS last_outcome_id    uuid REFERENCES public.simplified_call_outcomes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_action        text,
  ADD COLUMN IF NOT EXISTS last_contacted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS call_count         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS callback_timezone  text DEFAULT 'Asia/Kolkata';

ALTER TABLE public.simplified_leads DROP CONSTRAINT IF EXISTS simplified_leads_status_check;
UPDATE public.simplified_leads SET status = 'follow_up' WHERE status = 'callback';
UPDATE public.simplified_leads SET status = 'closed' WHERE status = 'resolved';
ALTER TABLE public.simplified_leads
  ADD CONSTRAINT simplified_leads_status_check CHECK (status IN ('new', 'follow_up', 'in_progress', 'closed'));

CREATE INDEX IF NOT EXISTS idx_simplified_leads_callback_at ON public.simplified_leads(callback_at);

-- -----------------------------------------------------------------------------
-- 4. SIMPLIFIED_LEAD_CALLS (append-only call/activity history)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simplified_lead_calls (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  simplified_lead_id      uuid        NOT NULL REFERENCES public.simplified_leads(id) ON DELETE CASCADE,
  simplified_campaign_id  uuid        NOT NULL REFERENCES public.simplified_campaigns(id) ON DELETE CASCADE,
  agent_id                uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  called_at               timestamptz NOT NULL DEFAULT now(),
  outcome_id              uuid        REFERENCES public.simplified_call_outcomes(id) ON DELETE SET NULL,
  outcome_code_snapshot   text        NOT NULL,
  outcome_label_snapshot  text        NOT NULL,
  previous_status         text        NOT NULL,
  resulting_status        text        NOT NULL,
  next_action             text,
  callback_at             timestamptz,
  callback_timezone       text,
  notes                   text,
  call_form_response      jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_simplified_lead_calls_lead_id     ON public.simplified_lead_calls(simplified_lead_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_simplified_lead_calls_campaign_id ON public.simplified_lead_calls(simplified_campaign_id);
CREATE INDEX IF NOT EXISTS idx_simplified_lead_calls_agent_id    ON public.simplified_lead_calls(agent_id, called_at DESC);

-- -----------------------------------------------------------------------------
-- HELPERS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_sm_agent(check_user_id uuid DEFAULT auth.uid())
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
      AND LOWER(REPLACE(r.name, ' ', '_')) = 'sm_agent'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_to_simplified_campaign(p_campaign_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.simplified_campaign_assignments
    WHERE simplified_campaign_id = p_campaign_id
      AND agent_id = p_user_id
      AND is_active = true
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS: SIMPLIFIED_CAMPAIGN_ASSIGNMENTS
-- -----------------------------------------------------------------------------
ALTER TABLE public.simplified_campaign_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "simplified_campaign_assignments_select_org"
  ON public.simplified_campaign_assignments FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

CREATE POLICY "simplified_campaign_assignments_select_own_agent"
  ON public.simplified_campaign_assignments FOR SELECT TO authenticated
  USING (agent_id = auth.uid());

CREATE POLICY "simplified_campaign_assignments_insert_org"
  ON public.simplified_campaign_assignments FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

CREATE POLICY "simplified_campaign_assignments_update_org"
  ON public.simplified_campaign_assignments FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

CREATE POLICY "simplified_campaign_assignments_delete_org"
  ON public.simplified_campaign_assignments FOR DELETE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

-- -----------------------------------------------------------------------------
-- RLS: SIMPLIFIED_CALL_OUTCOMES
-- -----------------------------------------------------------------------------
ALTER TABLE public.simplified_call_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "simplified_call_outcomes_select_org"
  ON public.simplified_call_outcomes FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing() OR public.is_org_sm_agent())
  );

CREATE POLICY "simplified_call_outcomes_insert_org"
  ON public.simplified_call_outcomes FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

CREATE POLICY "simplified_call_outcomes_update_org"
  ON public.simplified_call_outcomes FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

CREATE POLICY "simplified_call_outcomes_delete_org"
  ON public.simplified_call_outcomes FOR DELETE TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

-- -----------------------------------------------------------------------------
-- RLS: SIMPLIFIED_LEADS — add sm_agent policies alongside the existing
-- admin/sm_marketing ones (already enabled; these are additive grants).
-- TEMPORARY SCOPE: org-wide for sm_agent (matches sm_marketing) rather than
-- assigned_agent_id-only, per explicit decision to unblock the agent portal
-- while the per-agent assignment chain is worked out. Tighten back to
-- "assigned_agent_id = auth.uid()" once campaign_assignments-based
-- distribution is confirmed working end to end.
-- -----------------------------------------------------------------------------
CREATE POLICY "simplified_leads_select_sm_agent"
  ON public.simplified_leads FOR SELECT TO authenticated
  USING (organization_id = public.get_my_organization_id() AND public.is_org_sm_agent());

CREATE POLICY "simplified_leads_update_sm_agent"
  ON public.simplified_leads FOR UPDATE TO authenticated
  USING (organization_id = public.get_my_organization_id() AND public.is_org_sm_agent());

-- -----------------------------------------------------------------------------
-- RLS: SIMPLIFIED_CAMPAIGNS — sm_agent read access, org-wide (same reasoning)
-- -----------------------------------------------------------------------------
CREATE POLICY "simplified_campaigns_select_sm_agent"
  ON public.simplified_campaigns FOR SELECT TO authenticated
  USING (organization_id = public.get_my_organization_id() AND public.is_org_sm_agent());

-- -----------------------------------------------------------------------------
-- RLS: SIMPLIFIED_LEAD_CALLS — insert/select only, never update/delete
-- (immutability enforced by the absence of those policies, not convention)
-- -----------------------------------------------------------------------------
ALTER TABLE public.simplified_lead_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "simplified_lead_calls_select_admin_marketing"
  ON public.simplified_lead_calls FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_organization_id()
    AND (public.is_org_admin() OR public.is_org_sm_marketing())
  );

CREATE POLICY "simplified_lead_calls_select_own_agent"
  ON public.simplified_lead_calls FOR SELECT TO authenticated
  USING (public.is_org_sm_agent() AND agent_id = auth.uid());

CREATE POLICY "simplified_lead_calls_insert_own_agent"
  ON public.simplified_lead_calls FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND agent_id = auth.uid()
    AND public.is_org_sm_agent()
    AND EXISTS (
      SELECT 1 FROM public.simplified_leads l
      WHERE l.id = simplified_lead_id AND l.assigned_agent_id = auth.uid()
    )
  );

CREATE POLICY "simplified_lead_calls_insert_admin"
  ON public.simplified_lead_calls FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_my_organization_id() AND public.is_org_admin());

-- -----------------------------------------------------------------------------
-- TRIGGER: updated_at for simplified_call_outcomes
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_simplified_call_outcomes_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_simplified_call_outcomes_updated_at ON public.simplified_call_outcomes;
CREATE TRIGGER trg_simplified_call_outcomes_updated_at
  BEFORE UPDATE ON public.simplified_call_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.set_simplified_call_outcomes_updated_at();

-- -----------------------------------------------------------------------------
-- SEED: global default outcomes for every existing organization
-- (simplified_campaign_id NULL = available to all campaigns)
-- -----------------------------------------------------------------------------
INSERT INTO public.simplified_call_outcomes
  (organization_id, simplified_campaign_id, code, label, category, resulting_status, requires_callback_at, is_terminal, sort_order)
SELECT o.id, NULL, d.code, d.label, d.category, d.resulting_status, d.requires_callback_at, d.is_terminal, d.sort_order
FROM public.organizations o
CROSS JOIN (VALUES
  ('interested',              'Interested',               'contact_progress', 'in_progress', false, false, 10),
  ('not_interested',          'Not Interested',            'contact_progress', 'closed',      false, true,  20),
  ('follow_up',               'Follow Up',                 'contact_progress', 'follow_up',   true,  false, 30),
  ('callback',                'Callback',                  'contact_progress', 'follow_up',   true,  false, 40),
  ('send_details',            'Send Details / WhatsApp',   'contact_progress', 'in_progress', false, false, 50),
  ('demo_scheduled',          'Demo Scheduled',            'contact_progress', 'in_progress', true,  false, 60),
  ('demo_completed',          'Demo Completed',            'contact_progress', 'in_progress', false, false, 70),
  ('existing_client',         'Existing Client',           'contact_progress', 'closed',      false, true,  80),
  ('not_answering',           'Not Answering',              'unreachable',      'follow_up',   false, false, 90),
  ('number_busy',             'Number Busy',                'unreachable',      'follow_up',   false, false, 100),
  ('phone_switched_off',      'Phone Switched Off',         'unreachable',      'follow_up',   false, false, 110),
  ('incoming_not_available',  'Incoming Not Available',     'unreachable',      'follow_up',   false, false, 120),
  ('unable_to_connect',       'Unable to Connect',          'unreachable',      'follow_up',   false, false, 130),
  ('invalid_number',          'Invalid Number',             'invalid_closed',   'closed',      false, true,  140),
  ('wrong_number',            'Wrong Number',                'invalid_closed',   'closed',      false, true,  150),
  ('not_in_this_business',    'Not in This Business',       'invalid_closed',   'closed',      false, true,  160),
  ('false_lead',              'False Lead',                  'invalid_closed',   'closed',      false, true,  170),
  ('dnd',                     'DND',                          'invalid_closed',   'closed',      false, true,  180),
  ('not_relevant',            'Not Relevant',                'invalid_closed',   'closed',      false, true,  190)
) AS d(code, label, category, resulting_status, requires_callback_at, is_terminal, sort_order)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- RPC: record_simplified_lead_call — atomically inserts the immutable call
-- row AND updates the lead's current state in one transaction. The client
-- only ever submits an outcome_id; the resulting status is always resolved
-- here, server-side, from simplified_call_outcomes — never trusted from the
-- client. SECURITY DEFINER because it writes across two tables under RLS
-- that only grants row-level INSERT/UPDATE, not this compound operation;
-- authorization is re-checked explicitly inside instead of relying on the
-- caller's own RLS grants.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_simplified_lead_call(
  p_lead_id uuid,
  p_outcome_id uuid,
  p_notes text DEFAULT NULL,
  p_callback_at timestamptz DEFAULT NULL,
  p_callback_timezone text DEFAULT 'Asia/Kolkata',
  p_call_form_response jsonb DEFAULT NULL,
  p_next_action text DEFAULT NULL
)
RETURNS public.simplified_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lead public.simplified_leads;
  v_outcome public.simplified_call_outcomes;
  v_caller uuid := auth.uid();
BEGIN
  SELECT * INTO v_lead FROM public.simplified_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  -- TEMPORARY SCOPE: any sm_agent in the lead's org may record a call, not
  -- just its assigned_agent_id — matches the org-wide RLS scope above.
  IF NOT (
    public.is_org_admin(v_caller)
    OR (public.is_org_sm_agent(v_caller) AND v_lead.organization_id = (SELECT organization_id FROM public.users WHERE id = v_caller))
  ) THEN
    RAISE EXCEPTION 'Not authorized to record a call for this lead';
  END IF;

  SELECT * INTO v_outcome FROM public.simplified_call_outcomes
  WHERE id = p_outcome_id
    AND organization_id = v_lead.organization_id
    AND (simplified_campaign_id IS NULL OR simplified_campaign_id = v_lead.simplified_campaign_id)
    AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or inactive outcome for this lead''s campaign';
  END IF;

  INSERT INTO public.simplified_lead_calls (
    organization_id, simplified_lead_id, simplified_campaign_id, agent_id, outcome_id,
    outcome_code_snapshot, outcome_label_snapshot, previous_status, resulting_status,
    next_action, callback_at, callback_timezone, notes, call_form_response
  ) VALUES (
    v_lead.organization_id, v_lead.id, v_lead.simplified_campaign_id, v_caller, v_outcome.id,
    v_outcome.code, v_outcome.label, v_lead.status, v_outcome.resulting_status,
    p_next_action, p_callback_at, p_callback_timezone, p_notes, p_call_form_response
  );

  UPDATE public.simplified_leads SET
    status = v_outcome.resulting_status,
    last_outcome_id = v_outcome.id,
    next_action = p_next_action,
    callback_at = p_callback_at,
    callback_timezone = p_callback_timezone,
    last_contacted_at = now(),
    call_count = call_count + 1,
    call_form_response = COALESCE(p_call_form_response, call_form_response),
    resolved_at = CASE WHEN v_outcome.resulting_status = 'closed' THEN now() ELSE resolved_at END
  WHERE id = p_lead_id
  RETURNING * INTO v_lead;

  RETURN v_lead;
END;
$$;
