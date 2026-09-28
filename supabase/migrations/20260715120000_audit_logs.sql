-- ============================================================================
-- Audit Logs — business activity trail (Zoho/Salesforce style).
-- Security events (logins, MFA, devices, IP blocks) stay in auth_events /
-- login_logs; the admin UI merges both. Idempotent: safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role       text,
  category         text NOT NULL CHECK (category IN
    ('auth','leads','campaigns','users','permissions','exports','clients','announcements','lead_finder','system')),
  event_type       text NOT NULL,          -- e.g. 'lead_exported', 'user_created'
  target_type      text,                    -- e.g. 'lead', 'campaign', 'user'
  target_id        text,
  target_label     text,                    -- human-readable: lead_id, campaign name, email
  description      text NOT NULL,           -- one-line summary shown in the table
  ip               text,
  user_agent       text,
  metadata         jsonb,                   -- before/after, counts, filters
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_org_created_idx
  ON public.audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_org_category_created_idx
  ON public.audit_logs (organization_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_org_actor_created_idx
  ON public.audit_logs (organization_id, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_org_event_created_idx
  ON public.audit_logs (organization_id, event_type, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin-only read; writes only via the service role (fire-and-forget helper).
DROP POLICY IF EXISTS audit_logs_select_admin ON public.audit_logs;
CREATE POLICY audit_logs_select_admin
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.get_my_organization_id())
    AND (SELECT public.is_org_admin())
  );

COMMENT ON TABLE public.audit_logs IS
  'Business activity audit trail (exports, user/role changes, lead/campaign changes). Security events live in auth_events.';
