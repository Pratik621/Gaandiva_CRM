-- ============================================================
-- Notifications table
-- Real-time, role-based notification system for Gandiv CRM
-- ============================================================

create table if not exists public.notifications (
  id             uuid        not null default gen_random_uuid() primary key,
  title          text        not null,
  message        text        not null,
  type           text        not null check (type in ('campaign', 'task', 'lead', 'followup', 'system')),
  sender_id      uuid        references auth.users(id) on delete set null,
  receiver_id    uuid        not null references auth.users(id) on delete cascade,
  reference_type text        check (reference_type in ('campaign', 'lead', 'task', 'deal')),
  reference_id   uuid,
  is_read        boolean     not null default false,
  organization_id uuid       not null references public.organizations(id) on delete cascade,
  created_at     timestamptz not null default now()
);

-- Performance indexes
create index if not exists notifications_receiver_created_idx
  on public.notifications (receiver_id, created_at desc);

create index if not exists notifications_receiver_unread_idx
  on public.notifications (receiver_id, is_read)
  where is_read = false;

-- Row-level security
alter table public.notifications enable row level security;

create policy "Users can read own notifications"
  on public.notifications for select
  using (auth.uid() = receiver_id);

create policy "Users can update own notifications"
  on public.notifications for update
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

-- Service role (admin client) handles all inserts — bypasses RLS
create policy "Service role can insert notifications"
  on public.notifications for insert
  with check (true);

-- Enable Supabase Realtime on this table
alter publication supabase_realtime add table public.notifications;
