-- ============================================================================
-- Leads table for the Call Logs DB (prznqqynlihqpgixjwkb)
-- Run ONLY in the Call Logs project's SQL Editor. The main Gaandiva DB is not
-- touched. Columns mirror main public.leads (built from supabase/migrations),
-- without foreign keys since users/campaigns/organizations live in main DB.
-- ============================================================================

create table if not exists public.leads (
  id                        uuid primary key default gen_random_uuid(),
  lead_id                   text,
  organization_id           uuid not null,          -- organizations.id in main DB
  campaign_id               uuid not null,          -- campaigns.id in main DB
  assigned_agent_id         uuid,                   -- users.id in main DB
  created_by                uuid,
  creator_display_name      text,
  status                    text not null default 'new',
  lead_type                 text,
  lead_tagging              text,
  lead_disposition          text,
  channel                   text default 'email',
  consent_status            text default 'pending',

  -- Contact
  salutation                text,
  name                      text,
  first_name                text,
  last_name                 text,
  email                     text,
  email_status              text,
  ev_tool                   text,
  phone                     text,
  direct_number             text,
  phone_number_link         text,
  job_title                 text,
  job_title_link            text,
  job_function              text,
  job_level                 text,
  department                text,
  tenurity                  text,
  vv_status                 text,
  contact_linkedin_url      text,

  -- Company
  company_name              text,
  domain                    text,
  company_number            text,
  company_website_link      text,
  company_linkedin_url      text,
  address                   text,
  address2                  text,
  address_link              text,
  city                      text,
  state                     text,
  country                   text,
  zip_code                  text,
  industry                  text,
  industry_type_link        text,
  employee_size             text,
  actual_employee_size      text,
  employee_size_link        text,
  see_all_employees         text,
  founded_years             integer,
  founded_years_link        text,
  revenue_range             text,
  revenue_link              text,
  sic_code                  text,
  sic_code_link             text,
  naics_code                text,
  naics_code_link           text,

  -- Call / notes
  call_back                 text,
  call_notes                text,
  notes                     text,
  followup_date             date,
  ra_comment                text,
  special_comments          text,
  primary_reason            text,
  secondary_reason          text,

  -- Custom questions
  cq1                       text,
  cq2                       text,
  cq3                       text,
  cq4                       text,
  cq5                       text,
  extra_cq                  jsonb not null default '{}'::jsonb,

  -- Scored / appointment
  scored                    timestamptz,
  scored_timezone           text,
  appointment               timestamptz,
  appointment_timezone      text,

  -- QA
  qa_status                 text,
  qa_name                   text,
  qa_comments               text,
  qa_audited_by_id          uuid,
  qa_audited_at             timestamptz,
  audit_date                date,
  asset_title               text,
  asset_title2              text,
  disqualification_reasons  text,
  disqualification_reason   text,
  rectified_reason          text,
  rectification_status      text,
  rectification_qa_name     text,
  rectification_date        date,
  dq_reason_code            varchar(100),

  -- Delivery / billing
  delivery_status           text not null default 'not_delivered',
  delivery_remark           text,
  billable_status           text,

  -- Misc
  risk_flags                jsonb default '[]'::jsonb,
  rep_id                    uuid,
  wa_thread_id              text,
  ingested_at               timestamptz,
  qualified_at              timestamptz,
  registered_at             timestamptz,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists leads_campaign_agent_idx
  on public.leads (campaign_id, assigned_agent_id, created_at desc);
create index if not exists leads_lead_id_idx on public.leads (lead_id);
create index if not exists leads_email_idx on public.leads (lower(email));

-- Keep updated_at fresh on every update.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- Server (secret key) only, same as call_logs.
alter table public.leads enable row level security;

-- Verify
select count(*) as leads_rows from public.leads;
