alter table public.leads
add column if not exists delivery_status text not null default 'not_delivered';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_delivery_status_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_delivery_status_check
      check (delivery_status in ('not_delivered', 'delivered'));
  end if;
end $$;

update public.leads
set delivery_status = 'not_delivered'
where delivery_status is null;
