-- ============================================================
-- 31 — Notas do cliente
--
-- Espelho de crm_item_comments (migration 17). Um cliente não tem card de CRM
-- próprio: as notas dele ficavam presas ao caso em que foram escritas, e um
-- cliente sem caso nenhum não tinha onde ser anotado.
--
-- Tabela separada em vez de generalizar crm_item_comments — decisão de projeto.
-- Para que as duas não virem duas UIs diferentes de comentário, a apresentação
-- (compositor + lista) vive num único componente `CommentThread`, e cada tabela
-- só liga a sua fonte de dados.
-- ============================================================

create table if not exists public.client_comments (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  author_id  uuid not null references public.profiles(id),
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_comments_client_id
  on public.client_comments(client_id);

alter table public.client_comments enable row level security;
drop policy if exists "auth_full" on public.client_comments;
create policy "auth_full" on public.client_comments
  for all using (auth.role() = 'authenticated');
