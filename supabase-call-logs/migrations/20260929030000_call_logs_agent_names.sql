-- ============================================================================
-- Restore dialer agent names on the imported calls (Call Logs DB only).
-- Source: "Atique MO.xlsx" -> Agent Name 1..5. Shown in the lead drawer's
-- "Call Logs" section. Matched by lead email + call number. Safe to re-run.
-- ============================================================================

alter table public.call_logs add column if not exists caller_name text;

with sheet (email, seq, caller_name) as (
  values
  ('peter.quiring@magna.com', 1, 'James'), ('peter.quiring@magna.com', 2, 'Ryan'),
  ('peter.quiring@magna.com', 3, 'James'), ('peter.quiring@magna.com', 4, 'Beth'),
  ('peter.quiring@magna.com', 5, 'James'),
  ('mgomes@ll.mit.edu', 1, 'Remo'), ('mgomes@ll.mit.edu', 2, 'Muskan'),
  ('mgomes@ll.mit.edu', 3, 'Ryan'), ('mgomes@ll.mit.edu', 4, 'Liam'),
  ('wayne.cook@phoenix.gov', 1, 'Radha'), ('wayne.cook@phoenix.gov', 2, 'James'),
  ('wayne.cook@phoenix.gov', 3, 'Beth'), ('wayne.cook@phoenix.gov', 4, 'Muskan'),
  ('wayne.cook@phoenix.gov', 5, 'Alice'),
  ('tyler.derr@broadridge.com', 1, 'Muskan'), ('tyler.derr@broadridge.com', 2, 'Shahaid'),
  ('arreese@augusta.edu', 1, 'Ryan'), ('arreese@augusta.edu', 2, 'Tony'), ('arreese@augusta.edu', 3, 'James'),
  ('ahmad.awad@dana.com', 1, 'Sham'),
  ('rchennareddy@primehealthcare.com', 1, 'Muskan'),
  ('rly@dhs.lacounty.gov', 1, 'Ryan'), ('rly@dhs.lacounty.gov', 2, 'Tony'), ('rly@dhs.lacounty.gov', 3, 'James'),
  ('ray.odiase@floridablue.com', 1, 'Shahaid'), ('ray.odiase@floridablue.com', 2, 'Muskan'),
  ('ray.odiase@floridablue.com', 3, 'Shahaid'), ('ray.odiase@floridablue.com', 4, 'Shahaid'),
  ('thoagland@ent.com', 1, 'Ryan'), ('thoagland@ent.com', 2, 'Tony'),
  ('cbeasley@firsthealth.org', 1, 'Remo'),
  ('lmoore@langleyfcu.org', 1, 'Zoro'), ('lmoore@langleyfcu.org', 2, 'Ryan'),
  ('lmoore@langleyfcu.org', 3, 'Liam'), ('lmoore@langleyfcu.org', 4, 'Beth'),
  ('lmoore@langleyfcu.org', 5, 'Tony'),
  ('sehar.babar@buzzfeed.com', 1, 'Tony'), ('sehar.babar@buzzfeed.com', 2, 'Zoro'),
  ('sehar.babar@buzzfeed.com', 3, 'Muskan'), ('sehar.babar@buzzfeed.com', 4, 'Liam'),
  ('gramachandra@firsthorizon.com', 1, 'Ryan'), ('gramachandra@firsthorizon.com', 2, 'James'),
  ('gramachandra@firsthorizon.com', 3, 'Shahaid'),
  ('scott_hauch@cargill.com', 1, 'James'), ('scott_hauch@cargill.com', 2, 'Shahaid'),
  ('todd.russell@oneok.com', 1, 'Alwyn'),
  ('eharper@firsthealth.org', 1, 'Zoro'), ('eharper@firsthealth.org', 2, 'Shahaid'),
  ('eharper@firsthealth.org', 3, 'Liam'), ('eharper@firsthealth.org', 4, 'Shahaid'),
  ('harry.defendini@nyulangone.org', 1, 'James'), ('harry.defendini@nyulangone.org', 2, 'Muskan'),
  ('harry.defendini@nyulangone.org', 3, 'Muskan'),
  ('mike.burkey@tn.gov', 1, 'Ryan'), ('mike.burkey@tn.gov', 2, 'Muskan'),
  ('mike.burkey@tn.gov', 3, 'Beth'), ('mike.burkey@tn.gov', 4, 'Shahaid'),
  ('brianhinds@shellpoint.org', 1, 'Shahaid')
)
update public.call_logs c
set caller_name = s.caller_name
from sheet s
join public.leads l on lower(trim(l.email)) = s.email
where c.lead_id = l.id
  and c.call_sequence = s.seq
  and c.source = 'sheet_import';

-- Verify: expect 58 imported calls, 0 without an agent name
select
  count(*)                                   as imported_calls,
  count(*) filter (where caller_name is null) as calls_without_agent_name
from public.call_logs
where source = 'sheet_import';
