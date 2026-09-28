-- ============================================================================
-- Tele-verification profiling Q&A -> Call Logs DB (prznqqynlihqpgixjwkb)
-- Source: "pratik answers.xlsx" (Freshworks campaign, agentone@gmail.com leads).
-- Run ONLY in the Call Logs project's SQL Editor. Safe to re-run: rows from a
-- previous run of this script (source = 'sheet_import') are replaced.
--
-- Tables:
--   call_profiling_questions : the 6 questions, once per campaign
--   call_profiling_answers   : one row per lead x question, linked to that
--                              lead's Scored call in call_logs
-- The Scored call also gets the sheet's call recording URL (call_logs.recording_url).
-- Existing call_logs dates are NOT changed; the tele-verification date/time is
-- stored on the answers (verified_call_date / verified_call_time).
--
-- Data fixes from the sheet:
--   * Harry Defendini Q5 was "2026-10-20" (Excel turned "10-20" into a date) -> '10-20'
--   * Q3 "-" (Ganesh Ramachandra, Scott Hauch) -> NULL (no answer)
-- ============================================================================

-- 1) Tables
create table if not exists public.call_profiling_questions (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null,              -- campaigns.id in main DB
  q_no         integer not null,
  question     text not null,
  created_at   timestamptz not null default now(),
  unique (campaign_id, q_no)
);

create table if not exists public.call_profiling_answers (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid not null,       -- leads.id in Call Logs DB
  call_log_id         uuid references public.call_logs (id) on delete set null,
  campaign_id         uuid not null,
  agent_id            uuid,
  q_no                integer not null,
  answer              text,
  verified_call_date  date,
  verified_call_time  time,
  source              text not null default 'app',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (lead_id, q_no)
);

create index if not exists call_profiling_answers_campaign_idx
  on public.call_profiling_answers (campaign_id, lead_id);
create index if not exists call_profiling_answers_call_idx
  on public.call_profiling_answers (call_log_id);

alter table public.call_profiling_questions enable row level security;
alter table public.call_profiling_answers  enable row level security;

-- 2) Questions (Freshworks campaign)
insert into public.call_profiling_questions (campaign_id, q_no, question) values
  ('d1476fb9-875b-4cf7-bbc3-8432027abb49', 1, 'Pain points: Which of these is closest to your current challenge?'),
  ('d1476fb9-875b-4cf7-bbc3-8432027abb49', 2, 'Current Stack/Vendor:'),
  ('d1476fb9-875b-4cf7-bbc3-8432027abb49', 3, 'Satisfaction + Intent:'),
  ('d1476fb9-875b-4cf7-bbc3-8432027abb49', 4, 'AI readiness'),
  ('d1476fb9-875b-4cf7-bbc3-8432027abb49', 5, 'Team size'),
  ('d1476fb9-875b-4cf7-bbc3-8432027abb49', 6, 'Timeline')
on conflict (campaign_id, q_no) do update set question = excluded.question;

-- 3) Replace previous sheet import of answers
delete from public.call_profiling_answers where source = 'sheet_import';

-- 4) Answers + recording URL
with sheet (email, call_date, call_time, recording_url, a1, a2, a3, a4, a5, a6) as (
  values
  ('peter.quiring@magna.com', '2026-09-15', '14:15:23',
   'https://workdrive.zohoexternal.in/external/897aac6519f752acc090a4f55f07f1656384cf277c84980898b83fcdad5f72ba/download',
   'High ticket or alert volumes', 'Jira Service Management', 'Better reporting & analytics', 'No we are not evaluating', '1000+', '6-9 months'),
  ('mgomes@ll.mit.edu', '2026-09-15', '15:12:16',
   'https://workdrive.zohoexternal.in/external/c06800785594afce664399fa4791555b2cda85dd89294e5d5114add7e2b8514e/download',
   'Slow root cause analysis or longer downtime?', 'ServiceNow', 'Faster implementation', 'Evaluating', '100 to 250', '6-9 months'),
  ('wayne.cook@phoenix.gov', '2026-09-18', '15:43:12',
   'https://workdrive.zohoexternal.in/external/0b9fc2764ed7c9d809470786c3fc8fdabf4f6f7240a6e2d0d32d176addcc8570/download',
   'Difficulty scaling automation or AI', 'ServiceNow', 'Better reporting', 'we are not evaluating', '15', '0-3 months'),
  ('tyler.derr@broadridge.com', '2026-09-18', '13:56:38',
   'https://workdrive.zohoexternal.in/external/e745903ec12f344f88e78fee2b3d540ff6261532fa037f66f8545b521c84b697/download',
   'Limited visibility into assets or service impact', 'MC Helix ITSM and ServiceNow', 'analytics', 'No we are not evaluating', '10', '6-9 months'),
  ('arreese@augusta.edu', '2026-09-18', '12:24:29',
   'https://workdrive.zohoexternal.in/external/2ddf3f9053c42f998be2da8b0b5c42230105cd79113da8108ab44b46f9678f8c/download',
   'High ticket or alert volumes', 'Mojo Helpdesk/KACE', 'analytics/Better reporting', 'No we are not evaluating/Experimenting', '10', '3-6 months'),
  ('ahmad.awad@dana.com', '2026-09-18', '09:30:14',
   'https://workdrive.zohoexternal.in/external/13c175fc927ca95025ce6c2c3f86b3996f9a89e3ff365400958cbd228f25811b/download',
   'High ticket or alert volumes', 'ServiceNow', 'analytics', 'Experimenting / Evaluating', 'More than 10', '6-9 months'),
  ('rchennareddy@primehealthcare.com', '2026-09-21', '15:13:08',
   'https://workdrive.zohoexternal.in/external/c9713fc84fe513a8d37809b4bae6f993ada9c12d3dc59a14ad3676debdf4c532/download',
   'Limited visibility into assets or service impact', 'ServiceNow', 'Faster Implimattaion', 'still evaluating potential use cases', '10+', '3-6 Months'),
  ('rly@dhs.lacounty.gov', '2026-09-21', '13:25:14',
   'https://workdrive.zohoexternal.in/external/93d93ebe6f4a9811e0d9e776f42a9117a623f698e3c8c27fa716760d52a37c72/download',
   'Limited visibility into assets or service impact', 'ServiceNow', 'Faster Implimattaion', 'experimenting with it', '10+', '3-6 Months'),
  ('ray.odiase@floridablue.com', '2026-09-22', '10:33:36',
   'https://workdrive.zohoexternal.in/external/337e4d065d69e3e1e8ae495a8e6061ec6b7e626f0e481b3ed1cf7639feffc034/download',
   'Limited visibility into assets or service impact', 'ServiceNow', 'Better reporting', 'still evaluating potential use cases', '10', '6-9 months'),
  ('thoagland@ent.com', '2026-09-22', '11:54:14',
   'https://workdrive.zohoexternal.in/external/4947911ea4a1820ef56ae54c68591b12832cf2e7d96eac62fcd2d0cbd973902e/download',
   'High ticket or alert volumes', 'ServiceNow ITSM', 'Analytics', 'experimenting with it', '25', '3-6 months'),
  ('cbeasley@firsthealth.org', '2026-09-22', '15:27:22',
   'https://workdrive.zohoexternal.in/external/8ff9e744b8e0fd2466b3da40cea171e9eb4fd9685cb48ae54267dce743be347f/download',
   'High ticket or alert volumes', 'SolarWinds ITSM', 'Better reporting', 'still evaluating potential use cases', '10', '6-9 months'),
  ('lmoore@langleyfcu.org', '2026-09-22', '16:20:38',
   'https://workdrive.zohoexternal.in/external/8c6f4514d98ad57f8c6fd72ca0cd954d43ff3f08bcb124a42e88fc105a01b078/download',
   'High ticket or alert volumes', 'ServiceNow', 'Faster Implementation', 'experimenting with it', '10+', '6-9 months'),
  ('sehar.babar@buzzfeed.com', '2026-09-22', '14:55:41',
   'https://workdrive.zohoexternal.in/external/d21fa910fb6c08eacca63e36bbb84a335d774874f8b9584dcc99d55a9cabec82/download',
   'Difficulty scaling automation or AI?', 'ServiceNow', 'Better reporting', 'still evaluating potential use cases', '10+', '3-6 months'),
  ('gramachandra@firsthorizon.com', '2026-09-22', '15:33:07',
   'https://workdrive.zohoexternal.in/external/d1b54d426497fd1927fb028fde8f284ce118ab0ece68512da11d4a3815ab1be4/download',
   'High ticket or alert volumes', 'ServiceNow', null, 'still evaluating potential use cases', '10', '6-9 months'),
  ('scott_hauch@cargill.com', '2026-09-22', '12:44:38',
   'https://workdrive.zohoexternal.in/external/0ab2ef131023e8252bc93bad8a5d2cc48671af110c1ac3e2180cd62f2a05c424/download',
   'Service desk and operations working in silos', 'ServiceNow', null, 'still evaluating potential use cases', '10', '6-9 months'),
  ('todd.russell@oneok.com', '2026-09-24', '12:44:38',
   'https://workdrive.zohoexternal.in/external/223e8212d68f709e6f098d03ae22077fe5d0af91e2a81c6e09b801ac578c288e/download',
   'Limited visibility into assets or service impact', 'ServiceNow', 'Faster Implementation', 'experimenting with it', '20-30', '6-9 months'),
  ('eharper@firsthealth.org', '2026-09-24', '11:54:14',
   'https://workdrive.zohoexternal.in/external/5e7435cf507c5a244c59bbea91df71bcc484d7d8f3db25bd307da37721ce11a3/download',
   'High ticket or alert volumes', 'SolarWinds ITSM', 'Analytics', 'still evaluating potential use cases', '10', '6-9 months'),
  ('harry.defendini@nyulangone.org', '2026-09-24', '10:09:07',
   'https://workdrive.zohoexternal.in/external/cbb821532d3522e3036ab776803f87b5a1c8997f8bd87ef9867fdd9c6ae489dc/download',
   'Service desk and operations working in silos', 'ServiceNow', 'Faster Implementation', 'still evaluating potential use cases', '10-20', '3-6 months'),
  ('mike.burkey@tn.gov', '2026-09-24', '15:15:50',
   'https://workdrive.zohoexternal.in/external/d2f581a326c13e7fa58a639fea20c97fca5d8caea3f36b72eaebd07f731e0c88/download',
   'Limited visibility into assets or service impact', 'ServiceNow', 'Better Reporting', 'still evaluating potential use cases', '10', '3-6 months'),
  ('brianhinds@shellpoint.org', '2026-09-24', '14:26:53',
   'https://workdrive.zohoexternal.in/external/0117fea5910df9a915eac6194da07ce8066ae619869670d8a7a85764b0dd27ef/download',
   'High ticket or alert volumes', 'ServiceNow', 'Analytics', 'still evaluating potential use cases', 'More than 10', '6-9 months')
),
matched as (
  select
    s.*,
    l.id as lead_row_id,
    l.campaign_id,
    l.assigned_agent_id,
    -- the lead's Scored call (latest one if there were several)
    (select c.id from public.call_logs c
      where c.lead_id = l.id and lower(coalesce(c.disposition, '')) = 'scored'
      order by c.call_date desc nulls last, c.call_sequence desc nulls last
      limit 1) as scored_call_id
  from sheet s
  join public.leads l on lower(trim(l.email)) = s.email
),
recordings as (
  update public.call_logs c
     set recording_url = m.recording_url
    from matched m
   where c.id = m.scored_call_id
  returning c.id
)
insert into public.call_profiling_answers (
  lead_id, call_log_id, campaign_id, agent_id, q_no, answer,
  verified_call_date, verified_call_time, source
)
select
  m.lead_row_id, m.scored_call_id, m.campaign_id, m.assigned_agent_id, qa.q_no, qa.answer,
  m.call_date::date, m.call_time::time, 'sheet_import'
from matched m
cross join lateral (values
  (1, m.a1), (2, m.a2), (3, m.a3), (4, m.a4), (5, m.a5), (6, m.a6)
) as qa(q_no, answer)
on conflict (lead_id, q_no) do update set
  call_log_id        = excluded.call_log_id,
  answer             = excluded.answer,
  verified_call_date = excluded.verified_call_date,
  verified_call_time = excluded.verified_call_time,
  source             = excluded.source,
  updated_at         = now();

-- 5) Verify: expect 120 answers (20 leads x 6), 20 linked Scored calls, 20 recordings
select
  (select count(*) from public.call_profiling_answers where source = 'sheet_import')            as answers,
  (select count(distinct lead_id) from public.call_profiling_answers where source = 'sheet_import') as leads,
  (select count(*) from public.call_profiling_answers
     where source = 'sheet_import' and call_log_id is null)                                     as answers_without_scored_call,
  (select count(*) from public.call_logs
     where source = 'sheet_import' and recording_url is not null)                              as scored_calls_with_recording,
  (select count(*) from public.call_profiling_questions
     where campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49')                               as questions;
