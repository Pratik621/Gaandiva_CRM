-- Per-user read cursor for campaign feed unread badges

CREATE TABLE IF NOT EXISTS public.campaign_feed_read_state (
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id     uuid        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS campaign_feed_read_state_campaign_idx
  ON public.campaign_feed_read_state (campaign_id);

ALTER TABLE public.campaign_feed_read_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_feed_read_state_select" ON public.campaign_feed_read_state;
CREATE POLICY "campaign_feed_read_state_select"
  ON public.campaign_feed_read_state FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    AND organization_id = (SELECT public.get_my_organization_id())
  );

DROP POLICY IF EXISTS "campaign_feed_read_state_insert" ON public.campaign_feed_read_state;
CREATE POLICY "campaign_feed_read_state_insert"
  ON public.campaign_feed_read_state FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND organization_id = (SELECT public.get_my_organization_id())
  );

DROP POLICY IF EXISTS "campaign_feed_read_state_update" ON public.campaign_feed_read_state;
CREATE POLICY "campaign_feed_read_state_update"
  ON public.campaign_feed_read_state FOR UPDATE
  USING (
    user_id = (SELECT auth.uid())
    AND organization_id = (SELECT public.get_my_organization_id())
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND organization_id = (SELECT public.get_my_organization_id())
  );
