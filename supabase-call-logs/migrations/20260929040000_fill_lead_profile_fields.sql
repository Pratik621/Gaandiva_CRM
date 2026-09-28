-- ============================================================================
-- Fill empty contact / company fields on agentone's Freshworks leads
-- Call Logs DB only (prznqqynlihqpgixjwkb). Source: leads-Freshworks-2026-09-28.csv
-- (20 leads). Rows are matched on email within the Freshworks campaign.
-- Only EMPTY fields are filled (null or blank); anything already typed in the
-- drawer is kept. Safe to re-run.
--
-- CSV column              -> leads column
--   Lead Type             -> lead_type
--   salutation            -> salutation
--   job_title             -> job_title
--   job_level             -> job_level
--   department            -> department
--   job_title_link        -> job_title_link
--   email_Id              -> email            (match key, not written)
--   domain                -> domain
--   company_name          -> company_name
--   company_website_link  -> company_website_link
--   Address Line 1        -> address
--   city / state          -> city / state
--   zip_code / country    -> zip_code / country
--   employee_size         -> employee_size
--   industry_Type         -> industry
--   revenue_range         -> revenue_range
--   sic_code              -> sic_code
--   sic_code_link         -> sic_code_link
--   naics_code            -> naics_code
--   naics_code_link       -> naics_code_link
--   asset_title1          -> asset_title
--
-- Blank for every lead in the CSV, so nothing to fill (drawer stays empty):
--   tenurity, vv_status, direct_number, company_number, Address Line 2 (address2),
--   Address Link (address_link), Actual_employee_size, employee_size_link,
--   industry_Type_Link (industry_type_link), revenue_link, Scored / Appointment
--   date + timezone, Lead Tagging, MEETING NOTES, call_back, call_notes,
--   asset_title2, cq4.
-- Not in the CSV at all: founded_years, founded_years_link, company_linkedin_url.
-- Already filled by earlier scripts, not touched here: cq1-cq5 / extra_cq
-- (20260929010000) and QA audit date (20260929020000).
-- Team_Leader_Name / campaign_name have no leads column (they come from the campaign).
-- ============================================================================

with src (
  email, lead_type, salutation, job_title, job_level, department, job_title_link,
  domain, company_name, company_website_link, address, city, state, zip_code, country,
  employee_size, industry, revenue_range, sic_code, sic_code_link, naics_code,
  naics_code_link, asset_title
) as (
  values
  ('brianhinds@shellpoint.org', 'HQL / BANT', 'Mr', 'Chief Information Officer', 'C-Suite / Owner', 'IT', 'https://www.linkedin.com/in/bhinds/',
   'shellpoint.org', 'Shell Point Retirement Community', 'shellpoint.org', '15101 Shell Point Boulevard', 'Fort Myers', 'Florida', '33908', 'United States',
   '1001-5000', 'Hospitals and Health Care', '$154.7 Million', '836', 'https://rocketreach.co/shell-point-retirement-community-profile_b5c45913f42e0deb', '6233',
   'https://rocketreach.co/shell-point-retirement-community-profile_b5c45913f42e0deb', 'Building the Intelligence-Driven IT Organization'),

  ('mike.burkey@tn.gov', 'HQL / BANT', 'Mr', 'Director of IT', 'Director', 'IT', 'https://www.linkedin.com/in/mike-burkey-7b8a09b1',
   'tn.gov', 'State of Tennessee', 'tn.gov', '600 Charlotte Avenue', 'Nashville', 'Tennessee', '37243', 'United States',
   '201-500', 'Government Administration', '$26.1 Billion', '919', 'https://rocketreach.co/state-of-tennessee-profile_b5c6024bf42e0c55', '921',
   'https://rocketreach.co/state-of-tennessee-profile_b5c6024bf42e0c55', 'Building the Intelligence-Driven IT Organization'),

  ('harry.defendini@nyulangone.org', 'HQL / BANT', 'Mr', 'Director of IT', 'Director', 'IT', 'https://www.linkedin.com/in/harry-defendini-1702632/',
   'nyulangone.org', 'Nyu Langone Hospitals', 'nyulangone.org', '240 E 18Th St Ste 21', 'New York City', 'New York', '10003', 'United States',
   '1001-5000', 'Hospitals and Health Care', '$12.8 Billion', '8011', 'https://siccode.com/business/nyu-langone-medical-center-6', '621112',
   'https://siccode.com/business/nyu-langone-medical-center-6', 'Building the Intelligence-Driven IT Organization'),

  ('eharper@firsthealth.org', 'HQL / BANT', 'Mr', 'Director Information Technology Services', 'Director', 'IT', 'https://www.linkedin.com/in/eric-b-harper-2892a31a/',
   'firsthealth.org', 'FirstHealth', 'firsthealth.org', '155 Memorial Drive', 'Pinehurst', 'North Carolina', '28374', 'United States',
   '5001-10000', 'Hospitals and Health Care', '$1.1 Billion', '80', 'https://rocketreach.co/firsthealth-of-the-carolinas-profile_b5c6ee1df42e0cdc', '622',
   'https://rocketreach.co/firsthealth-of-the-carolinas-profile_b5c6ee1df42e0cdc', 'Building the Intelligence-Driven IT Organization'),

  ('todd.russell@oneok.com', 'HQL / BANT', 'Mr', 'IT Manager', 'Manager', 'IT', 'https://www.linkedin.com/in/todd-russell-1745543a/',
   'oneok.com', 'ONEOK', 'oneok.com', '100 W 5Th St', 'Tulsa', 'Oklahoma', '74103', 'United States',
   '5001-10000', 'Oil and Gas', '$39.366 Billion', '49', 'https://rocketreach.co/oneok-profile_b5c69a1ef42e0c96', '22',
   'https://rocketreach.co/oneok-profile_b5c69a1ef42e0c96', 'Building the Intelligence-Driven IT Organization'),

  ('scott_hauch@cargill.com', 'HQL / BANT', 'Mr', 'IT Services Manager', 'Manager', 'IT', 'https://www.linkedin.com/in/scott-hauch-81387114/',
   'cargill.com', 'Cargill', 'cargill.com', '15407 Mcginty Road West', 'Wayzata', 'Minnesota', '55391', 'United States',
   '10,000+', 'Manufacturing', '$164 billion', '2099', 'https://siccode.com/business/cargill-inc', '311999',
   'https://siccode.com/business/cargill-inc', 'Building the Intelligence-Driven IT Organization'),

  ('gramachandra@firsthorizon.com', 'HQL / BANT', 'Mr', 'SVP and Deputy CIO - Core Banking Systems', 'C-Suite / Owner', 'IT', 'https://www.linkedin.com/in/ganeshramachandra',
   'firsthorizon.com', 'First Horizon Corporation', 'firsthorizon.com', '11610 Highway 70', 'Arlington', 'Tennessee', '38002', 'United States',
   '5,001–10,000', 'Financial Services', '$3.50 billion', '60', 'https://rocketreach.co/first-horizon-bank-profile_b5c47f9cf42e0dfc', '5221',
   'https://rocketreach.co/first-horizon-bank-profile_b5c47f9cf42e0dfc', 'Building the Intelligence-Driven IT Organization'),

  ('sehar.babar@buzzfeed.com', 'HQL / BANT', 'Ms', 'IT Manager', 'Manager', 'IT', 'https://www.linkedin.com/in/sehar-babar/',
   'buzzfeed.com', 'BuzzFeed', 'buzzfeed.com', '50 W 23Rd St 6Th Floor New York Ny', 'New York City', 'New York', '10010', 'United States',
   '201–500', 'Technology', '$170.7 Million', '2741', 'https://siccode.com/business/buzzfeed', '511199',
   'https://siccode.com/business/buzzfeed', 'Building the Intelligence-Driven IT Organization'),

  ('lmoore@langleyfcu.org', 'HQL / BANT', 'Mr', 'Director of IT Operations', 'Director', 'IT', 'https://www.linkedin.com/in/lindsey-moore-csm-cspo-995317a5',
   'langleyfcu.org', 'Langley Federal Credit Union', 'langleyfcu.org', '11742 Jefferson Ave', 'Newport News', 'Virginia', '23606', 'United States',
   '501–1,000', 'Financial Services', '$500M - $1B', '606', 'https://rocketreach.co/langley-federal-credit-union-profile_b5c6e072f42e0d23', '522130',
   'https://rocketreach.co/langley-federal-credit-union-profile_b5c6e072f42e0d23', 'Building the Intelligence-Driven IT Organization'),

  ('cbeasley@firsthealth.org', 'HQL / BANT', 'Mr', 'VP, Chief Information Officer', 'VP / Vice President', 'IT', 'https://www.linkedin.com/in/chriscbeasley/',
   'firsthealth.org', 'FirstHealth', 'firsthealth.org', '155 Memorial Drive', 'Pinehurst', 'North Carolina', '28374', 'United States',
   '5,001–10,000', 'Healthcare / Life Sciences', '$500M - $1B', '80', 'https://rocketreach.co/firsthealth-of-the-carolinas-profile_b5c6ee1df42e0cdc', '622',
   'https://rocketreach.co/firsthealth-of-the-carolinas-profile_b5c6ee1df42e0cdc', 'Building the Intelligence-Driven IT Organization'),

  ('thoagland@ent.com', 'HQL / BANT', 'Mr', 'Director, IT Enterprise Architecture', 'Director', 'IT', 'https://www.linkedin.com/in/tom-hoagland-a785bb2',
   'ent.com', 'Ent Credit Union', 'ent.com', '11550 Ent Pkwy', 'Colorado Springs', 'Colorado', '80921', 'United States',
   '1,001–5,000', 'Financial Services', '$594.9 Million', '60', 'https://rocketreach.co/ent-credit-union-profile_b5c69573f42e0c99', '52',
   'https://rocketreach.co/ent-credit-union-profile_b5c69573f42e0c99', 'Building the Intelligence-Driven IT Organization'),

  ('ray.odiase@floridablue.com', 'HQL / BANT', 'Mr', 'Sr. IT Director', 'Director', 'IT', 'https://www.linkedin.com/in/iyoreodiase/',
   'floridablue.com', 'Florida Blue', 'floridablue.com', '4800 Deerwood Campus Parkway', 'Jacksonville', 'Florida', '32246', 'United States',
   '5,001–10,000', 'Financial Services', '$10.1 Billion', '6411', 'https://siccode.com/business/florida-blue', '524210',
   'https://siccode.com/business/florida-blue', 'Building the Intelligence-Driven IT Organization'),

  ('rly@dhs.lacounty.gov', 'HQL / BANT', 'Ms', 'IT Project Manager', 'Manager', 'IT', 'https://www.linkedin.com/in/rosannaly/',
   'dhs.lacounty.gov', 'LA Health Services', 'dhs.lacounty.gov', '313 N Figueroa Street', 'Los Angeles', 'California', '90012', 'United States',
   '10,000+', 'Healthcare / Life Sciences', '$1.4 billion', '8011', 'https://siccode.com/business/l-a-care-health-plan', '621111',
   'https://siccode.com/business/l-a-care-health-plan', 'Building the Intelligence-Driven IT Organization'),

  ('rchennareddy@primehealthcare.com', 'HQL / BANT', 'Mr', 'Chief Information Officer', 'C-Suite / Owner', 'IT', 'https://www.linkedin.com/in/rchennareddy/',
   'primehealthcare.com', 'Prime Healthcare', 'primehealthcare.com', '3480 East Guasti Road', 'Ontario', 'California', '91761', 'United States',
   '10,000+', 'Healthcare / Life Sciences', '$7.3 Billion', '8099', 'https://siccode.com/business/prime-healthcare-services-inc', '621999',
   'https://siccode.com/business/prime-healthcare-services-inc', 'Building the Intelligence-Driven IT Organization'),

  ('ahmad.awad@dana.com', 'HQL / BANT', 'Mr', 'Corp IT Manager', 'Manager', 'IT', 'https://www.linkedin.com/in/ahmad-awad/',
   'dana.com', 'Dana Holding Corporation', 'dana.com', '3939 Technology Drive', 'Maumee', 'Ohio', '43537', 'United States',
   '10001+', 'Motor Vehicle Manufacturing', '$7.5 Billion', '371', 'https://rocketreach.co/dana-auto-corp-profile_b5c60a33f42e0c52', '33',
   'https://rocketreach.co/dana-auto-corp-profile_b5c60a33f42e0c52', 'Building the Intelligence-Driven IT Organization'),

  ('arreese@augusta.edu', 'HQL / BANT', 'Ms', 'Director Of Information Technology', 'Director', 'IT', 'https://www.linkedin.com/in/arijanareese/',
   'augusta.edu', 'Augusta University', 'augusta.edu', '1120 15th Street', 'Augusta', 'Georgia', '30912', 'United States',
   '5001-10000', 'Higher Education', '$1.01 Billion', '82', 'https://rocketreach.co/augusta-university-profile_b5ea5de3f42e791e', '611310',
   'https://rocketreach.co/augusta-university-profile_b5ea5de3f42e791e', 'Building the Intelligence-Driven IT Organization'),

  ('tyler.derr@broadridge.com', 'HQL / BANT', 'Mr', 'Chief Technology Officer', 'C-Level', 'IT', 'https://www.linkedin.com/in/tyler-derr-4b58854/',
   'broadridge.com', 'Broadridge', 'broadridge.com', '605 3rd Avenue', 'New York City', 'New York', '10158', 'United States',
   '10001+', 'Financial Services', '$7.477 Billion', '737', 'https://rocketreach.co/broadridge-profile_b5c637e8f42e0ca3', '522',
   'https://rocketreach.co/broadridge-profile_b5c637e8f42e0ca3', 'Building the Intelligence-Driven IT Organization'),

  ('wayne.cook@phoenix.gov', 'HQL / BANT', 'Mr', 'Information Technology Operations Manager (Municipal Court)', 'Manager', 'IT', 'https://www.linkedin.com/in/wayne-cook-a16068215/',
   'phoenix.gov', 'City of Phoenix', 'phoenix.gov', '200 W Washington Street', 'Phoenix', 'Arizona', '85003', 'United States',
   '10001+', 'Government Administration', '$1.99 Billion', '91', 'https://rocketreach.co/city-of-phoenix-profile_b5c633aef42e0c5d', '9211',
   'https://rocketreach.co/city-of-phoenix-profile_b5c633aef42e0c5d', 'Building the Intelligence-Driven IT Organization'),

  ('mgomes@ll.mit.edu', 'HQL / BANT', 'Mr', 'Director IT', 'Director', 'IT', 'https://www.linkedin.com/in/marco-gomes-9526366/',
   'web.mit.edu', 'Massachusetts Institute of Technology', 'web.mit.edu', '77 Massachusetts Avenue', 'Cambridge', 'Massachusetts', '2139', 'United States',
   '5,001–10,000', 'Education', '$5.37 Billion', '821', 'https://rocketreach.co/the-mit-e-network-profile_b451efcefc77bf56', '6111',
   'https://rocketreach.co/the-mit-e-network-profile_b451efcefc77bf56', 'Building the Intelligence-Driven IT Organization'),

  ('peter.quiring@magna.com', 'HQL / BANT', 'Mr', 'IT/OT Manager', 'Manager', 'IT', 'https://www.linkedin.com/in/peter-quiring-15310962/',
   'magna.com', 'Magna International', 'magna.com', '750 Tower Drive', 'Troy', 'Michigan', '48098', 'United States',
   '10,000+', 'Manufacturing', '$42.01 Billion', '371', 'https://rocketreach.co/magna-international-profile_b5c62c55f42e0ca7', '423',
   'https://rocketreach.co/magna-international-profile_b5c62c55f42e0ca7', 'Building the Intelligence-Driven IT Organization')
)
update public.leads l
set
  lead_type            = coalesce(nullif(trim(l.lead_type), ''),            s.lead_type),
  salutation           = coalesce(nullif(trim(l.salutation), ''),           s.salutation),
  job_title            = coalesce(nullif(trim(l.job_title), ''),            s.job_title),
  job_level            = coalesce(nullif(trim(l.job_level), ''),            s.job_level),
  department           = coalesce(nullif(trim(l.department), ''),           s.department),
  job_title_link       = coalesce(nullif(trim(l.job_title_link), ''),       s.job_title_link),
  domain               = coalesce(nullif(trim(l.domain), ''),               s.domain),
  company_name         = coalesce(nullif(trim(l.company_name), ''),         s.company_name),
  company_website_link = coalesce(nullif(trim(l.company_website_link), ''), s.company_website_link),
  address              = coalesce(nullif(trim(l.address), ''),              s.address),
  city                 = coalesce(nullif(trim(l.city), ''),                 s.city),
  state                = coalesce(nullif(trim(l.state), ''),                s.state),
  zip_code             = coalesce(nullif(trim(l.zip_code), ''),             s.zip_code),
  country              = coalesce(nullif(trim(l.country), ''),              s.country),
  employee_size        = coalesce(nullif(trim(l.employee_size), ''),        s.employee_size),
  industry             = coalesce(nullif(trim(l.industry), ''),             s.industry),
  revenue_range        = coalesce(nullif(trim(l.revenue_range), ''),        s.revenue_range),
  sic_code             = coalesce(nullif(trim(l.sic_code), ''),             s.sic_code),
  sic_code_link        = coalesce(nullif(trim(l.sic_code_link), ''),        s.sic_code_link),
  naics_code           = coalesce(nullif(trim(l.naics_code), ''),           s.naics_code),
  naics_code_link      = coalesce(nullif(trim(l.naics_code_link), ''),      s.naics_code_link),
  asset_title          = coalesce(nullif(trim(l.asset_title), ''),          s.asset_title)
from src s
where lower(trim(l.email)) = lower(s.email)
  and l.campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49';

-- Verify: expect 20 rows with sic_code / naics_code and their links filled
select
  coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), name) as lead,
  email, industry, revenue_range, sic_code, sic_code_link, naics_code, naics_code_link, asset_title
from public.leads
where campaign_id = 'd1476fb9-875b-4cf7-bbc3-8432027abb49'
order by lead;
