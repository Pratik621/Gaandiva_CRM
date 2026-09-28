-- Migration: Campaign Feed Lead References
-- Adds a lead_refs JSONB array to campaign_feed so posts can reference
-- one or more leads for bulk lead discussion (like Jira issue links).
-- Additive + idempotent — safe to run on live production.

ALTER TABLE campaign_feed
ADD COLUMN IF NOT EXISTS lead_refs JSONB NOT NULL DEFAULT '[]'::jsonb;

-- GIN index lets us query which posts reference a given lead UUID
CREATE INDEX IF NOT EXISTS idx_campaign_feed_lead_refs
  ON campaign_feed USING GIN (lead_refs jsonb_path_ops);

-- Comment for schema documentation
COMMENT ON COLUMN campaign_feed.lead_refs IS
  'Array of lead snapshots {id, name, company_name, email, phone, status} attached to this post.';
