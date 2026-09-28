-- Drop old stage check constraint (may be named differently across environments)
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_stage_check;
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_stage_fkey;

-- Re-add check constraint with updated stage values
ALTER TABLE public.deals
  ADD CONSTRAINT deals_stage_check CHECK (
    stage IN (
      'introductory_meeting',
      'campaign_assessment',
      'strategy_proposal',
      'strategy_presentation',
      'objection_handling',
      'finalizing_terms',
      'closed_won',
      'closed_lost'
    )
  );

-- Migrate any existing rows that still use old stage values
UPDATE public.deals SET stage = 'introductory_meeting' WHERE stage IN ('qualification', 'discovery');
UPDATE public.deals SET stage = 'strategy_proposal'    WHERE stage = 'proposal';
UPDATE public.deals SET stage = 'objection_handling'   WHERE stage = 'negotiation';
-- closed_won and closed_lost remain the same

-- Add new columns
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS pipeline    text NOT NULL DEFAULT 'Client Acquisition pipeline',
  ADD COLUMN IF NOT EXISTS deal_type   text,
  ADD COLUMN IF NOT EXISTS priority    text,
  ADD COLUMN IF NOT EXISTS line_items  jsonb;

-- Check constraint for priority
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_priority_check;
ALTER TABLE public.deals
  ADD CONSTRAINT deals_priority_check CHECK (
    priority IS NULL OR priority IN ('low', 'medium', 'high')
  );
