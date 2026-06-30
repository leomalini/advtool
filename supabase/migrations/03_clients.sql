-- ============================================================
-- 03 — CLIENTS + ATTACHMENTS
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

create index idx_clients_type       on public.clients(type);
create index idx_clients_created_at on public.clients(created_at desc);

create trigger set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

alter table public.clients enable row level security;
create policy "auth_full" on public.clients
  for all using (auth.role() = 'authenticated');

-- Client Attachments
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

alter table public.client_attachments enable row level security;
create policy "auth_full" on public.client_attachments
  for all using (auth.role() = 'authenticated');
