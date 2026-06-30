-- ============================================================
-- 04 — EVENTS (Agenda)
-- ============================================================

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  type         text not null check (type in ('meeting', 'hearing', 'deadline', 'appointment')),
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  all_day      boolean not null default false,
  client_id    uuid references public.clients(id),
  lead_id      uuid references public.leads(id),
  assigned_to  uuid not null references public.profiles(id),
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint chk_event_dates check (end_at >= start_at)
);

create index idx_events_start_at    on public.events(start_at);
create index idx_events_assigned_to on public.events(assigned_to);

create trigger set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;
create policy "auth_full" on public.events
  for all using (auth.role() = 'authenticated');
