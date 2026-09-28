-- ============================================================================
-- Fill DEMAND & QUALIFICATION INSIGHTS for agentone's Freshworks leads
-- Call Logs DB only (prznqqynlihqpgixjwkb). Reads call_profiling_answers
-- (loaded by 20260929000000_call_profiling_answers.sql) and writes the lead's
-- cq fields, which is what the lead drawer's DQI section shows.
-- Safe to re-run.
--
-- Freshworks campaign questions -> lead field <- sheet answer (q_no)
--   cq1  Looking at your IT service management today... current challenge?   <- Q1 Pain points
--   cq2  What IT service management (ITSM) solution are you currently using? <- Q2 Current Stack/Vendor
--   cq3  Follow-up: How satisfied are you with your current ITSM setup?       <- Q3 Satisfaction + Intent
--   cq4  If you explore alternative options, what would be most important?   <- (not in sheet, left as is;
--        an earlier version of this script wrote Q3 here, that copy is cleared)
--   cq5  How are you currently approaching AI in your IT operations...?       <- Q4 AI readiness
--   cq6  Follow-up: Where do you see the most value...?                       <- (not in sheet, left as is)
--   cq7  Roughly how many agents are handling service requests in your team? <- Q5 Team size
--   cq8  Timeline                                                             <- Q6 Timeline
-- cq1-cq5 are columns; cq6+ live in leads.extra_cq (jsonb).
-- ============================================================================

with a as (
  select
    lead_id,
    max(answer) filter (where q_no = 1) as q1,
    max(answer) filter (where q_no = 2) as q2,
    max(answer) filter (where q_no = 3) as q3,
    max(answer) filter (where q_no = 4) as q4,
    max(answer) filter (where q_no = 5) as q5,
    max(answer) filter (where q_no = 6) as q6
  from public.call_profiling_answers
  where campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49'
  group by lead_id
)
update public.leads l
set
  cq1 = coalesce(a.q1, l.cq1),
  cq2 = coalesce(a.q2, l.cq2),
  cq3 = coalesce(a.q3, l.cq3),
  -- undo the earlier Q3 -> cq4 copy only (keeps anything else typed into cq4)
  cq4 = case when l.cq4 is not distinct from a.q3 then null else l.cq4 end,
  cq5 = coalesce(a.q4, l.cq5),
  extra_cq = coalesce(l.extra_cq, '{}'::jsonb)
             || jsonb_strip_nulls(jsonb_build_object('cq7', a.q5, 'cq8', a.q6))
from a
where l.id = a.lead_id
  and l.campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49';

-- Verify: expect 20 rows, each with cq1/cq2/cq5 and extra_cq cq7/cq8 filled
select
  coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), name) as lead,
  cq1, cq2, cq3, cq4, cq5,
  extra_cq ->> 'cq7' as team_size,
  extra_cq ->> 'cq8' as timeline
from public.leads
where campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49'
order by lead;
