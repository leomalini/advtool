-- ============================================================
-- 64 — ASSISTENTE DO PORTAL DO CLIENTE
--
-- O link `/acompanhar/<token>` ganha um chat com IA para o cliente tirar
-- dúvidas sobre o andamento dos próprios processos. Esta tabela guarda cada
-- turno da conversa, e serve a duas coisas:
--
--   1. O LIMITE DE USO. Cada pergunta gasta cota do provedor de IA — a mesma
--      chave do Assistente interno. O limite por link é contado aqui, no banco,
--      pelo mesmo motivo do rate limit do CPF (migration 57): em serverless, um
--      contador em memória reinicia sozinho e não limita nada. A pergunta é
--      gravada ANTES de chamar o modelo, então turno que falha também conta.
--   2. O REGISTRO. O escritório responde pelo que a ferramenta diz ao cliente
--      dele. Com pergunta e resposta gravadas, uma reclamação ("a IA disse que
--      eu ia ganhar") se confere em vez de se discutir.
--
-- ── O que o modelo vê não mora aqui ──
-- A IA do portal só recebe o que a página já mostra (resumo dos processos e
-- movimentações com `hidden_from_client = false`), montado em
-- `lib/clientPortal/data.ts`. Esta tabela não amplia isso: guarda o que foi
-- conversado, inclusive o resultado de cada consulta, porque é esse histórico
-- que volta ao modelo no turno seguinte.
--
-- ── Por que o histórico vem do banco, e não do navegador ──
-- O navegador manda só o texto da pergunta nova. O histórico que o modelo
-- recebe é lido daqui, então ninguém consegue forjar uma "resposta anterior da
-- IA" nem inflar o pedido com um histórico arbitrariamente grande.
-- ============================================================

create table if not exists public.client_portal_chat_messages (
  id               uuid primary key default gen_random_uuid(),

  link_id          uuid not null references public.client_portal_links(id) on delete cascade,
  /** Redundante com o link, de propósito: o cliente pode ter tido vários links
   * (reemitir revoga o anterior), e a conversa é dele, não do link. */
  client_id        uuid not null references public.clients(id) on delete cascade,

  /** Id da conversa gerado no navegador (uma por abertura da página). Opaco:
   * o formato é conferido aqui e na rota. As consultas sempre filtram também
   * por `link_id`, então um id repetido nunca alcança a conversa de outro link. */
  conversation_id  text not null check (conversation_id ~ '^[A-Za-z0-9_-]{8,64}$'),

  role             text not null check (role in ('user', 'assistant')),
  /** `UIMessage.parts` do AI SDK: texto e, na resposta, as consultas feitas e
   * o que elas devolveram — o que o modelo viu ao responder. */
  parts            jsonb not null,

  created_at       timestamptz not null default now()
);

/** Limite de uso: perguntas do link na janela. */
create index if not exists idx_client_portal_chat_link_questions
  on public.client_portal_chat_messages(link_id, created_at desc)
  where role = 'user';

/** Histórico de uma conversa, em ordem. */
create index if not exists idx_client_portal_chat_conversation
  on public.client_portal_chat_messages(conversation_id, created_at);

/** Leitura pelo escritório, por cliente. */
create index if not exists idx_client_portal_chat_client
  on public.client_portal_chat_messages(client_id, created_at desc);


-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- Mesma regra do log de acesso do portal: o escritório LÊ com `clientes:view`;
-- ninguém grava, altera ou apaga por sessão. Quem escreve é a rota pública,
-- pela service_role, que ignora RLS. O registro não se edita — é o que o
-- torna útil numa reclamação.

select public.apply_rbac_policies(
  'client_portal_chat_messages',
  'clientes:view', null, null, null
);
