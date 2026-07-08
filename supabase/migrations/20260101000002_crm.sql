-- ============================================================
-- 02 — CRM (lead_stages, leads, lead_movements, lead_comments)
-- ============================================================

-- Lead Stages
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

alter table public.lead_stages enable row level security;
create policy "auth_read" on public.lead_stages
  for select using (auth.role() = 'authenticated');

-- Leads
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

create index idx_leads_stage_id    on public.leads(stage_id);
create index idx_leads_assigned_to on public.leads(assigned_to);
create index idx_leads_created_at  on public.leads(created_at desc);

create trigger set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

alter table public.leads enable row level security;
create policy "auth_full" on public.leads
  for all using (auth.role() = 'authenticated');

-- Lead Movements
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

alter table public.lead_movements enable row level security;
create policy "auth_full" on public.lead_movements
  for all using (auth.role() = 'authenticated');

-- Lead Comments
create table public.lead_comments (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  author_id   uuid not null references public.profiles(id),
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_lead_comments_lead_id on public.lead_comments(lead_id);

create trigger set_updated_at before update on public.lead_comments
  for each row execute function public.set_updated_at();

alter table public.lead_comments enable row level security;
create policy "auth_full" on public.lead_comments
  for all using (auth.role() = 'authenticated');
