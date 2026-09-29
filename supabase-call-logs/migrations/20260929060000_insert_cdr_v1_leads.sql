-- ============================================================================
-- Insert 20 NEW leads + their call logs for agentone / Freshworks
-- Call Logs DB only (prznqqynlihqpgixjwkb).
-- Source: "Freshworks MO Call Log Audit CDR V1 - 20 Leads (1)(1).xlsx"
--
-- * New leads are ACTIVE (is_active = true) and tagged import_batch = 'cdr_v1'.
--   They get new Lead IDs continuing agentone's sequence (LD-<code>-2026-NNNNNN).
-- * The same 20 people already exist as older leads (same emails). Those old
--   leads are NOT changed; deactivate them on the Lead Activation page, or run
--   the optional statement at the bottom.
-- * Demand & Qualification answers (cq1-cq5, extra_cq) are copied from the older
--   lead with the same email (same prospect, same profiling call).
-- * Calls are tagged source = 'cdr_v1'. Call timestamps are stored as India time
--   (Asia/Kolkata) so the app shows exactly the time written in the sheet.
-- * Duration "03:37:02" is read as 3 min 37 s (same rule as the earlier import).
-- * Safe to re-run: leads are inserted once per email; calls are replaced.
-- Requires: 20260929050000_leads_is_active.sql (is_active column).
-- ============================================================================

alter table public.leads add column if not exists import_batch text;

-- Call log columns used below (added by earlier scripts; repeated so this file runs alone)
alter table public.call_logs add column if not exists call_sequence  integer;
alter table public.call_logs add column if not exists call_date      date;
alter table public.call_logs add column if not exists caller_name    text;
alter table public.call_logs add column if not exists did_number     text;
alter table public.call_logs add column if not exists disposition    text;
alter table public.call_logs add column if not exists duration_text  text;
alter table public.call_logs add column if not exists source         text not null default 'app';
alter table public.call_logs alter column call_started_at drop not null;

-- ---------------------------------------------------------------------------
-- 1) Leads
-- ---------------------------------------------------------------------------
with src (ord, email, salutation, first_name, last_name, job_title, job_level, job_title_link,
          audit_date, company_name, domain, phone, address, city, state, zip_code,
          employee_size, industry, revenue_range) as (
  values
  (1, 'peter.quiring@magna.com', 'Mr', 'Peter', 'Quiring', 'IT/OT Manager', 'Manager', 'https://www.linkedin.com/in/peter-quiring-15310962/', '2026-09-16', 'Magna International', 'magna.com', '+1-586-816-1400', '750 Tower Drive', 'Troy', 'Michigan', '48098', '10,000+', 'Manufacturing', '$42.01 Billion'),
  (2, 'mgomes@ll.mit.edu', 'Mr', 'Marco', 'Gomes', 'Director IT', 'Director', 'https://www.linkedin.com/in/marco-gomes-9526366/', '2026-09-16', 'Massachusetts Institute of Technology', 'web.mit.edu', '+1-617-253-0336', '77 Massachusetts Avenue', 'Cambridge', 'Massachusetts', '02139', '5,001–10,000', 'Education', '$5.37 Billion'),
  (3, 'wayne.cook@phoenix.gov', 'Mr', 'Wayne', 'Cook', 'Information Technology Operations Manager (Municipal Court)', 'Manager', 'https://www.linkedin.com/in/wayne-cook-a16068215/', '2026-09-18', 'City of Phoenix', 'phoenix.gov', '+1-602-262-7192', '200 W Washington Street', 'Phoenix', 'Arizona', '85003', '10001+', 'Government Administration', '$1.99 Billion'),
  (4, 'tyler.derr@broadridge.com', 'Mr', 'Tyler', 'Derr', 'Chief Technology Officer', 'C-Level', 'https://www.linkedin.com/in/tyler-derr-4b58854/', '2026-09-18', 'Broadridge', 'broadridge.com', '+1-201-714-8131', '605 3rd Avenue', 'New York City', 'New York', '10158', '10001+', 'Financial Services', '$7.477 Billion'),
  (5, 'arreese@augusta.edu', 'Ms', 'Arijana', 'Reese', 'Director Of Information Technology', 'Director', 'https://www.linkedin.com/in/arijanareese/', '2026-09-18', 'Augusta University', 'augusta.edu', '+1-706-721-2518', '1120 15th Street', 'Augusta', 'Georgia', '30912', '5001-10000', 'Higher Education', '$1.01 Billion'),
  (6, 'ahmad.awad@dana.com', 'Mr', 'Ahmad', 'Awad', 'Corp IT Manager', 'Manager', 'https://www.linkedin.com/in/ahmad-awad/', '2026-09-18', 'Dana Holding Corporation', 'dana.com', '+1-419-482-2460', '3939 Technology Drive', 'Maumee', 'Ohio', '43537', '10001+', 'Motor Vehicle Manufacturing', '$7.5 Billion'),
  (7, 'rchennareddy@primehealthcare.com', 'Mr', 'Raghu', 'Chennareddy', 'Chief Information Officer', 'C-Suite / Owner', 'https://www.linkedin.com/in/rchennareddy/', '2026-09-21', 'Prime Healthcare', 'primehealthcare.com', '+1-909-235-4245', '3480 East Guasti Road', 'Ontario', 'California', '91761', '10,000+', 'Healthcare / Life Sciences', '$7.3 Billion'),
  (8, 'rly@dhs.lacounty.gov', 'Ms', 'Rosanna', 'Ly', 'IT Project Manager', 'Manager', 'https://www.linkedin.com/in/rosannaly/', '2026-09-21', 'LA Health Services', 'dhs.lacounty.gov', '+1-213-288-8493', '313 N Figueroa Street', 'Los Angeles', 'California', '90012', '10,000+', 'Healthcare / Life Sciences', '$1.4 billion'),
  (9, 'ray.odiase@floridablue.com', 'Mr', 'Iyore Ray', 'Odiase', 'Sr. IT Director', 'Director', 'https://www.linkedin.com/in/iyoreodiase/', '2026-09-22', 'Florida Blue', 'floridablue.com', '+1-904-905-4720', '4800 Deerwood Campus Parkway', 'Jacksonville', 'Florida', '32246', '5,001–10,000', 'Financial Services', '$10.1 Billion'),
  (10, 'thoagland@ent.com', 'Mr', 'Tom', 'Hoagland', 'Director, IT Enterprise Architecture', 'Director', 'https://www.linkedin.com/in/tom-hoagland-a785bb2', '2026-09-22', 'Ent Credit Union', 'ent.com', '+1-719-550-6233', '11550 Ent Pkwy', 'Colorado Springs', 'Colorado', '80921', '1,001–5,000', 'Financial Services', '$594.9 Million'),
  (11, 'cbeasley@firsthealth.org', 'Mr', 'Chris', 'Beasley', 'VP, Chief Information Officer', 'VP / Vice President', 'https://www.linkedin.com/in/chriscbeasley/', '2026-09-22', 'FirstHealth', 'firsthealth.org', '+1-239-233-4162', '155 Memorial Drive', 'Pinehurst', 'North Carolina', '28374', '5,001–10,000', 'Healthcare / Life Sciences', '$500M - $1B'),
  (12, 'lmoore@langleyfcu.org', 'Mr', 'Lindsey', 'Moore', 'Director of IT Operations', 'Director', 'https://www.linkedin.com/in/lindsey-moore-csm-cspo-995317a5', '2026-09-22', 'Langley Federal Credit Union', 'langleyfcu.org', '+1-757-613-9709', '11742 Jefferson Ave', 'Newport News', 'Virginia', '23606', '501–1,000', 'Financial Services', '$500M - $1B'),
  (13, 'sehar.babar@buzzfeed.com', 'Ms', 'Sehar', 'Babar', 'IT Manager', 'Manager', 'https://www.linkedin.com/in/sehar-babar/', '2026-09-22', 'BuzzFeed', 'buzzfeed.com', '+1-631-649-2497', '50 W 23Rd St 6Th Floor New York Ny', 'New York City', 'New York', '10010', '201–500', 'Technology', '$170.7 Million'),
  (14, 'gramachandra@firsthorizon.com', 'Mr', 'Ganesh', 'Ramachandra', 'SVP and Deputy CIO - Core Banking Systems', 'C-Suite / Owner', 'https://www.linkedin.com/in/ganeshramachandra', '2026-09-22', 'First Horizon Corporation', 'firsthorizon.com', '+1-901-523-5499', '11610 Highway 70', 'Arlington', 'Tennessee', '38002', '5,001–10,000', 'Financial Services', '$3.50 billion'),
  (15, 'scott_hauch@cargill.com', 'Mr', 'Scott', 'Hauch', 'IT Services Manager', 'Manager', 'https://www.linkedin.com/in/scott-hauch-81387114/', '2026-09-22', 'Cargill', 'cargill.com', '+1-952-984-5292', '15407 Mcginty Road West', 'Wayzata', 'Minnesota', '55391', '10,000+', 'Manufacturing', '$164 billion'),
  (16, 'todd.russell@oneok.com', 'Mr', 'Todd', 'Russell', 'IT Manager', 'Manager', 'https://www.linkedin.com/in/todd-russell-1745543a/', '2026-09-24', 'ONEOK', 'oneok.com', '+1-918-616-8977', '100 W 5Th St', 'Tulsa', 'Oklahoma', '74103', '5001-10000', 'Oil and Gas', '$39.366 Billion'),
  (17, 'eharper@firsthealth.org', 'Mr', 'Eric', 'Harper', 'Director Information Technology Services', 'Director', 'https://www.linkedin.com/in/eric-b-harper-2892a31a/', '2026-09-24', 'FirstHealth', 'firsthealth.org', '+1-910-715-3370', '155 Memorial Drive', 'Pinehurst', 'North Carolina', '28374', '5001-10000', 'Hospitals and Health Care', '$1.1 Billion'),
  (18, 'harry.defendini@nyulangone.org', 'Mr', 'Harry', 'Defendini', 'Director of IT', 'Director', 'https://www.linkedin.com/in/harry-defendini-1702632/', '2026-09-24', 'Nyu Langone Hospitals', 'nyulangone.org', '+1-212-460-0113', '240 E 18Th St Ste 21', 'New York City', 'New York', '10003', '1001-5000', 'Hospitals and Health Care', '$12.8 Billion'),
  (19, 'mike.burkey@tn.gov', 'Mr', 'Mike', 'Burkey', 'Director of IT', 'Director', 'https://www.linkedin.com/in/mike-burkey-7b8a09b1', '2026-09-24', 'State of Tennessee', 'tn.gov', '+1-615-878-4790', '600 Charlotte Avenue', 'Nashville', 'Tennessee', '37243', '201-500', 'Government Administration', '$26.1 Billion'),
  (20, 'brianhinds@shellpoint.org', 'Mr', 'Brian', 'Hinds', 'Chief Information Officer', 'C-Suite / Owner', 'https://www.linkedin.com/in/bhinds/', '2026-09-24', 'Shell Point Retirement Community', 'shellpoint.org', '+1-239-454-2248', '15101 Shell Point Boulevard', 'Fort Myers', 'Florida', '33908', '1001-5000', 'Hospitals and Health Care', '$154.7 Million')
),
-- agentone's org / agent id / Lead ID code + highest sequence, from the existing leads
base as (
  select
    organization_id,
    assigned_agent_id,
    split_part(lead_id, '-', 2)                  as code,
    max(split_part(lead_id, '-', 4)::int)        as max_seq
  from public.leads
  where campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49'
    and lead_id ~ '^LD-[A-Za-z0-9]+-2026-[0-9]+$'
  group by 1, 2, 3
  order by count(*) desc
  limit 1
),
todo as (
  select s.*, row_number() over (order by s.ord) as rn
  from src s
  where not exists (
    select 1 from public.leads l
    where l.campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49'
      and l.import_batch = 'cdr_v1'
      and lower(trim(l.email)) = s.email
  )
)
insert into public.leads (
  lead_id, organization_id, campaign_id, assigned_agent_id, created_by, status, lead_type,
  is_active, import_batch,
  salutation, first_name, last_name, name, email, phone,
  job_title, job_level, department, job_function, job_title_link,
  company_name, domain, company_website_link, address, city, state, country, zip_code,
  employee_size, industry, revenue_range,
  asset_title, qa_status, audit_date, qa_name, qa_audited_at
)
select
  'LD-' || b.code || '-2026-' || lpad((b.max_seq + t.rn)::text, 6, '0'),
  b.organization_id, 'd1476fb9-875b-4cf7-bbc3-8432027abb49', b.assigned_agent_id, b.assigned_agent_id,
  'new', 'HQL / BANT',
  true, 'cdr_v1',
  t.salutation, t.first_name, t.last_name, t.first_name || ' ' || t.last_name, t.email, t.phone,
  t.job_title, t.job_level, 'IT', 'IT / Technology', t.job_title_link,
  t.company_name, t.domain, t.domain, t.address, t.city, t.state, 'United States', t.zip_code,
  t.employee_size, t.industry, t.revenue_range,
  'Building the Intelligence-Driven IT Organization', 'qualified', t.audit_date::date, 'Prajwal',
  t.audit_date::date::timestamptz
from todo t
cross join base b;

-- ---------------------------------------------------------------------------
-- 2) Copy Demand & Qualification answers from the older lead with the same email
-- ---------------------------------------------------------------------------
update public.leads n
set
  cq1 = coalesce(n.cq1, o.cq1),
  cq2 = coalesce(n.cq2, o.cq2),
  cq3 = coalesce(n.cq3, o.cq3),
  cq4 = coalesce(n.cq4, o.cq4),
  cq5 = coalesce(n.cq5, o.cq5),
  extra_cq = coalesce(o.extra_cq, '{}'::jsonb) || coalesce(n.extra_cq, '{}'::jsonb)
from public.leads o
where n.campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49'
  and o.campaign_id = n.campaign_id
  and n.import_batch = 'cdr_v1'
  and o.import_batch is null
  and lower(trim(o.email)) = lower(trim(n.email));

-- ---------------------------------------------------------------------------
-- 2b) SIC / NAICS from the sheet (SIC Code, NAICS Code, NAICS Code Link columns;
--     SIC Code Link is "-" for every lead). Also fills leads inserted by an
--     earlier run of this script.
-- ---------------------------------------------------------------------------
with codes (email, sic_code, naics_code, naics_code_link) as (
  values
  ('peter.quiring@magna.com', '371', '423', 'https://rocketreach.co/magna-international-profile_b5c62c55f42e0ca7'),
  ('mgomes@ll.mit.edu', '821', '6111', 'https://rocketreach.co/the-mit-e-network-profile_b451efcefc77bf56'),
  ('wayne.cook@phoenix.gov', '91', '9211', 'https://rocketreach.co/city-of-phoenix-profile_b5c633aef42e0c5d'),
  ('tyler.derr@broadridge.com', '737', '522', 'https://rocketreach.co/broadridge-profile_b5c637e8f42e0ca3'),
  ('arreese@augusta.edu', '82', '611310', 'https://rocketreach.co/augusta-university-profile_b5ea5de3f42e791e'),
  ('ahmad.awad@dana.com', '371', '33', 'https://rocketreach.co/dana-auto-corp-profile_b5c60a33f42e0c52'),
  ('rchennareddy@primehealthcare.com', '8099', '621999', 'https://siccode.com/business/prime-healthcare-services-inc'),
  ('rly@dhs.lacounty.gov', '8011', '621111', 'https://siccode.com/business/l-a-care-health-plan'),
  ('ray.odiase@floridablue.com', '6411', '524210', 'https://siccode.com/business/florida-blue'),
  ('thoagland@ent.com', '60', '52', 'https://rocketreach.co/ent-credit-union-profile_b5c69573f42e0c99'),
  ('cbeasley@firsthealth.org', '80', '622', 'https://rocketreach.co/firsthealth-of-the-carolinas-profile_b5c6ee1df42e0cdc'),
  ('lmoore@langleyfcu.org', '606', '522130', 'https://rocketreach.co/langley-federal-credit-union-profile_b5c6e072f42e0d23'),
  ('sehar.babar@buzzfeed.com', '2741', '511199', 'https://siccode.com/business/buzzfeed'),
  ('gramachandra@firsthorizon.com', '60', '5221', 'https://rocketreach.co/first-horizon-bank-profile_b5c47f9cf42e0dfc'),
  ('scott_hauch@cargill.com', '2099', '311999', 'https://siccode.com/business/cargill-inc'),
  ('todd.russell@oneok.com', '49', '22', 'https://rocketreach.co/oneok-profile_b5c69a1ef42e0c96'),
  ('eharper@firsthealth.org', '80', '622', 'https://rocketreach.co/firsthealth-of-the-carolinas-profile_b5c6ee1df42e0cdc'),
  ('harry.defendini@nyulangone.org', '8011', '621112', 'https://siccode.com/business/nyu-langone-medical-center-6'),
  ('mike.burkey@tn.gov', '919', '921', 'https://rocketreach.co/state-of-tennessee-profile_b5c6024bf42e0c55'),
  ('brianhinds@shellpoint.org', '836', '6233', 'https://rocketreach.co/shell-point-retirement-community-profile_b5c45913f42e0deb')
)
update public.leads l
set
  sic_code        = c.sic_code,
  naics_code      = c.naics_code,
  naics_code_link = c.naics_code_link
from codes c
where l.campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49'
  and l.import_batch = 'cdr_v1'
  and lower(trim(l.email)) = c.email;

-- ---------------------------------------------------------------------------
-- 3) Call logs for the new leads (replaced on every run)
-- ---------------------------------------------------------------------------
delete from public.call_logs where source = 'cdr_v1';

with calls (email, seq, caller_name, did_number, call_ts, duration_text, disposition) as (
  values
  ('peter.quiring@magna.com', 1, 'Beth', '12254972062', '2026-09-15 14:24:17', '00:28:08', 'VM'),
  ('peter.quiring@magna.com', 2, 'Marco', '12254972062', '2026-09-15 15:36:42', '03:37:02', 'Scored'),

  ('mgomes@ll.mit.edu', 1, 'Remo', '12254972062', '2026-09-15 10:07:35', '00:23:00', 'VM'),
  ('mgomes@ll.mit.edu', 2, 'Muskan', '12254972062', '2026-09-15 10:54:13', '00:20:00', 'VM'),
  ('mgomes@ll.mit.edu', 3, 'Ryan', '13083592901', '2026-09-15 11:55:28', '00:17:01', 'VM'),
  ('mgomes@ll.mit.edu', 4, 'Liam', '12094432412', '2026-09-15 16:44:05', '03:39:01', 'Scored'),

  ('wayne.cook@phoenix.gov', 1, 'Muskan', '12254972062', '2026-09-15 15:47:12', '00:43:00', 'VM'),
  ('wayne.cook@phoenix.gov', 2, 'Alice', '12094432412', '2026-09-17 13:18:57', '03:18:02', 'Scored'),

  ('tyler.derr@broadridge.com', 1, 'Muskan', '12313965351', '2026-09-17 11:34:09', '00:38:00', 'VM'),
  ('tyler.derr@broadridge.com', 2, 'Shahaid', '12254972062', '2026-09-17 09:51:26', '02:41:01', 'Scored'),

  ('arreese@augusta.edu', 1, 'Ryan', '17196549094', '2026-09-15 09:42:18', '00:34:00', 'VM'),
  ('arreese@augusta.edu', 2, 'Tony', '13083592901', '2026-09-15 14:57:08', '00:16:00', 'VM'),
  ('arreese@augusta.edu', 3, 'Tony', '12094432412', '2026-09-17 10:16:29', '02:53:08', 'Scored'),

  ('ahmad.awad@dana.com', 1, 'Shahaid', '12094432412', '2026-09-17 13:27:16', '02:36:03', 'Scored'),

  ('rchennareddy@primehealthcare.com', 1, 'Jasmine', '13083592901', '2026-09-18 16:08:34', '03:50:07', 'Scored'),

  ('rly@dhs.lacounty.gov', 1, 'Ryan', '17196549094', '2026-09-15 12:18:54', '00:43:00', 'VM'),
  ('rly@dhs.lacounty.gov', 2, 'Tony', '17196549094', '2026-09-17 11:43:35', '00:33:00', 'VM'),
  ('rly@dhs.lacounty.gov', 3, 'Alwyn', '12254972062', '2026-09-18 13:34:11', '03:04:08', 'Scored'),

  ('ray.odiase@floridablue.com', 1, 'Shahaid', '12094432412', '2026-09-17 10:48:27', '00:27:00', 'VM'),
  ('ray.odiase@floridablue.com', 2, 'Muskan', '12094432412', '2026-09-17 16:21:49', '00:11:00', 'VM'),
  ('ray.odiase@floridablue.com', 3, 'Shahaid', '12094432412', '2026-09-17 14:35:26', '00:45:00', 'VM'),
  ('ray.odiase@floridablue.com', 4, 'Shahaid', '12254972062', '2026-09-17 16:13:52', '02:35:03', 'Scored'),

  ('thoagland@ent.com', 1, 'Ryan', '12094432412', '2026-09-18 14:41:43', '00:47:00', 'VM'),
  ('thoagland@ent.com', 2, 'Tony', '12094432412', '2026-09-18 12:06:31', '02:56:06', 'Scored'),

  ('cbeasley@firsthealth.org', 1, 'Shahaid', '13083592901', '2026-09-21 11:16:42', '02:19:09', 'Scored'),

  ('lmoore@langleyfcu.org', 1, 'Liam', '12254972062', '2026-09-15 15:03:29', '00:54:00', 'VM'),
  ('lmoore@langleyfcu.org', 2, 'Beth', '12254972062', '2026-09-17 10:31:44', '00:45:00', 'VM'),
  ('lmoore@langleyfcu.org', 3, 'Tony', '12094432412', '2026-09-21 11:27:58', '02:49:07', 'Scored'),

  ('sehar.babar@buzzfeed.com', 1, 'Zoro', '12094432412', '2026-09-17 12:41:23', '00:25:00', 'VM'),
  ('sehar.babar@buzzfeed.com', 2, 'Muskan', '12254972062', '2026-09-18 15:12:27', '00:34:00', 'VM'),
  ('sehar.babar@buzzfeed.com', 3, 'Alwyn', '12254972062', '2026-09-21 13:11:24', '03:28:04', 'Scored'),

  ('gramachandra@firsthorizon.com', 1, 'Ryan', '12254972062', '2026-09-15 10:23:51', '00:13:00', 'VM'),
  ('gramachandra@firsthorizon.com', 2, 'James', '12254972062', '2026-09-15 13:52:19', '00:17:00', 'VM'),
  ('gramachandra@firsthorizon.com', 3, 'Shahaid', '12094432412', '2026-09-21 15:58:37', '02:14:09', 'Scored'),

  ('scott_hauch@cargill.com', 1, 'James', '12254972062', '2026-09-17 16:32:48', '00:14:00', 'VM'),
  ('scott_hauch@cargill.com', 2, 'Shahaid', '13083592901', '2026-09-21 11:08:46', '02:22:07', 'Scored'),

  ('todd.russell@oneok.com', 1, 'Alwyn', '17196549094', '2026-09-23 13:46:38', '03:29:07', 'Scored'),

  ('eharper@firsthealth.org', 1, 'Zoro', '12313965351', '2026-09-15 10:42:16', '00:19:00', 'VM'),
  ('eharper@firsthealth.org', 2, 'Shahaid', '12094432412', '2026-09-15 11:52:36', '00:34:00', 'VM'),
  ('eharper@firsthealth.org', 3, 'Liam', '12254972062', '2026-09-15 14:16:53', '00:12:00', 'VM'),
  ('eharper@firsthealth.org', 4, 'Shahaid', '12254972062', '2026-09-23 12:37:26', '02:28:02', 'Scored'),

  ('harry.defendini@nyulangone.org', 1, 'James', '12313965351', '2026-09-15 14:02:51', '00:02:00', 'VM'),
  ('harry.defendini@nyulangone.org', 2, 'Muskan', '12254972062', '2026-09-17 09:38:17', '00:19:00', 'VM'),
  ('harry.defendini@nyulangone.org', 3, 'Jasmine', '12094432412', '2026-09-23 14:09:45', '03:56:08', 'Scored'),

  ('mike.burkey@tn.gov', 1, 'Beth', '12254972062', '2026-09-17 13:05:47', '00:11:00', 'VM'),
  ('mike.burkey@tn.gov', 2, 'Shahaid', '12094432412', '2026-09-23 12:53:42', '02:10:09', 'Scored'),

  ('brianhinds@shellpoint.org', 1, 'Shahaid', '12254972062', '2026-09-23 15:21:56', '02:43:02', 'Scored')
)
insert into public.call_logs (
  lead_id, agent_id, campaign_id, phone_number, status,
  call_started_at, call_date, call_sequence, caller_name, did_number, disposition,
  duration_text, duration_seconds, source
)
select
  l.id, l.assigned_agent_id, l.campaign_id, l.phone, 'completed',
  c.call_ts::timestamp at time zone 'Asia/Kolkata', c.call_ts::date, c.seq,
  c.caller_name, c.did_number, c.disposition,
  c.duration_text,
  split_part(c.duration_text, ':', 1)::int * 60 + split_part(c.duration_text, ':', 2)::int,
  'cdr_v1'
from calls c
join public.leads l
  on lower(trim(l.email)) = c.email
 and l.import_batch = 'cdr_v1'
 and l.campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49';

-- ---------------------------------------------------------------------------
-- 4) Verify: expect new_leads = 20 (all active), calls = 47, leads_with_calls = 20
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.leads
     where import_batch = 'cdr_v1')                                   as new_leads,
  (select count(*) from public.leads
     where import_batch = 'cdr_v1' and is_active)                     as new_active,
  (select count(*) from public.call_logs where source = 'cdr_v1')     as calls,
  (select count(distinct lead_id) from public.call_logs
     where source = 'cdr_v1')                                         as leads_with_calls,
  (select min(lead_id) || ' .. ' || max(lead_id) from public.leads
     where import_batch = 'cdr_v1')                                   as new_lead_ids,
  (select count(*) from public.leads
     where import_batch = 'cdr_v1' and sic_code is not null
       and naics_code is not null)                                    as with_sic_naics;

-- ---------------------------------------------------------------------------
-- OPTIONAL: show only the new leads in the Leads table (deactivate the older 20).
-- Uncomment and run separately, or do it on the Lead Activation page instead.
-- ---------------------------------------------------------------------------
-- update public.leads
-- set is_active = false
-- where campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49'
--   and import_batch is null;
