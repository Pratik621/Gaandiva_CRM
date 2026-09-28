-- Dynamic campaign custom questions (CQ1+) for agent lead entry.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS campaign_questions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.campaigns.campaign_questions IS
  'Ordered custom questions for agent lead entry. Array of { key, label } e.g. cq1..cq5 and cq6+.';
