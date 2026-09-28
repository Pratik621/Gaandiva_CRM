-- Audit & Lead Information – Complete Fields
-- Adds all fields from the Audit & Lead Information spec

-- Contact Person Details
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS salutation text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS domain text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone_number_link text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS job_title_link text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tenurity text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS vv_status text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email_status text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ev_tool text;

-- Company Information
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS see_all_employees text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS employee_size_link text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS company_website_link text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sic_code text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sic_code_link text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS naics_code text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS naics_code_link text;

-- QA & Call Details
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ra_comment text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS special_comments text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS call_back text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS call_notes text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS primary_reason text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS secondary_reason text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS qa_comments text;

-- Compliance / Quality Checks
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cq1 text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cq2 text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cq3 text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cq4 text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cq5 text;

-- Audit Information
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS audit_date date;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS qa_name text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS asset_title text;
