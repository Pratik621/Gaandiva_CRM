-- ============================================================================
-- Activate / deactivate leads (Call Logs DB only, prznqqynlihqpgixjwkb).
-- Only ACTIVE leads appear in the agent campaign Leads table; deactivated leads
-- are managed on /agent/campaigns/<id>/lead-activation. Existing and new leads
-- start active. Safe to re-run.
-- ============================================================================

alter table public.leads add column if not exists is_active boolean not null default true;

create index if not exists leads_campaign_agent_active_idx
  on public.leads (campaign_id, assigned_agent_id, is_active, created_at desc);

-- Verify
select is_active, count(*) from public.leads group by is_active;
