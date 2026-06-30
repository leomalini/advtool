-- ============================================================
-- 06 — ACTIVITIES (feed global)
-- ============================================================

create table public.activities (
  id            uuid primary key default gen_random_uuid(),
  type          text not null,
  entity_type   text not null check (entity_type in ('lead', 'client', 'task', 'event')),
  entity_id     uuid not null,
  entity_title  text not null,
  actor_id      uuid not null references public.profiles(id),
  metadata      jsonb default '{}',
  created_at    timestamptz not null default now()
);

create index idx_activities_created_at on public.activities(created_at desc);
create index idx_activities_actor_id   on public.activities(actor_id);

alter table public.activities enable row level security;
create policy "auth_full" on public.activities
  for all using (auth.role() = 'authenticated');
