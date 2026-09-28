-- ============================================================================
-- Role-Based Announcements Module
-- Notes / Warnings / Alerts / Polls targeted at roles, campaign/team groups,
-- or individuals. Permission matrix is data-driven; audience is resolved
-- server-side at creation time and materialized into announcement_recipients.
-- Idempotent: safe to re-run.
-- ============================================================================

-- ── 1. Core tables ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.announcements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type             text NOT NULL CHECK (type IN ('note','warning','alert','poll')),
  title            text NOT NULL,
  message          text NOT NULL DEFAULT '',
  created_by       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_role  text NOT NULL,
  -- Poll-only fields
  is_anonymous     boolean NOT NULL DEFAULT false,
  closes_at        timestamptz,
  -- Soft delete (management UI is phase 2; column is free now)
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_org_created_idx
  ON public.announcements (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS announcements_creator_idx
  ON public.announcements (created_by, created_at DESC)
  WHERE deleted_at IS NULL;

-- Targeting intent (audit/display). The resolved audience lives in
-- announcement_recipients; these rows record what the sender selected.
CREATE TABLE IF NOT EXISTS public.announcement_targets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id  uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target_type      text NOT NULL CHECK (target_type IN ('role','group','user')),
  target_role      text,
  campaign_id      uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT announcement_targets_shape CHECK (
    (target_type = 'role'  AND target_role IS NOT NULL AND user_id IS NULL)
    OR (target_type = 'group' AND target_role IS NOT NULL AND user_id IS NULL)
    OR (target_type = 'user'  AND user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS announcement_targets_announcement_idx
  ON public.announcement_targets (announcement_id);

-- Materialized per-user fan-out + read / acknowledgment / dismissal state.
CREATE TABLE IF NOT EXISTS public.announcement_recipients (
  announcement_id  uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  read_at          timestamptz,
  acknowledged_at  timestamptz,
  dismissed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS announcement_recipients_user_created_idx
  ON public.announcement_recipients (user_id, created_at DESC);

-- Pending-alert / pending-poll lookup (banner + counts) hits this partial index.
CREATE INDEX IF NOT EXISTS announcement_recipients_user_pending_idx
  ON public.announcement_recipients (user_id)
  WHERE acknowledged_at IS NULL AND dismissed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.poll_options (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id  uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  option_text      text NOT NULL,
  sort_order       int  NOT NULL DEFAULT 0,
  -- Enables the composite FK from poll_votes (option must belong to the poll).
  UNIQUE (id, announcement_id)
);

CREATE INDEX IF NOT EXISTS poll_options_announcement_idx
  ON public.poll_options (announcement_id, sort_order);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id  uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  poll_option_id   uuid NOT NULL,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  voted_at         timestamptz NOT NULL DEFAULT now(),
  -- One vote per user per poll, enforced at the DB level.
  UNIQUE (announcement_id, user_id),
  -- The chosen option must belong to the same poll.
  FOREIGN KEY (poll_option_id, announcement_id)
    REFERENCES public.poll_options (id, announcement_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS poll_votes_option_idx
  ON public.poll_votes (poll_option_id);

-- ── 2. Permission matrix (data-driven RBAC) ─────────────────────────────────
-- organization_id NULL = global default row; per-org rows override the
-- defaults for that sender_role. Roles are normalized slugs.
-- scope: 'org' = whole org, 'team' = sender's own team only (TL),
--        'audited_agents' = agents whose leads the sender QA-audited.

CREATE TABLE IF NOT EXISTS public.announcement_role_permissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  sender_role      text NOT NULL,
  target_role      text NOT NULL,
  allowed_types    text[] NOT NULL DEFAULT '{}'::text[],
  scope            text NOT NULL DEFAULT 'org' CHECK (scope IN ('org','team','audited_agents')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS announcement_role_permissions_global_uniq
  ON public.announcement_role_permissions (sender_role, target_role)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS announcement_role_permissions_org_uniq
  ON public.announcement_role_permissions (organization_id, sender_role, target_role)
  WHERE organization_id IS NOT NULL;

-- Seed global default matrix. Partial unique indexes rule out ON CONFLICT,
-- so idempotency is via WHERE NOT EXISTS.
INSERT INTO public.announcement_role_permissions
  (organization_id, sender_role, target_role, allowed_types, scope)
SELECT NULL, v.sender_role, v.target_role, v.allowed_types, v.scope
FROM (VALUES
  -- admin: everything, everyone below
  ('admin', 'team_leader',        ARRAY['note','warning','alert','poll'], 'org'),
  ('admin', 'agent',              ARRAY['note','warning','alert','poll'], 'org'),
  ('admin', 'qa',                 ARRAY['note','warning','alert','poll'], 'org'),
  ('admin', 'mis',                ARRAY['note','warning','alert','poll'], 'org'),
  ('admin', 'sales',              ARRAY['note','warning','alert','poll'], 'org'),
  ('admin', 'sales_manager',      ARRAY['note','warning','alert','poll'], 'org'),
  ('admin', 'operations_manager', ARRAY['note','warning','alert','poll'], 'org'),
  -- sales & sales_manager: full powers over the operational hierarchy
  ('sales', 'operations_manager', ARRAY['note','warning','alert','poll'], 'org'),
  ('sales', 'team_leader',        ARRAY['note','warning','alert','poll'], 'org'),
  ('sales', 'agent',              ARRAY['note','warning','alert','poll'], 'org'),
  ('sales', 'qa',                 ARRAY['note','warning','alert','poll'], 'org'),
  ('sales', 'mis',                ARRAY['note','warning','alert','poll'], 'org'),
  ('sales_manager', 'operations_manager', ARRAY['note','warning','alert','poll'], 'org'),
  ('sales_manager', 'team_leader',        ARRAY['note','warning','alert','poll'], 'org'),
  ('sales_manager', 'agent',              ARRAY['note','warning','alert','poll'], 'org'),
  ('sales_manager', 'qa',                 ARRAY['note','warning','alert','poll'], 'org'),
  ('sales_manager', 'mis',                ARRAY['note','warning','alert','poll'], 'org'),
  -- operations manager
  ('operations_manager', 'team_leader', ARRAY['note','warning','alert','poll'], 'org'),
  ('operations_manager', 'agent',       ARRAY['note','warning','alert','poll'], 'org'),
  ('operations_manager', 'qa',          ARRAY['note','warning','alert','poll'], 'org'),
  ('operations_manager', 'mis',         ARRAY['note','warning','alert','poll'], 'org'),
  -- team leader: own team only, no alerts
  ('team_leader', 'agent', ARRAY['note','warning','poll'], 'team'),
  -- qa: notes to agents whose leads they audited
  ('qa', 'agent', ARRAY['note'], 'audited_agents')
) AS v(sender_role, target_role, allowed_types, scope)
WHERE NOT EXISTS (
  SELECT 1 FROM public.announcement_role_permissions p
  WHERE p.organization_id IS NULL
    AND p.sender_role = v.sender_role
    AND p.target_role = v.target_role
);

-- ── 3. Row Level Security ───────────────────────────────────────────────────
-- Creation / fan-out / stats aggregation happen via the service-role client
-- after server-side matrix validation (the matrix + audience rules cannot be
-- expressed in RLS). RLS below covers direct reads and the user's own
-- read/ack/dismiss/vote writes.

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_role_permissions ENABLE ROW LEVEL SECURITY;

-- Cycle-breaker helpers: announcements ↔ announcement_recipients policies
-- reference each other, which Postgres rejects as infinite recursion when
-- expressed with plain EXISTS. SECURITY DEFINER lookups bypass RLS re-entry.
CREATE OR REPLACE FUNCTION public.is_announcement_recipient(p_announcement_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.announcement_recipients r
    WHERE r.announcement_id = p_announcement_id AND r.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_announcement_creator(p_announcement_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.announcements a
    WHERE a.id = p_announcement_id AND a.created_by = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_announcement_recipient(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_announcement_creator(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_announcement_recipient(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_announcement_creator(uuid, uuid) TO authenticated;

-- announcements: recipients, the creator, and org admins can read.
DROP POLICY IF EXISTS announcements_select ON public.announcements;
CREATE POLICY announcements_select
  ON public.announcements FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND organization_id = (SELECT public.get_my_organization_id())
    AND (
      created_by = (SELECT auth.uid())
      OR (SELECT public.is_org_admin())
      OR public.is_announcement_recipient(id)
    )
  );

-- announcement_targets: creator of the parent + org admins.
DROP POLICY IF EXISTS announcement_targets_select ON public.announcement_targets;
CREATE POLICY announcement_targets_select
  ON public.announcement_targets FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.get_my_organization_id())
    AND ((SELECT public.is_org_admin()) OR public.is_announcement_creator(announcement_id))
  );

-- announcement_recipients: own row, or parent creator / org admin (stats).
DROP POLICY IF EXISTS announcement_recipients_select ON public.announcement_recipients;
CREATE POLICY announcement_recipients_select
  ON public.announcement_recipients FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.get_my_organization_id())
    AND (
      user_id = (SELECT auth.uid())
      OR (SELECT public.is_org_admin())
      OR public.is_announcement_creator(announcement_id)
    )
  );

-- Users stamp their own read/ack/dismiss timestamps.
DROP POLICY IF EXISTS announcement_recipients_update_own ON public.announcement_recipients;
CREATE POLICY announcement_recipients_update_own
  ON public.announcement_recipients FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND organization_id = (SELECT public.get_my_organization_id())
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND organization_id = (SELECT public.get_my_organization_id())
  );

-- poll_options: visible when the parent announcement is visible.
DROP POLICY IF EXISTS poll_options_select ON public.poll_options;
CREATE POLICY poll_options_select
  ON public.poll_options FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.get_my_organization_id())
    AND (
      public.is_announcement_recipient(announcement_id)
      OR public.is_announcement_creator(announcement_id)
      OR (SELECT public.is_org_admin())
    )
  );

-- poll_votes INSERT: recipient of an OPEN poll, voting as themselves.
DROP POLICY IF EXISTS poll_votes_insert ON public.poll_votes;
CREATE POLICY poll_votes_insert
  ON public.poll_votes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND organization_id = (SELECT public.get_my_organization_id())
    AND EXISTS (
      SELECT 1 FROM public.announcement_recipients r
      WHERE r.announcement_id = poll_votes.announcement_id
        AND r.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.announcements a
      WHERE a.id = poll_votes.announcement_id
        AND a.type = 'poll'
        AND a.deleted_at IS NULL
        AND (a.closes_at IS NULL OR a.closes_at > now())
    )
  );

-- poll_votes SELECT: own vote always; creator/admin only for NAMED polls.
-- (Anonymous poll aggregates are served by the API as counts only.)
DROP POLICY IF EXISTS poll_votes_select ON public.poll_votes;
CREATE POLICY poll_votes_select
  ON public.poll_votes FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.get_my_organization_id())
    AND (
      user_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.announcements a
        WHERE a.id = poll_votes.announcement_id
          AND a.is_anonymous = false
          AND (a.created_by = (SELECT auth.uid()) OR (SELECT public.is_org_admin()))
      )
    )
  );

-- Permission matrix is readable by any authenticated org member
-- (drives the Create UI); global default rows are visible to everyone.
DROP POLICY IF EXISTS announcement_role_permissions_select ON public.announcement_role_permissions;
CREATE POLICY announcement_role_permissions_select
  ON public.announcement_role_permissions FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = (SELECT public.get_my_organization_id())
  );

-- ── 4. notifications.reference_type CHECK: allow 'announcement' ─────────────
-- Prod schema has drifted, so discover the constraint name instead of
-- assuming it. NOT VALID + VALIDATE keeps the swap lock-friendly.
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%reference_type%';

  IF cname IS NOT NULL AND cname <> 'notifications_reference_type_check_v2' THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', cname);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND conname = 'notifications_reference_type_check_v2'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_reference_type_check_v2
      CHECK (
        reference_type IS NULL
        OR reference_type IN ('campaign','lead','task','deal','announcement')
      ) NOT VALID;
    ALTER TABLE public.notifications
      VALIDATE CONSTRAINT notifications_reference_type_check_v2;
  END IF;
END $$;

COMMENT ON TABLE public.announcements IS
  'Role-based announcements (note/warning/alert/poll); audience materialized in announcement_recipients.';
COMMENT ON TABLE public.announcement_role_permissions IS
  'Data-driven sender→target permission matrix; NULL organization_id rows are global defaults.';
