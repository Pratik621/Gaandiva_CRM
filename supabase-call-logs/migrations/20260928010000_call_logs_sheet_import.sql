-- ============================================================================
-- Call logs from the Freshworks call sheet -> Call Logs DB (prznqqynlihqpgixjwkb)
-- Run ONLY in the Call Logs project's SQL Editor. Safe to re-run: rows from a
-- previous run of this script (source = 'sheet_import') are replaced.
--
-- Mapping (per sheet row, calls 1..5):
--   Email Address          -> leads.email  (lead_id / agent_id / campaign_id taken from that lead)
--   Agent Name N           -> not stored
--   DID Number N           -> did_number
--   Call Timestamp N       -> call_date     (DD/MM/YY; blank = same day as previous call)
--   Call Duration N        -> duration_text (as written) + duration_seconds
--   Disposition N          -> disposition   (VM / Scored / blank)
-- Duration "M:SS:xx" (e.g. 3:37:02) is read as minutes:seconds, trailing part ignored.
-- The sheet has no time of day, so call_started_at is left NULL for these rows.
-- ============================================================================

-- 1) New columns on call_logs
alter table public.call_logs add column if not exists call_sequence  integer;
alter table public.call_logs add column if not exists call_date      date;
alter table public.call_logs drop column if exists caller_name;
alter table public.call_logs add column if not exists did_number     text;
alter table public.call_logs add column if not exists disposition    text;
alter table public.call_logs add column if not exists duration_text  text;
alter table public.call_logs add column if not exists source         text not null default 'app';
alter table public.call_logs alter column call_started_at drop not null;

create index if not exists call_logs_lead_date_idx
  on public.call_logs (lead_id, call_date desc, call_sequence desc);

-- 2) Replace previous sheet import
delete from public.call_logs where source = 'sheet_import';

-- 3) Insert sheet rows
with sheet (email, seq, did_number, call_ts, duration_text, disposition) as (
  values
  ('peter.quiring@magna.com',          1, '12313965351', '15/09/26', '0:37:02', 'VM'),
  ('peter.quiring@magna.com',          2, '12313965351', '15/09/26', '0:21:01', 'VM'),
  ('peter.quiring@magna.com',          3, '12254972062', '15/09/26', '0:19:01', 'VM'),
  ('peter.quiring@magna.com',          4, '12254972062', '15/09/26', '0:28:08', 'VM'),
  ('peter.quiring@magna.com',          5, '12254972062', '15/09/26', '3:37:02', 'Scored'),

  ('mgomes@ll.mit.edu',                1, '12254972062', '15/09/26', '0:23:00', 'VM'),
  ('mgomes@ll.mit.edu',                2, '12254972062', '15/09/26', '0:20:00', null),
  ('mgomes@ll.mit.edu',                3, '13083592901', '15/09/26', '0:17:01', 'VM'),
  ('mgomes@ll.mit.edu',                4, '12094432412', '15/09/26', '3:39:01', 'Scored'),

  ('wayne.cook@phoenix.gov',           1, '17196549094', '17/09/26', '0:35:00', 'VM'),
  ('wayne.cook@phoenix.gov',           2, '12094432412', '17/09/26', '0:16:00', 'VM'),
  ('wayne.cook@phoenix.gov',           3, '12254972062', '17/09/26', '0:22:00', 'VM'),
  ('wayne.cook@phoenix.gov',           4, '12254972062', '17/09/26', '0:43:00', 'VM'),
  ('wayne.cook@phoenix.gov',           5, '12094432412', '17/09/26', '3:18:02', 'Scored'),

  ('tyler.derr@broadridge.com',        1, '12313965351', '17/09/26', '0:38:00', 'VM'),
  ('tyler.derr@broadridge.com',        2, '12254972062', '17/09/26', '2:41:01', 'Scored'),

  ('arreese@augusta.edu',              1, '17196549094', '17/09/26', '0:34:00', 'VM'),
  ('arreese@augusta.edu',              2, '13083592901', '17/09/26', '0:16:00', 'VM'),
  ('arreese@augusta.edu',              3, '12094432412', '17/09/26', '2:53:08', 'Scored'),

  ('ahmad.awad@dana.com',              1, '12094432412', '17/09/26', '2:36:03', 'Scored'),

  ('rchennareddy@primehealthcare.com', 1, '13083592901', '18/09/26', '3:50:07', 'Scored'),

  ('rly@dhs.lacounty.gov',             1, '17196549094', '18/09/26', '0:43:00', 'VM'),
  ('rly@dhs.lacounty.gov',             2, '17196549094', '18/09/26', '0:33:00', 'VM'),
  ('rly@dhs.lacounty.gov',             3, '12254972062', '18/09/26', '3:04:08', 'Scored'),

  ('ray.odiase@floridablue.com',       1, '12094432412', '18/09/26', '0:27:00', 'VM'),
  ('ray.odiase@floridablue.com',       2, '12094432412', null,       '0:11:00', null),
  ('ray.odiase@floridablue.com',       3, '12094432412', null,       '0:45:00', 'VM'),
  ('ray.odiase@floridablue.com',       4, '12254972062', null,       '2:35:03', 'Scored'),

  ('thoagland@ent.com',                1, '12094432412', '18/09/26', '0:47:00', 'VM'),
  ('thoagland@ent.com',                2, null,          null,       '2:56:06', 'Scored'),

  ('cbeasley@firsthealth.org',         1, '13083592901', '21/09/26', '2:19:09', 'Scored'),

  ('lmoore@langleyfcu.org',            1, '17196549094', '17/09/26', '0:16:00', 'VM'),
  ('lmoore@langleyfcu.org',            2, '17196549094', null,       '0:28:08', 'VM'),
  ('lmoore@langleyfcu.org',            3, '12254972062', null,       '0:54:00', 'VM'),
  ('lmoore@langleyfcu.org',            4, '12254972062', null,       '0:45:00', 'VM'),
  ('lmoore@langleyfcu.org',            5, '12094432412', null,       '2:49:07', 'Scored'),

  ('sehar.babar@buzzfeed.com',         1, '12313965351', '17/09/26', '0:02:00', 'VM'),
  ('sehar.babar@buzzfeed.com',         2, '12094432412', null,       '0:25:00', null),
  ('sehar.babar@buzzfeed.com',         3, '12254972062', null,       '0:34:00', 'VM'),
  ('sehar.babar@buzzfeed.com',         4, '12254972062', null,       '3:28:04', 'Scored'),

  ('gramachandra@firsthorizon.com',    1, '12254972062', '17/09/26', '0:13:00', 'VM'),
  ('gramachandra@firsthorizon.com',    2, '12254972062', null,       '0:17:00', 'VM'),
  ('gramachandra@firsthorizon.com',    3, '12094432412', null,       '2:14:09', 'Scored'),

  ('scott_hauch@cargill.com',          1, '12254972062', '17/09/26', '0:14:00', 'VM'),
  ('scott_hauch@cargill.com',          2, '13083592901', null,       '2:22:07', 'Scored'),

  ('todd.russell@oneok.com',           1, '17196549094', '24/09/26', '3:29:07', 'Scored'),

  ('eharper@firsthealth.org',          1, '12313965351', '15/09/26', '0:19:00', 'VM'),
  ('eharper@firsthealth.org',          2, '12094432412', null,       '0:34:00', null),
  ('eharper@firsthealth.org',          3, '12254972062', null,       '0:12:00', 'VM'),
  ('eharper@firsthealth.org',          4, '12254972062', null,       '2:28:02', 'Scored'),

  ('harry.defendini@nyulangone.org',   1, '12313965351', '15/09/26', '0:02:00', 'VM'),
  ('harry.defendini@nyulangone.org',   2, '12254972062', null,       '0:19:00', 'VM'),
  ('harry.defendini@nyulangone.org',   3, '12094432412', null,       '3:56:08', 'Scored'),

  ('mike.burkey@tn.gov',               1, '12313965351', '15/09/26', '0:28:00', 'VM'),
  ('mike.burkey@tn.gov',               2, '13083592901', null,       '0:12:00', null),
  ('mike.burkey@tn.gov',               3, '12254972062', null,       '0:11:00', 'VM'),
  ('mike.burkey@tn.gov',               4, '12094432412', null,       '2:10:09', 'Scored'),

  ('brianhinds@shellpoint.org',        1, '12254972062', '24/09/26', '2:43:02', 'Scored')
),
parsed as (
  select
    s.*,
    -- blank date = same day as the latest earlier call for that lead
    max(to_date(s.call_ts, 'DD/MM/YY')) over (
      partition by s.email order by s.seq rows between unbounded preceding and current row
    ) as call_date,
    split_part(s.duration_text, ':', 1)::int * 60
      + split_part(s.duration_text, ':', 2)::int as duration_seconds
  from sheet s
)
insert into public.call_logs (
  lead_id, agent_id, campaign_id, phone_number, call_started_at, status,
  call_sequence, call_date, did_number, disposition,
  duration_text, duration_seconds, source
)
select
  l.id, l.assigned_agent_id, l.campaign_id, coalesce(l.direct_number, l.phone), null, 'completed',
  p.seq, p.call_date, p.did_number, p.disposition,
  p.duration_text, p.duration_seconds, 'sheet_import'
from parsed p
join public.leads l on lower(trim(l.email)) = lower(p.email);

-- 4) Verify: expect 58 calls across 20 leads, and no unmatched emails
select count(*) as calls, count(distinct lead_id) as leads
from public.call_logs where source = 'sheet_import';

select distinct s.email as unmatched_email
from (values
  ('peter.quiring@magna.com'),('mgomes@ll.mit.edu'),('wayne.cook@phoenix.gov'),
  ('tyler.derr@broadridge.com'),('arreese@augusta.edu'),('ahmad.awad@dana.com'),
  ('rchennareddy@primehealthcare.com'),('rly@dhs.lacounty.gov'),('ray.odiase@floridablue.com'),
  ('thoagland@ent.com'),('cbeasley@firsthealth.org'),('lmoore@langleyfcu.org'),
  ('sehar.babar@buzzfeed.com'),('gramachandra@firsthorizon.com'),('scott_hauch@cargill.com'),
  ('todd.russell@oneok.com'),('eharper@firsthealth.org'),('harry.defendini@nyulangone.org'),
  ('mike.burkey@tn.gov'),('brianhinds@shellpoint.org')
) s(email)
left join public.leads l on lower(trim(l.email)) = s.email
where l.id is null;
