-- ============================================================================
-- Fix call timestamp associations on the ACTIVE (cdr_v1) leads
-- Call Logs DB only (prznqqynlihqpgixjwkb). Corrected per the audit Excel.
-- Only call_started_at / call_date change; agent, DID, duration and disposition
-- stay on the same call. Each row is matched on lead email + call number +
-- duration, so a call with an unexpected duration is left untouched.
-- Times are India time (Asia/Kolkata), same as the original insert. Safe to re-run.
--
--   Arijana Reese     call 2 (Tony, 13083592901, 16s)     -> 2026-09-17 10:16:29
--                     call 3 (Tony, 12094432412, 2m 53s)  -> 2026-09-15 14:57:08
--   Iyore Ray Odiase  call 2 (Muskan, 12094432412, 11s)   -> 2026-09-17 14:35:26
--                     call 3 (Shahaid, 12094432412, 45s)  -> 2026-09-17 16:13:52
--                     call 4 (Shahaid, 12254972062, 2m35) -> 2026-09-17 16:21:49
--   Tom Hoagland      call 1 (Ryan, 12094432412, 47s)     -> 2026-09-18 12:06:31
--                     call 2 (Tony, 12094432412, 2m 56s)  -> 2026-09-18 14:41:43
-- ============================================================================

with fix (email, seq, duration_text, call_ts) as (
  values
  ('arreese@augusta.edu',        2, '00:16:00', '2026-09-17 10:16:29'),
  ('arreese@augusta.edu',        3, '02:53:08', '2026-09-15 14:57:08'),
  ('ray.odiase@floridablue.com', 2, '00:11:00', '2026-09-17 14:35:26'),
  ('ray.odiase@floridablue.com', 3, '00:45:00', '2026-09-17 16:13:52'),
  ('ray.odiase@floridablue.com', 4, '02:35:03', '2026-09-17 16:21:49'),
  ('thoagland@ent.com',          1, '00:47:00', '2026-09-18 12:06:31'),
  ('thoagland@ent.com',          2, '02:56:06', '2026-09-18 14:41:43')
)
update public.call_logs c
set
  call_started_at = f.call_ts::timestamp at time zone 'Asia/Kolkata',
  call_date       = f.call_ts::date
from fix f
join public.leads l
  on lower(trim(l.email)) = f.email
 and l.import_batch = 'cdr_v1'
 and l.campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49'
where c.lead_id = l.id
  and c.source = 'cdr_v1'
  and c.call_sequence = f.seq
  and c.duration_text = f.duration_text;

-- Verify: expect 9 rows (all calls of the 3 leads) with the corrected times;
-- "call_time_ist" is what the app shows.
select
  l.first_name || ' ' || l.last_name                                   as lead,
  c.call_sequence                                                      as call_no,
  c.caller_name                                                        as agent,
  c.did_number,
  c.duration_text,
  c.disposition,
  to_char(c.call_started_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS') as call_time_ist
from public.call_logs c
join public.leads l on l.id = c.lead_id
where c.source = 'cdr_v1'
  and l.import_batch = 'cdr_v1'
  and lower(l.email) in ('arreese@augusta.edu', 'ray.odiase@floridablue.com', 'thoagland@ent.com')
order by lead, c.call_sequence;
