-- ============================================================================
-- Fill QA AUDIT & STATUS for agentone's Freshworks leads
-- Call Logs DB only (prznqqynlihqpgixjwkb). Source: "Atique MO.xlsx"
-- (generated from the file; row 21 of the sheet is empty and skipped).
-- Safe to re-run. Blank / "-" cells are NULL and never overwrite existing values.
--
-- Sheet column      -> leads column        (lead drawer field)
--   Asset Title     -> asset_title         (Asset Title)
--   Status          -> qa_status           (Status)  "Qualifed" -> 'qualified'
--   Audit Date      -> audit_date          (Audit Date)   DD/MM/YY
--   QA Auditor      -> qa_name             (QA Auditor)
--   QA Audit Date   -> qa_audited_at
--   Primary Reason  -> primary_reason      (Primary Reason)
--   Secondary Reason-> secondary_reason    (Secondary Reason)
--   QA Comments     -> qa_comments         (QA Comments)
-- ============================================================================

with sheet (email, asset_title, qa_status, audit_date, qa_name, qa_audit_date,
            primary_reason, secondary_reason, qa_comments) as (
  values
  ('peter.quiring@magna.com', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-16', 'Prajwal', '2026-09-16', null, null, null),
  ('mgomes@ll.mit.edu', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-16', 'Prajwal', '2026-09-16', null, null, null),
  ('wayne.cook@phoenix.gov', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-18', 'Prajwal', '2026-09-18', null, null, null),
  ('tyler.derr@broadridge.com', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-18', 'Prajwal', '2026-09-18', null, null, null),
  ('arreese@augusta.edu', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-18', 'Prajwal', '2026-09-18', null, null, null),
  ('ahmad.awad@dana.com', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-18', 'Prajwal', '2026-09-18', null, null, null),
  ('rchennareddy@primehealthcare.com', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-21', 'Prajwal', '2026-09-21', null, null, null),
  ('rly@dhs.lacounty.gov', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-21', 'Prajwal', '2026-09-21', null, null, null),
  ('ray.odiase@floridablue.com', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-22', 'Prajwal', '2026-09-22', null, null, null),
  ('thoagland@ent.com', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-22', 'Prajwal', '2026-09-22', null, null, null),
  ('cbeasley@firsthealth.org', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-22', 'Prajwal', '2026-09-22', null, null, null),
  ('lmoore@langleyfcu.org', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-22', 'Prajwal', '2026-09-22', null, null, null),
  ('sehar.babar@buzzfeed.com', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-22', 'Prajwal', '2026-09-22', null, null, null),
  ('gramachandra@firsthorizon.com', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-22', 'Prajwal', '2026-09-22', null, null, null),
  ('scott_hauch@cargill.com', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-22', 'Prajwal', '2026-09-22', null, null, null),
  ('todd.russell@oneok.com', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-24', 'Prajwal', '2026-09-24', null, null, null),
  ('eharper@firsthealth.org', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-24', 'Prajwal', '2026-09-24', null, null, null),
  ('harry.defendini@nyulangone.org', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-24', 'Prajwal', '2026-09-24', null, null, null),
  ('mike.burkey@tn.gov', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-24', 'Prajwal', '2026-09-24', null, null, null),
  ('brianhinds@shellpoint.org', 'Building the Intelligence-Driven IT Organization', 'qualified', '2026-09-24', 'Prajwal', '2026-09-24', null, null, null)
)
update public.leads l
set
  asset_title      = coalesce(s.asset_title, l.asset_title),
  qa_status        = coalesce(s.qa_status, l.qa_status),
  audit_date       = coalesce(s.audit_date::date, l.audit_date),
  qa_name          = coalesce(s.qa_name, l.qa_name),
  qa_audited_at    = coalesce(s.qa_audit_date::date::timestamptz, l.qa_audited_at),
  primary_reason   = coalesce(s.primary_reason, l.primary_reason),
  secondary_reason = coalesce(s.secondary_reason, l.secondary_reason),
  qa_comments      = coalesce(s.qa_comments, l.qa_comments)
from sheet s
where lower(trim(l.email)) = s.email
  and l.campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49';

-- Verify: expect 20 rows, all qualified / Prajwal / asset title filled
select
  coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), name) as lead,
  asset_title, qa_status, audit_date, qa_name, qa_audited_at
from public.leads
where campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49'
order by lead;
