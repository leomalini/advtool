-- ============================================================
-- 05 — TASKS + COMMENTS + CHECKLIST
-- ============================================================

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  status       text not null default 'todo' check (status in ('todo', 'in_progress', 'waiting', 'done')),
  priority     text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  assigned_to  uuid references public.profiles(id),
  client_id    uuid references public.clients(id),
  lead_id      uuid references public.leads(id),
  due_date     date,
  position     integer not null default 0,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_tasks_status      on public.tasks(status);
create index idx_tasks_assigned_to on public.tasks(assigned_to);
create index idx_tasks_due_date    on public.tasks(due_date);

create trigger set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;
create policy "auth_full" on public.tasks
  for all using (auth.role() = 'authenticated');

-- Task Comments
create table public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  author_id   uuid not null references public.profiles(id),
  content     text not null,
  created_at  timestamptz not null default now()
);

alter table public.task_comments enable row level security;
create policy "auth_full" on public.task_comments
  for all using (auth.role() = 'authenticated');

-- Task Checklist Items
create table public.task_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  title       text not null,
  is_done     boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.task_checklist_items enable row level security;
create policy "auth_full" on public.task_checklist_items
  for all using (auth.role() = 'authenticated');
