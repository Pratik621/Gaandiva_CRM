-- Rename user-facing label for campaign_questions (column key unchanged).
COMMENT ON COLUMN public.campaigns.campaign_questions IS
  'Demand & Qualification Insights — ordered questions for agent lead entry. Array of { key, label } e.g. cq1..cq5 and cq6+.';
