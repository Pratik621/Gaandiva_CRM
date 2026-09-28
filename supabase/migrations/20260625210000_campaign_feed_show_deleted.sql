-- Allow deleted posts to be fetched so all users see the tombstone.
-- The deleted_at IS NULL guard is removed from SELECT; the app layer renders
-- deleted posts as "This message has been deleted." for everyone.

DROP POLICY IF EXISTS "campaign_feed_select" ON public.campaign_feed;
CREATE POLICY "campaign_feed_select"
  ON public.campaign_feed FOR SELECT
  USING (
    public.user_can_access_campaign_feed(campaign_id)
  );
