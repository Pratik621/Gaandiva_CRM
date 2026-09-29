-- ============================================================================
-- Raw dialer CDR (call detail records) imported by agents from Excel / CSV.
-- Call Logs DB only (prznqqynlihqpgixjwkb). Shown on /agent/call-logs/cdr.
-- Columns follow the dialer export header:
--   calldate calldate_US_Eastern clid src dst dcontext channel dstchannel lastapp
--   lastdata duration billsec disposition amaflags accountcode uniqueid userfield
--   did cnum cnam outbound_cnum outbound_cnam dst_cnam recordingfile linkedid
--   peeraccount sequence
-- Re-importing the same file does not duplicate rows (unique per agent +
-- uniqueid + sequence). Safe to re-run.
-- ============================================================================

create table if not exists public.cdr_records (
  id                   uuid primary key default gen_random_uuid(),
  agent_id             uuid not null,          -- users.id in main DB (who imported)
  import_batch_id      uuid,
  calldate             timestamp,              -- as written in the file (no timezone)
  calldate_us_eastern  timestamp,
  clid                 text,
  src                  text,
  dst                  text,
  dcontext             text,
  channel              text,
  dstchannel           text,
  lastapp              text,
  lastdata             text,
  duration             integer,                -- seconds
  billsec              integer,                -- seconds
  disposition          text,
  amaflags             text,
  accountcode          text,
  uniqueid             text,
  userfield            text,
  did                  text,
  cnum                 text,
  cnam                 text,
  outbound_cnum        text,
  outbound_cnam        text,
  dst_cnam             text,
  recordingfile        text,
  linkedid             text,
  peeraccount          text,
  sequence             text,
  created_at           timestamptz not null default now()
);

-- Dedupe key for re-imports (rows without uniqueid are always inserted).
create unique index if not exists cdr_records_agent_uniqueid_seq_key
  on public.cdr_records (agent_id, uniqueid, sequence);

create index if not exists cdr_records_agent_calldate_idx
  on public.cdr_records (agent_id, calldate desc);

-- Server (secret key) only.
alter table public.cdr_records enable row level security;

-- Verify
select count(*) as cdr_rows from public.cdr_records;
