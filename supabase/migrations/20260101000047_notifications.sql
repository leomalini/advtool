-- ============================================================
-- 47 — AVISO DE CHEGADA
--
-- Publicação que chega por webhook não avisa ninguém: hoje ela só é descoberta
-- por quem resolve abrir /publicacoes. O webhook existe justamente para que a
-- intimação chegue sozinha — sem sinal, ele entrega no escuro.
--
-- Uma linha aqui é um aviso, não uma cópia do dado: ela aponta para a entidade
-- (`link`, `entity_type`, `entity_id`) e some do caminho quando lida.
--
-- ── Por que a RLS não usa `apply_rbac_policies` ──
-- O recurso exigido varia POR LINHA: um aviso de publicação exige
-- 'publicacoes:view', um de erro de webhook exige 'configuracoes:view'. O
-- helper da migration 35 fixa o recurso na policy; aqui ele sai da coluna. As
-- policies abaixo usam a mesma `public.can` e o mesmo `(select …)` que força
-- InitPlan — só com o recurso vindo da linha.
--
-- ── Por que `read_at` é compartilhado ──
-- Mesma convenção de `publications.read_at` (migration 44): o escritório tem
-- uma fila só. Estado de leitura por usuário exigiria uma tabela de junção e
-- resolveria um problema que este produto não tem — quem trata a intimação
-- trata para todo mundo.
-- ============================================================

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),

  /** O que aconteceu. Texto livre de propósito: cada módulo novo traz o seu
   * valor sem migration, como `activities.type` (migration 39). */
  kind         text not null,

  /** Recurso do RBAC que a linha exige para ser vista. É o que a policy lê. */
  resource     text not null,

  title        text not null,
  body         text,
  /** Rota interna que o clique abre: '/publicacoes/<id>'. */
  link         text,

  entity_type  text,
  entity_id    uuid,

  /** De onde veio o aviso: 'webhook' | 'sync' | 'cadastro'. */
  source       text,

  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- O sino consulta as não lidas a cada chegada — é a consulta quente.
create index if not exists idx_notifications_unread
  on public.notifications(created_at desc)
  where read_at is null;

create index if not exists idx_notifications_created
  on public.notifications(created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.notifications enable row level security;

drop policy if exists rbac_select on public.notifications;
create policy rbac_select on public.notifications
  for select using ((select public.can(resource, 'view')));

-- Marcar como lido é a única escrita que a tela faz. Quem enxerga o aviso pode
-- baixá-lo — é a mesma regra de `publications.read_at`.
drop policy if exists rbac_update on public.notifications;
create policy rbac_update on public.notifications
  for update using ((select public.can(resource, 'view')))
           with check ((select public.can(resource, 'view')));

-- Sem policy de insert nem de delete: quem escreve é o `service_role` das
-- rotas de servidor, que ignora RLS por definição. Cliente não inventa aviso.

-- ── Realtime ─────────────────────────────────────────────────────────────────
--
-- É o que faz o sino tocar sem polling. O Realtime aplica a RLS acima na
-- entrega, então cada sessão só recebe o que já poderia ler.
--
-- Guardado duas vezes: a publicação `supabase_realtime` pode não existir numa
-- base local levantada fora do stack do Supabase, e `add table` numa tabela já
-- publicada é erro, não no-op.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publicação supabase_realtime ausente — Realtime não habilitado para notifications';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;
