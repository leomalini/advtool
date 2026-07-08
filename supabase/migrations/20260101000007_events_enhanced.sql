-- ============================================================
-- 07 — EVENTS ENHANCED (novos campos + tabelas)
-- ============================================================

-- Novos campos na tabela events
alter table public.events
  add column if not exists process_number            text,
  add column if not exists location                  text,
  add column if not exists fatal_deadline            timestamptz,
  add column if not exists show_in_agenda            boolean not null default true,
  add column if not exists inform_end                boolean not null default false,
  add column if not exists is_important              boolean not null default false,
  add column if not exists is_urgent                 boolean not null default false,
  add column if not exists is_future                 boolean not null default false,
  add column if not exists is_recurring              boolean not null default false,
  add column if not exists recurrence_type           text check (recurrence_type in ('daily', 'weekly', 'biweekly', 'monthly', 'yearly')),
  add column if not exists is_retroactive            boolean not null default false,
  add column if not exists retroactive_completed_at  date;

-- Responsáveis múltiplos (junction table)
create table if not exists public.event_assignees (
  event_id    uuid not null references public.events(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (event_id, profile_id)
);

alter table public.event_assignees enable row level security;
create policy "auth_full" on public.event_assignees
  for all using (auth.role() = 'authenticated');

-- Anexos de eventos
create table if not exists public.event_attachments (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  file_name    text not null,
  file_path    text not null,
  file_size    bigint not null,
  file_type    text not null,
  uploaded_by  uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

alter table public.event_attachments enable row level security;
create policy "auth_full" on public.event_attachments
  for all using (auth.role() = 'authenticated');

create index if not exists idx_event_assignees_event_id   on public.event_assignees(event_id);
create index if not exists idx_event_attachments_event_id on public.event_attachments(event_id);
