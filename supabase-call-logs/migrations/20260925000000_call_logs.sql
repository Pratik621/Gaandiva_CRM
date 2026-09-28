-- Call Logs database (separate Supabase project: prznqqynlihqpgixjwkb)
-- Run in that project's SQL Editor.

create table if not exists public.call_logs (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid not null,          -- leads.id in main Gaandiva DB
  agent_id          uuid not null,          -- auth user id from main Gaandiva DB
  campaign_id       uuid,                   -- campaigns.id in main Gaandiva DB
  phone_number      text,
  call_started_at   timestamptz not null default now(),
  duration_seconds  integer check (duration_seconds is null or duration_seconds >= 0),
  status            text not null default 'completed',
  recording_url     text,
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists call_logs_lead_idx  on public.call_logs (lead_id, call_started_at desc);
create index if not exists call_logs_agent_idx on public.call_logs (agent_id, call_started_at desc);

-- Only the server (secret key) reads/writes; no anon/publishable access.
alter table public.call_logs enable row level security;
