-- ============================================================
-- 08 — CLIENT CONTACTS + LEGAL AREA
-- ============================================================

-- Add legal area to clients
alter table public.clients add column if not exists legal_area text;

-- Multiple contacts per client (phones and emails)
create table public.client_contacts (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  type       text not null check (type in ('phone', 'email')),
  value      text not null,
  label      text,            -- e.g. "Celular", "Trabalho", "WhatsApp"
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_client_contacts_client_id on public.client_contacts(client_id);
create index idx_client_contacts_primary   on public.client_contacts(client_id, is_primary) where is_primary = true;

alter table public.client_contacts enable row level security;
create policy "auth_full" on public.client_contacts
  for all using (auth.role() = 'authenticated');
