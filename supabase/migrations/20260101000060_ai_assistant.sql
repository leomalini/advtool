-- ============================================================
-- 60 — ASSISTENTE IA
--
-- Chat em linguagem natural sobre a base do escritório. O modelo não lê o
-- banco: ele chama tools tipadas que rodam no servidor com o client do usuário
-- logado, então a RLS de cada tabela continua sendo quem decide o que a IA vê.
-- Esta migration só traz o que é novo: o recurso `ia` na matriz RBAC e as
-- tabelas de histórico.
--
-- ── Por que a RLS das `ai_*` não usa `apply_rbac_policies` ──
-- Conversa é pessoal, não do escritório: o critério é `user_id = auth.uid()`,
-- e o helper da migration 35 só sabe filtrar por recurso. Um admin não lê a
-- conversa de outro membro — o que a IA respondeu a alguém veio de dados que
-- essa pessoa podia ver, e nada garante que o admin também possa.
--
-- ── Por que `ai_messages.id` é text e a chave é composta ──
-- O id é gerado pelo AI SDK (`generateId`, não é uuid) e precisa ser o mesmo
-- no browser e no servidor para o upsert de cada turno não duplicar mensagem.
-- Como ele chega no corpo do pedido, a chave inclui a conversa: um id repetido
-- de propósito colide só dentro das conversas de quem o enviou, nunca com a
-- linha de outra pessoa. `parts` guarda o `UIMessage.parts` inteiro — texto,
-- chamadas de tool e resultados — porque é esse o formato que a tela reidrata.
-- ============================================================

-- ── RBAC ─────────────────────────────────────────────────────────────────────

insert into public.role_permissions (role, resource, action) values
  ('admin',     'ia', 'view'),
  ('attorney',  'ia', 'view'),
  ('paralegal', 'ia', 'view'),
  ('finance',   'ia', 'view')
on conflict (role, resource, action) do nothing;

-- ── Tabelas ──────────────────────────────────────────────────────────────────

create table if not exists public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  /** Primeiras palavras da primeira pergunta — só para a lista lateral. */
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id              text not null,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  parts           jsonb not null,
  /** Ordem de exibição dentro da conversa. `created_at` não serve: um upsert
   * do turno inteiro grava várias linhas no mesmo instante. */
  position        integer not null,
  created_at      timestamptz not null default now(),
  primary key (conversation_id, id)
);

create index if not exists idx_ai_conversations_user
  on public.ai_conversations(user_id, updated_at desc);

create index if not exists idx_ai_messages_conversation
  on public.ai_messages(conversation_id, position);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "owner_all" on public.ai_conversations;
create policy "owner_all" on public.ai_conversations
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "owner_all" on public.ai_messages;
create policy "owner_all" on public.ai_messages
  for all
  using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id
        and c.user_id = (select auth.uid())
    )
  );
