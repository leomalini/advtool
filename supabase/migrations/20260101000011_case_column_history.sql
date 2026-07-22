-- ============================================================
-- 11 — CASE COLUMN HISTORY
-- Rastreia movimentações de colunas no kanban do CRM
-- ============================================================

create table public.case_column_history (
  id             uuid        primary key default gen_random_uuid(),
  case_id        uuid        not null references public.cases(id) on delete cascade,
  from_column_id text,                          -- null = criação do caso
  to_column_id   text        not null,
  moved_by       uuid        references public.profiles(id) on delete set null,
  moved_at       timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index idx_cch_case_id  on public.case_column_history(case_id);
create index idx_cch_moved_at on public.case_column_history(moved_at desc);

alter table public.case_column_history enable row level security;
create policy "auth_full" on public.case_column_history
  for all using (auth.role() = 'authenticated');
