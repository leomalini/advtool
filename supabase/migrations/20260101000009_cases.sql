-- ============================================================
-- 09 — CASES + CASE MOVEMENTS
-- ============================================================

create table public.cases (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid references public.clients(id) on delete set null,
  title             text,
  cnj_number        text,
  court             text,
  court_division    text,
  legal_area        text,
  workflow_id       text not null,
  column_id         text not null,
  position          integer not null default 0,
  assigned_to       uuid references public.profiles(id) on delete set null,
  tags              text[] not null default '{}',
  next_deadline     date,
  next_task_summary text,
  plaintiff         text,
  defendant         text,
  opposing_counsel  text,
  notes             text,
  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_cases_client_id   on public.cases(client_id);
create index idx_cases_workflow_id  on public.cases(workflow_id);
create index idx_cases_column_id    on public.cases(column_id);
create index idx_cases_assigned_to  on public.cases(assigned_to);
create index idx_cases_next_deadline on public.cases(next_deadline);
create index idx_cases_created_at   on public.cases(created_at desc);

create trigger set_updated_at before update on public.cases
  for each row execute function public.set_updated_at();

alter table public.cases enable row level security;
create policy "auth_full" on public.cases
  for all using (auth.role() = 'authenticated');

-- ── Case Movements (intimações / movimentações processuais) ──────────────────

create table public.case_movements (
  id             uuid primary key default gen_random_uuid(),
  case_id        uuid not null references public.cases(id) on delete cascade,
  movement_date  timestamptz not null,
  description    text not null,
  source         text not null default 'manual'
                   check (source in ('manual', 'busca_processos')),
  raw_data       jsonb,
  created_at     timestamptz not null default now()
);

create index idx_case_movements_case_id       on public.case_movements(case_id);
create index idx_case_movements_movement_date on public.case_movements(movement_date desc);

alter table public.case_movements enable row level security;
create policy "auth_full" on public.case_movements
  for all using (auth.role() = 'authenticated');

-- ── Add case_id FK to existing tables ────────────────────────────────────────

alter table public.tasks
  add column if not exists case_id uuid references public.cases(id) on delete set null;

create index if not exists idx_tasks_case_id on public.tasks(case_id);

alter table public.events
  add column if not exists case_id uuid references public.cases(id) on delete set null;

create index if not exists idx_events_case_id on public.events(case_id);
