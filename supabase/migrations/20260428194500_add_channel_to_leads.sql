alter table public.leads
add column if not exists channel text;

alter table public.leads
alter column channel drop not null;

alter table public.leads
alter column channel drop default;

update public.leads
set channel = null
where channel = 'Email and Telemarketing';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_channel_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_channel_check
      check (channel is null or channel in ('Email', 'Telemarketing'));
  end if;
end $$;
