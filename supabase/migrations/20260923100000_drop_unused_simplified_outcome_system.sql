-- =============================================================================
-- CLEANUP: remove the outcome-history and campaign-assignment system that
-- was built, then made unreachable by later product decisions:
--   - sm_agent visibility became org-wide (not assignment-gated), so
--     simplified_campaign_assignments has had nothing writing to it since
--     the "Manage Agents" UI was removed.
--   - The sm_agent lead drawer's Call Outcome flow was replaced with a
--     direct Status + Notes update, so nothing writes to
--     simplified_call_outcomes or calls record_simplified_lead_call()
--     anymore.
-- simplified_lead_calls is NOT dropped — it's still read (Call History is
-- shown read-only in the drawer) even though nothing writes new rows to it.
-- =============================================================================

-- Campaign-assignment system
DROP POLICY IF EXISTS "simplified_campaigns_select_assigned_agent" ON public.simplified_campaigns;
DROP FUNCTION IF EXISTS public.is_assigned_to_simplified_campaign(uuid, uuid);
DROP TABLE IF EXISTS public.simplified_campaign_assignments;

-- Outcome-history system
DROP FUNCTION IF EXISTS public.record_simplified_lead_call(uuid, uuid, text, timestamptz, text, jsonb, text);
ALTER TABLE public.simplified_leads DROP COLUMN IF EXISTS last_outcome_id;
DROP TABLE IF EXISTS public.simplified_call_outcomes;
