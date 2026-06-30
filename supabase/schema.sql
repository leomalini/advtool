-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  avatar_url  text,
  role        text not null default 'attorney' check (role in ('admin', 'attorney')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- LEAD STAGES
-- ============================================================
create table public.lead_stages (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  slug      text not null unique,
  color     text not null,
  position  integer not null,
  is_lost   boolean not null default false
);

insert into public.lead_stages (name, slug, color, position, is_lost) values
  ('Novo Lead',          'novo-lead',          '#6366f1', 1, false),
  ('Contato Realizado',  'contato-realizado',  '#8b5cf6', 2, false),
  ('Reunião Agendada',   'reuniao-agendada',   '#06b6d4', 3, false),
  ('Proposta Enviada',   'proposta-enviada',   '#f59e0b', 4, false),
  ('Contrato Assinado',  'contrato-assinado',  '#10b981', 5, false),
  ('Cliente Ativo',      'cliente-ativo',      '#059669', 6, false),
  ('Perdido',            'perdido',            '#ef4444', 7, true);

-- ============================================================
-- LEADS
-- ============================================================
create table public.leads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  email       text,
  origin      text check (origin in ('google_ads', 'instagram', 'facebook', 'organic', 'referral')),
  stage_id    uuid not null references public.lead_stages(id),
  position    integer not null default 0,
  assigned_to uuid references public.profiles(id),
  notes       text,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_leads_stage_id on public.leads(stage_id);
create index idx_leads_assigned_to on public.leads(assigned_to);
create index idx_leads_created_at on public.leads(created_at desc);

-- ============================================================
-- LEAD MOVEMENTS
-- ============================================================
create table public.lead_movements (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  from_stage_id   uuid references public.lead_stages(id),
  to_stage_id     uuid not null references public.lead_stages(id),
  moved_by        uuid not null references public.profiles(id),
  notes           text,
  created_at      timestamptz not null default now()
);

create index idx_lead_movements_lead_id on public.lead_movements(lead_id);

-- ============================================================
-- LEAD COMMENTS
-- ============================================================
create table public.lead_comments (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  author_id   uuid not null references public.profiles(id),
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_lead_comments_lead_id on public.lead_comments(lead_id);

-- ============================================================
-- CLIENTS
-- ============================================================
create table public.clients (
  id                   uuid primary key default gen_random_uuid(),
  type                 text not null check (type in ('individual', 'company')),
  name                 text,
  cpf                  text,
  company_name         text,
  trade_name           text,
  cnpj                 text,
  contact_person       text,
  phone                text,
  email                text,
  address_street       text,
  address_number       text,
  address_complement   text,
  address_neighborhood text,
  address_city         text,
  address_state        text,
  address_zip          text,
  notes                text,
  lead_id              uuid references public.leads(id),
  assigned_to          uuid references public.profiles(id),
  created_by           uuid not null references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint chk_individual check (type != 'individual' or name is not null),
  constraint chk_company    check (type != 'company' or company_name is not null)
);

create index idx_clients_type on public.clients(type);
create index idx_clients_created_at on public.clients(created_at desc);

-- ============================================================
-- CLIENT ATTACHMENTS
-- ============================================================
create table public.client_attachments (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  file_name    text not null,
  file_path    text not null,
  file_size    bigint not null,
  file_type    text not null,
  uploaded_by  uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

create index idx_client_attachments_client_id on public.client_attachments(client_id);

-- ============================================================
-- EVENTS
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

create index idx_events_start_at on public.events(start_at);
create index idx_events_assigned_to on public.events(assigned_to);

-- ============================================================
-- TASKS
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

create index idx_tasks_status on public.tasks(status);
create index idx_tasks_assigned_to on public.tasks(assigned_to);
create index idx_tasks_due_date on public.tasks(due_date);

-- ============================================================
-- TASK COMMENTS
-- ============================================================
create table public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  author_id   uuid not null references public.profiles(id),
  content     text not null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- TASK CHECKLIST ITEMS
-- ============================================================
create table public.task_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  title       text not null,
  is_done     boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- ACTIVITIES
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
create index idx_activities_actor_id on public.activities(actor_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.leads for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.lead_comments for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.events for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tasks for each row execute function public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.leads              enable row level security;
alter table public.lead_stages        enable row level security;
alter table public.lead_movements     enable row level security;
alter table public.lead_comments      enable row level security;
alter table public.clients            enable row level security;
alter table public.client_attachments enable row level security;
alter table public.events             enable row level security;
alter table public.tasks              enable row level security;
alter table public.task_comments      enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.activities         enable row level security;

create policy "auth_full" on public.profiles           for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.leads              for all using (auth.role() = 'authenticated');
create policy "auth_read" on public.lead_stages        for select using (auth.role() = 'authenticated');
create policy "auth_full" on public.lead_movements     for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.lead_comments      for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.clients            for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.client_attachments for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.events             for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.tasks              for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.task_comments      for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.task_checklist_items for all using (auth.role() = 'authenticated');
create policy "auth_full" on public.activities         for all using (auth.role() = 'authenticated');

-- ============================================================
-- STORAGE
-- ============================================================
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false);

create policy "auth_upload"  on storage.objects for insert with check (bucket_id = 'attachments' and auth.role() = 'authenticated');
create policy "auth_read"    on storage.objects for select using (bucket_id = 'attachments' and auth.role() = 'authenticated');
create policy "auth_delete"  on storage.objects for delete using (bucket_id = 'attachments' and auth.role() = 'authenticated');
