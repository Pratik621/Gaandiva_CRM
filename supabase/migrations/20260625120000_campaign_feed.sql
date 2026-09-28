-- Campaign collaboration feed (OM, Sales Manager, Client Viewer)
-- Zero-downtime: additive tables + RLS; code falls back if tables missing.

-- ── Access helper ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_can_access_campaign_feed(p_campaign_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campaigns c
    WHERE c.id = p_campaign_id
      AND c.organization_id = (SELECT public.get_my_organization_id())
      AND (
        public.is_org_admin((SELECT auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id = (SELECT auth.uid())
            AND LOWER(REPLACE(r.name, ' ', '_')) IN (
              'operations_manager',
              'sales_manager',
              'internal_operator',
              'internal_admin'
            )
        )
        OR (
          EXISTS (
            SELECT 1
            FROM public.user_roles ur
            JOIN public.roles r ON r.id = ur.role_id
            WHERE ur.user_id = (SELECT auth.uid())
              AND LOWER(REPLACE(r.name, ' ', '_')) = 'client_viewer'
          )
          AND EXISTS (
            SELECT 1
            FROM public.users u
            WHERE u.id = (SELECT auth.uid())
              AND u.client_id IS NOT NULL
              AND u.client_id = c.client_id
          )
        )
      )
  );
$$;

-- ── campaign_feed ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_feed (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id     uuid        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_type       text        NOT NULL DEFAULT 'text'
    CHECK (post_type IN ('text', 'announcement', 'question', 'update', 'file')),
  content         text        NOT NULL DEFAULT '',
  attachments     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  mentions        uuid[]      NOT NULL DEFAULT '{}'::uuid[],
  is_pinned       boolean     NOT NULL DEFAULT false,
  pinned_at       timestamptz,
  pinned_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_at       timestamptz,
  edited_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at      timestamptz,
  deleted_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_feed_campaign_created_idx
  ON public.campaign_feed (campaign_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS campaign_feed_campaign_pinned_idx
  ON public.campaign_feed (campaign_id, is_pinned DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS campaign_feed_org_idx
  ON public.campaign_feed (organization_id);

-- ── campaign_feed_replies ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_feed_replies (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id         uuid        NOT NULL REFERENCES public.campaign_feed(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content         text        NOT NULL DEFAULT '',
  mentions        uuid[]      NOT NULL DEFAULT '{}'::uuid[],
  edited_at       timestamptz,
  edited_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at      timestamptz,
  deleted_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_feed_replies_post_created_idx
  ON public.campaign_feed_replies (post_id, created_at ASC)
  WHERE deleted_at IS NULL;

-- ── campaign_feed_reactions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_feed_reactions (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id         uuid        REFERENCES public.campaign_feed(id) ON DELETE CASCADE,
  reply_id        uuid        REFERENCES public.campaign_feed_replies(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji           text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_feed_reactions_target_check
    CHECK (post_id IS NOT NULL OR reply_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_feed_reactions_post_user_emoji_idx
  ON public.campaign_feed_reactions (post_id, user_id, emoji)
  WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS campaign_feed_reactions_reply_user_emoji_idx
  ON public.campaign_feed_reactions (reply_id, user_id, emoji)
  WHERE reply_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS campaign_feed_reactions_post_idx
  ON public.campaign_feed_reactions (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS campaign_feed_reactions_reply_idx
  ON public.campaign_feed_reactions (reply_id)
  WHERE reply_id IS NOT NULL;

-- ── campaign_feed_activity_log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_feed_activity_log (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id     uuid        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  feed_post_id    uuid        REFERENCES public.campaign_feed(id) ON DELETE SET NULL,
  feed_reply_id   uuid        REFERENCES public.campaign_feed_replies(id) ON DELETE SET NULL,
  action          text        NOT NULL
    CHECK (action IN ('created', 'edited', 'deleted', 'pinned', 'unpinned', 'reacted', 'replied')),
  actor_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_feed_activity_log_campaign_idx
  ON public.campaign_feed_activity_log (campaign_id, created_at DESC);

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campaign_feed_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_feed_updated_at ON public.campaign_feed;
CREATE TRIGGER campaign_feed_updated_at
  BEFORE UPDATE ON public.campaign_feed
  FOR EACH ROW EXECUTE FUNCTION public.campaign_feed_set_updated_at();

DROP TRIGGER IF EXISTS campaign_feed_replies_updated_at ON public.campaign_feed_replies;
CREATE TRIGGER campaign_feed_replies_updated_at
  BEFORE UPDATE ON public.campaign_feed_replies
  FOR EACH ROW EXECUTE FUNCTION public.campaign_feed_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.campaign_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_feed_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_feed_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_feed_activity_log ENABLE ROW LEVEL SECURITY;

-- campaign_feed
DROP POLICY IF EXISTS "campaign_feed_select" ON public.campaign_feed;
CREATE POLICY "campaign_feed_select"
  ON public.campaign_feed FOR SELECT
  USING (
    deleted_at IS NULL
    AND public.user_can_access_campaign_feed(campaign_id)
  );

DROP POLICY IF EXISTS "campaign_feed_insert" ON public.campaign_feed;
CREATE POLICY "campaign_feed_insert"
  ON public.campaign_feed FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND organization_id = (SELECT public.get_my_organization_id())
    AND public.user_can_access_campaign_feed(campaign_id)
  );

DROP POLICY IF EXISTS "campaign_feed_update" ON public.campaign_feed;
CREATE POLICY "campaign_feed_update"
  ON public.campaign_feed FOR UPDATE
  USING (public.user_can_access_campaign_feed(campaign_id))
  WITH CHECK (public.user_can_access_campaign_feed(campaign_id));

-- campaign_feed_replies
DROP POLICY IF EXISTS "campaign_feed_replies_select" ON public.campaign_feed_replies;
CREATE POLICY "campaign_feed_replies_select"
  ON public.campaign_feed_replies FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.campaign_feed p
      WHERE p.id = post_id
        AND p.deleted_at IS NULL
        AND public.user_can_access_campaign_feed(p.campaign_id)
    )
  );

DROP POLICY IF EXISTS "campaign_feed_replies_insert" ON public.campaign_feed_replies;
CREATE POLICY "campaign_feed_replies_insert"
  ON public.campaign_feed_replies FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND organization_id = (SELECT public.get_my_organization_id())
    AND EXISTS (
      SELECT 1 FROM public.campaign_feed p
      WHERE p.id = post_id
        AND p.deleted_at IS NULL
        AND public.user_can_access_campaign_feed(p.campaign_id)
    )
  );

DROP POLICY IF EXISTS "campaign_feed_replies_update" ON public.campaign_feed_replies;
CREATE POLICY "campaign_feed_replies_update"
  ON public.campaign_feed_replies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_feed p
      WHERE p.id = post_id
        AND public.user_can_access_campaign_feed(p.campaign_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaign_feed p
      WHERE p.id = post_id
        AND public.user_can_access_campaign_feed(p.campaign_id)
    )
  );

-- campaign_feed_reactions
DROP POLICY IF EXISTS "campaign_feed_reactions_select" ON public.campaign_feed_reactions;
CREATE POLICY "campaign_feed_reactions_select"
  ON public.campaign_feed_reactions FOR SELECT
  USING (
    organization_id = (SELECT public.get_my_organization_id())
    AND (
      (post_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.campaign_feed p
        WHERE p.id = post_id AND public.user_can_access_campaign_feed(p.campaign_id)
      ))
      OR (reply_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.campaign_feed_replies r
        JOIN public.campaign_feed p ON p.id = r.post_id
        WHERE r.id = reply_id AND public.user_can_access_campaign_feed(p.campaign_id)
      ))
    )
  );

DROP POLICY IF EXISTS "campaign_feed_reactions_insert" ON public.campaign_feed_reactions;
CREATE POLICY "campaign_feed_reactions_insert"
  ON public.campaign_feed_reactions FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND organization_id = (SELECT public.get_my_organization_id())
    AND (
      (post_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.campaign_feed p
        WHERE p.id = post_id AND public.user_can_access_campaign_feed(p.campaign_id)
      ))
      OR (reply_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.campaign_feed_replies r
        JOIN public.campaign_feed p ON p.id = r.post_id
        WHERE r.id = reply_id AND public.user_can_access_campaign_feed(p.campaign_id)
      ))
    )
  );

DROP POLICY IF EXISTS "campaign_feed_reactions_delete" ON public.campaign_feed_reactions;
CREATE POLICY "campaign_feed_reactions_delete"
  ON public.campaign_feed_reactions FOR DELETE
  USING (
    user_id = (SELECT auth.uid())
    AND organization_id = (SELECT public.get_my_organization_id())
  );

-- activity log (read-only for feed members)
DROP POLICY IF EXISTS "campaign_feed_activity_log_select" ON public.campaign_feed_activity_log;
CREATE POLICY "campaign_feed_activity_log_select"
  ON public.campaign_feed_activity_log FOR SELECT
  USING (public.user_can_access_campaign_feed(campaign_id));

DROP POLICY IF EXISTS "campaign_feed_activity_log_insert" ON public.campaign_feed_activity_log;
CREATE POLICY "campaign_feed_activity_log_insert"
  ON public.campaign_feed_activity_log FOR INSERT
  WITH CHECK (
    actor_id = (SELECT auth.uid())
    AND organization_id = (SELECT public.get_my_organization_id())
    AND public.user_can_access_campaign_feed(campaign_id)
  );

-- ── Realtime ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_feed;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_feed_replies;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_feed_reactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Storage bucket for feed attachments ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campaign-feed-attachments',
  'campaign-feed-attachments',
  false,
  10485760,
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "campaign_feed_attachments_select" ON storage.objects;
CREATE POLICY "campaign_feed_attachments_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'campaign-feed-attachments'
    AND (storage.foldername(name))[1] = (SELECT public.get_my_organization_id()::text)
  );

DROP POLICY IF EXISTS "campaign_feed_attachments_insert" ON storage.objects;
CREATE POLICY "campaign_feed_attachments_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'campaign-feed-attachments'
    AND (storage.foldername(name))[1] = (SELECT public.get_my_organization_id()::text)
  );
