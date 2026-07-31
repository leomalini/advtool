-- ============================================================
-- 17 — COMENTÁRIOS EM crm_items
-- Mesma forma de task_comments (migration 05): FK direta para a entidade pai,
-- sem polimorfismo e sem soft-delete — o padrão já estabelecido no schema.
--
-- Uma única tabela atende os dois modais: CasoModal usa o crm_item direto;
-- ProcessoModal resolve para o crm_item mestre do processo (wf-processos).
-- ============================================================

create table public.crm_item_comments (
  id           uuid primary key default gen_random_uuid(),
  crm_item_id  uuid not null references public.crm_items(id) on delete cascade,
  author_id    uuid not null references public.profiles(id),
  content      text not null,
  created_at   timestamptz not null default now()
);

create index idx_crm_item_comments_crm_item_id on public.crm_item_comments(crm_item_id);

alter table public.crm_item_comments enable row level security;
create policy "auth_full" on public.crm_item_comments
  for all using (auth.role() = 'authenticated');
