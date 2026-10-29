-- ============================================================
-- 84 — PORTAL DO CLIENTE: PERGUNTAS FIXAS
--
-- Plano: `docs/assistente-claude.md`, fase 3 (D5 e D6). O chat livre do portal
-- sai. Em cada processo o cliente vê perguntas prontas — o que aconteceu por
-- último, o que isso significa, em que fase está, se há data marcada — com
-- respostas que a IA gera UMA vez por mudança nos dados e que ficam guardadas
-- aqui. O clique do cliente não chama a IA: custo por movimentação, não por
-- pergunta, e nenhum campo onde alguém tente contornar as instruções.
--
-- ── Sigilo pela impressão digital ──
-- A geração só recebe o que a página do cliente mostra: a capa do portal e as
-- movimentações com `hidden_from_client = false`. `source_hash` é a impressão
-- digital desse recorte no momento da geração. Resposta cujo hash não bate com
-- o recorte de agora NUNCA é mostrada — ela é refeita antes. Assim, se o
-- escritório ocultar uma movimentação, a resposta que falava dela some na hora,
-- sem depender de ninguém lembrar de regerar.
--
-- ── O escritório revisa (D6) ──
-- As respostas aparecem sozinhas, com o selo de IA. O escritório pode corrigir
-- (`corrections`) ou ocultar (`hidden`) cada pergunta. Quando chega movimentação
-- nova, a resposta é refeita e a correção — que falava dos dados antigos — vai
-- para `superseded`: a tela do escritório avisa que ela foi substituída.
--
-- Uma linha por processo, não por cliente: as respostas falam do processo, e
-- o recorte visível é o mesmo para qualquer titular de link.
-- ============================================================

create table if not exists public.client_portal_answers (
  legal_process_id  uuid primary key
                      references public.legal_processes(id) on delete cascade,

  /** As respostas geradas: { ultimo_ato, significado, fase, datas } (texto).
   * Objeto vazio enquanto a primeira geração não terminou. */
  answers           jsonb not null default '{}'::jsonb,
  /** Correções do escritório por pergunta: { [pergunta]: { text, by, at } }.
   * Quando existe, é o que o cliente vê. */
  corrections       jsonb not null default '{}'::jsonb,
  /** Perguntas que o escritório tirou do portal neste processo. */
  hidden            text[] not null default '{}',
  /** Correções substituídas por uma geração nova:
   * { [pergunta]: { text, by, at, superseded_at } }. O aviso ao escritório. */
  superseded        jsonb not null default '{}'::jsonb,

  /** Impressão digital do recorte visível usado na geração. Vazia = ainda não
   * gerado; nunca bate com dado nenhum. */
  source_hash       text not null default '',
  model             text,
  generated_at      timestamptz,
  /** Reserva contra duas gerações simultâneas (como em
   * `legal_process_summaries`, migration 83). */
  refreshing_since  timestamptz
);


-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- O escritório lê com `processos:view` e corrige/oculta com `processos:update`.
-- Ninguém cria nem apaga por sessão: a geração roda pela service_role, a partir
-- do portal (anônimo, autorizado pelo token) ou do webhook.

select public.apply_rbac_policies(
  'client_portal_answers',
  'processos:view',
  null,
  'processos:update',
  null
);
