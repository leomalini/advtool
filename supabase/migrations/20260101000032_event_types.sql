-- ============================================================
-- 32 — Tipos de evento configuráveis
--
-- Até aqui o tipo era um CHECK fechado em `events.type` com quatro valores.
-- Cada escritório tem os seus (perícia, sustentação oral, plantão…), e um CHECK
-- só muda por migration — o que na prática significa que não muda.
--
-- O id continua sendo TEXT e os quatro tipos atuais mantêm exatamente os
-- mesmos slugs: assim nenhuma linha de `events` precisa ser reescrita, e a FK
-- passa a valer sobre os dados como estão. Mesmo desenho de `workflows`
-- (migration 12), que já usa id textual gerado na aplicação.
-- ============================================================

create table if not exists public.event_types (
  id         text primary key,
  label      text not null,
  color      text not null default '#6366f1',
  /** Ordem na legenda e nos seletores. */
  position   integer not null default 0,
  /** Os quatro originais. Não impede exclusão — serve para a UI explicar de
   * onde vieram e para o seed ser idempotente. */
  is_system  boolean not null default false,
  created_at timestamptz not null default now()
);

-- Seed dos tipos que já existiam, com as cores que a UI usava fixas no código.
insert into public.event_types (id, label, color, position, is_system) values
  ('meeting',     'Reunião',     '#6366f1', 0, true),
  ('hearing',     'Audiência',   '#ef4444', 1, true),
  ('deadline',    'Prazo',       '#f59e0b', 2, true),
  ('appointment', 'Compromisso', '#10b981', 3, true)
on conflict (id) do nothing;

alter table public.event_types enable row level security;
drop policy if exists "auth_full" on public.event_types;
create policy "auth_full" on public.event_types
  for all using (auth.role() = 'authenticated');

-- O CHECK sai e a FK entra. RESTRICT em vez de CASCADE: apagar um tipo não
-- pode levar junto os eventos que o usam — a tela bloqueia a exclusão e diz
-- quantos eventos dependem dele.
alter table public.events
  drop constraint if exists events_type_check;

alter table public.events
  drop constraint if exists events_type_fkey;
alter table public.events
  add constraint events_type_fkey
  foreign key (type) references public.event_types(id) on delete restrict;

create index if not exists idx_events_type on public.events(type);
