-- ============================================================================
-- Insert the corrected audit sheet as a NEW ACTIVE batch (import_batch = 'cdr_v2')
-- Call Logs DB only (prznqqynlihqpgixjwkb). agentone / Freshworks.
-- Source: corrected sheet with "System ID 1..5" columns.
--
-- * 20 new leads, ACTIVE, new Lead IDs continuing agentone's sequence.
--   Lead details (contact, company, phone, QA, SIC/NAICS, Demand & Qualification
--   answers) are copied from the 'cdr_v1' lead with the same email - the sheet's
--   lead columns are identical to that batch.
-- * 47 calls with the dialer System ID. Timestamps follow the call-by-call audit:
--   Arijana Reese, Iyore Ray Odiase and Tom Hoagland corrected; all other leads
--   (incl. Tyler Derr) keep the timestamps already shown in Gaandiva.
--   Brian Hinds' call has no System ID (that row was cut off in the pasted data).
-- * Older leads are not touched (you already deactivated them).
-- * Times stored as India time (Asia/Kolkata) -> the app shows the sheet's time.
-- * Safe to re-run: leads inserted once per email; calls replaced.
-- Requires: 20260929060000_insert_cdr_v1_leads.sql already run (cdr_v1 leads exist).
-- ============================================================================

alter table public.call_logs add column if not exists system_id text;

-- ---------------------------------------------------------------------------
-- 1) Leads: copy each cdr_v1 lead into a new active cdr_v2 lead
-- ---------------------------------------------------------------------------
with base as (
  select max(split_part(lead_id, '-', 4)::int) as max_seq
  from public.leads
  where campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49'
    and lead_id ~ '^LD-[A-Za-z0-9]+-2026-[0-9]+$'
),
todo as (
  select v1.*, row_number() over (order by v1.lead_id) as rn
  from public.leads v1
  where v1.campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49'
    and v1.import_batch = 'cdr_v1'
    and not exists (
      select 1 from public.leads v2
      where v2.campaign_id = v1.campaign_id
        and v2.import_batch = 'cdr_v2'
        and lower(trim(v2.email)) = lower(trim(v1.email))
    )
)
insert into public.leads (
  lead_id, organization_id, campaign_id, assigned_agent_id, created_by, status, lead_type,
  is_active, import_batch,
  salutation, first_name, last_name, name, email, phone, direct_number,
  job_title, job_level, department, job_function, job_title_link,
  company_name, domain, company_website_link, company_number, address, city, state, country, zip_code,
  employee_size, industry, revenue_range,
  sic_code, sic_code_link, naics_code, naics_code_link,
  cq1, cq2, cq3, cq4, cq5, extra_cq,
  asset_title, qa_status, audit_date, qa_name, qa_audited_at
)
select
  'LD-' || split_part(t.lead_id, '-', 2) || '-2026-' || lpad((b.max_seq + t.rn)::text, 6, '0'),
  t.organization_id, t.campaign_id, t.assigned_agent_id, t.created_by, 'new', t.lead_type,
  true, 'cdr_v2',
  t.salutation, t.first_name, t.last_name, t.name, t.email, t.phone, t.direct_number,
  t.job_title, t.job_level, t.department, t.job_function, t.job_title_link,
  t.company_name, t.domain, t.company_website_link, t.company_number, t.address, t.city, t.state, t.country, t.zip_code,
  t.employee_size, t.industry, t.revenue_range,
  t.sic_code, t.sic_code_link, t.naics_code, t.naics_code_link,
  t.cq1, t.cq2, t.cq3, t.cq4, t.cq5, t.extra_cq,
  t.asset_title, t.qa_status, t.audit_date, t.qa_name, t.qa_audited_at
from todo t
cross join base b;

-- ---------------------------------------------------------------------------
-- 2) Calls for the new leads (replaced on every run)
-- ---------------------------------------------------------------------------
delete from public.call_logs where source = 'cdr_v2';

with calls (email, seq, system_id, caller_name, did_number, call_ts, duration_text, disposition) as (
  values
  ('peter.quiring@magna.com',          1, '1789496657.56137', 'Beth',    '12254972062', '2026-09-15 14:24:17', '00:28:08', 'VM'),
  ('peter.quiring@magna.com',          2, '1789501002.56274', 'Marco',   '12254972062', '2026-09-15 15:36:42', '03:37:02', 'Scored'),

  ('mgomes@ll.mit.edu',                1, '1789481255.56411', 'Remo',    '12254972062', '2026-09-15 10:07:35', '00:23:00', 'VM'),
  ('mgomes@ll.mit.edu',                2, '1789484053.56548', 'Muskan',  '12254972062', '2026-09-15 10:54:13', '00:20:00', 'VM'),
  ('mgomes@ll.mit.edu',                3, '1789487728.56685', 'Ryan',    '13083592901', '2026-09-15 11:55:28', '00:17:01', 'VM'),
  ('mgomes@ll.mit.edu',                4, '1789505045.56822', 'Liam',    '12094432412', '2026-09-15 16:44:05', '03:39:01', 'Scored'),

  ('wayne.cook@phoenix.gov',           1, '1789501632.56959', 'Muskan',  '12254972062', '2026-09-15 15:47:12', '00:43:00', 'VM'),
  ('wayne.cook@phoenix.gov',           2, '1789730337.57096', 'Alice',   '12094432412', '2026-09-17 13:18:57', '03:18:02', 'Scored'),

  -- Tyler Derr: timestamps per the audit (unchanged from Gaandiva); the System ID
  -- sheet had these two times the other way round.
  ('tyler.derr@broadridge.com',        1, '1789720449.57233', 'Muskan',  '12313965351', '2026-09-17 11:34:09', '00:38:00', 'VM'),
  ('tyler.derr@broadridge.com',        2, '1789714286.57370', 'Shahaid', '12254972062', '2026-09-17 09:51:26', '02:41:01', 'Scored'),

  ('arreese@augusta.edu',              1, '1789479738.57507', 'Ryan',    '17196549094', '2026-09-15 09:42:18', '00:34:00', 'VM'),
  ('arreese@augusta.edu',              2, '1789498628.57644', 'Tony',    '13083592901', '2026-09-17 10:16:29', '00:16:00', 'VM'),
  ('arreese@augusta.edu',              3, '1789712189.57781', 'Tony',    '12094432412', '2026-09-15 14:57:08', '02:53:08', 'Scored'),

  ('ahmad.awad@dana.com',              1, '1789726036.57918', 'Shahaid', '12094432412', '2026-09-17 13:27:16', '02:36:03', 'Scored'),

  ('rchennareddy@primehealthcare.com', 1, '1789834114.58055', 'Jasmine', '13083592901', '2026-09-18 16:08:34', '03:50:07', 'Scored'),

  ('rly@dhs.lacounty.gov',             1, '1789489134.58192', 'Ryan',    '17196549094', '2026-09-15 12:18:54', '00:43:00', 'VM'),
  ('rly@dhs.lacounty.gov',             2, '1789721015.58329', 'Tony',    '17196549094', '2026-09-17 11:43:35', '00:33:00', 'VM'),
  ('rly@dhs.lacounty.gov',             3, '1789824851.58466', 'Alwyn',   '12254972062', '2026-09-18 13:34:11', '03:04:08', 'Scored'),

  ('ray.odiase@floridablue.com',       1, '1789714107.58603', 'Shahaid', '12094432412', '2026-09-17 10:48:27', '00:27:00', 'VM'),
  ('ray.odiase@floridablue.com',       2, '1789734109.58740', 'Muskan',  '12094432412', '2026-09-17 14:35:26', '00:11:00', 'VM'),
  ('ray.odiase@floridablue.com',       3, '1789727726.58877', 'Shahaid', '12094432412', '2026-09-17 16:13:52', '00:45:00', 'VM'),
  ('ray.odiase@floridablue.com',       4, '1789733632.59014', 'Shahaid', '12254972062', '2026-09-17 16:21:49', '02:35:03', 'Scored'),

  ('thoagland@ent.com',                1, '1789828903.59151', 'Ryan',    '12094432412', '2026-09-18 12:06:31', '00:47:00', 'VM'),
  ('thoagland@ent.com',                2, '1789819591.59288', 'Tony',    '12094432412', '2026-09-18 14:41:43', '02:56:06', 'Scored'),

  ('cbeasley@firsthealth.org',         1, '1790075802.59425', 'Shahaid', '13083592901', '2026-09-21 11:16:42', '02:19:09', 'Scored'),

  ('lmoore@langleyfcu.org',            1, '1789499009.59562', 'Liam',    '12254972062', '2026-09-15 15:03:29', '00:54:00', 'VM'),
  ('lmoore@langleyfcu.org',            2, '1789713136.59699', 'Beth',    '12254972062', '2026-09-17 10:31:44', '00:45:00', 'VM'),
  ('lmoore@langleyfcu.org',            3, '1790076478.59836', 'Tony',    '12094432412', '2026-09-21 11:27:58', '02:49:07', 'Scored'),

  ('sehar.babar@buzzfeed.com',         1, '1789720883.59973', 'Zoro',    '12094432412', '2026-09-17 12:41:23', '00:25:00', 'VM'),
  ('sehar.babar@buzzfeed.com',         2, '1789830747.60110', 'Muskan',  '12254972062', '2026-09-18 15:12:27', '00:34:00', 'VM'),
  ('sehar.babar@buzzfeed.com',         3, '1790082684.60247', 'Alwyn',   '12254972062', '2026-09-21 13:11:24', '03:28:04', 'Scored'),

  ('gramachandra@firsthorizon.com',    1, '1789482231.60384', 'Ryan',    '12254972062', '2026-09-15 10:23:51', '00:13:00', 'VM'),
  ('gramachandra@firsthorizon.com',    2, '1789494739.60521', 'James',   '12254972062', '2026-09-15 13:52:19', '00:17:00', 'VM'),
  ('gramachandra@firsthorizon.com',    3, '1790092717.60658', 'Shahaid', '12094432412', '2026-09-21 15:58:37', '02:14:09', 'Scored'),

  ('scott_hauch@cargill.com',          1, '1789734768.60795', 'James',   '12254972062', '2026-09-17 16:32:48', '00:14:00', 'VM'),
  ('scott_hauch@cargill.com',          2, '1790075326.60932', 'Shahaid', '13083592901', '2026-09-21 11:08:46', '02:22:07', 'Scored'),

  ('todd.russell@oneok.com',           1, '1790192798.61069', 'Alwyn',   '17196549094', '2026-09-23 13:46:38', '03:29:07', 'Scored'),

  ('eharper@firsthealth.org',          1, '1789483336.61206', 'Zoro',    '12313965351', '2026-09-15 10:42:16', '00:19:00', 'VM'),
  ('eharper@firsthealth.org',          2, '1789487556.61343', 'Shahaid', '12094432412', '2026-09-15 11:52:36', '00:34:00', 'VM'),
  ('eharper@firsthealth.org',          3, '1789496213.61480', 'Liam',    '12254972062', '2026-09-15 14:16:53', '00:12:00', 'VM'),
  ('eharper@firsthealth.org',          4, '1790181446.61617', 'Shahaid', '12254972062', '2026-09-23 12:37:26', '02:28:02', 'Scored'),

  ('harry.defendini@nyulangone.org',   1, '1789495371.61754', 'James',   '12313965351', '2026-09-15 14:02:51', '00:02:00', 'VM'),
  ('harry.defendini@nyulangone.org',   2, '1789712297.61891', 'Muskan',  '12254972062', '2026-09-17 09:38:17', '00:19:00', 'VM'),
  ('harry.defendini@nyulangone.org',   3, '1790186985.62028', 'Jasmine', '12094432412', '2026-09-23 14:09:45', '03:56:08', 'Scored'),

  ('mike.burkey@tn.gov',               1, '1789729547.62165', 'Beth',    '12254972062', '2026-09-17 13:05:47', '00:11:00', 'VM'),
  ('mike.burkey@tn.gov',               2, '1790181222.62302', 'Shahaid', '12094432412', '2026-09-23 12:53:42', '02:10:09', 'Scored'),

  -- Brian Hinds: row cut off in the pasted data; call taken from the previous sheet, System ID unknown.
  ('brianhinds@shellpoint.org',        1, null,               'Shahaid', '12254972062', '2026-09-23 15:21:56', '02:43:02', 'Scored')
)
insert into public.call_logs (
  lead_id, agent_id, campaign_id, phone_number, status,
  call_started_at, call_date, call_sequence, system_id, caller_name, did_number, disposition,
  duration_text, duration_seconds, source
)
select
  l.id, l.assigned_agent_id, l.campaign_id, l.phone, 'completed',
  c.call_ts::timestamp at time zone 'Asia/Kolkata', c.call_ts::date, c.seq, c.system_id,
  c.caller_name, c.did_number, c.disposition,
  c.duration_text,
  split_part(c.duration_text, ':', 1)::int * 60 + split_part(c.duration_text, ':', 2)::int,
  'cdr_v2'
from calls c
join public.leads l
  on lower(trim(l.email)) = c.email
 and l.import_batch = 'cdr_v2'
 and l.campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49';

-- ---------------------------------------------------------------------------
-- 3) Verify: expect new_leads = 20, new_active = 20, calls = 47,
--    leads_with_calls = 20, calls_with_system_id = 46 (Brian Hinds' is blank)
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.leads where import_batch = 'cdr_v2')                    as new_leads,
  (select count(*) from public.leads where import_batch = 'cdr_v2' and is_active)      as new_active,
  (select count(*) from public.call_logs where source = 'cdr_v2')                      as calls,
  (select count(distinct lead_id) from public.call_logs where source = 'cdr_v2')       as leads_with_calls,
  (select count(*) from public.call_logs where source = 'cdr_v2' and system_id is not null) as calls_with_system_id,
  (select min(lead_id) || ' .. ' || max(lead_id) from public.leads where import_batch = 'cdr_v2') as new_lead_ids,
  (select count(*) from public.leads
     where campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49' and is_active)         as active_in_campaign;
