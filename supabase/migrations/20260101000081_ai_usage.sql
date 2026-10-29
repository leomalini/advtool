-- ============================================================
-- 81 — CONSUMO DA IA
--
-- Plano: `docs/assistente-claude.md`, fase 1. Cada chamada ao modelo — cada
-- passo de um turno do chat, cada leitura de documentos, cada redação — vira
-- uma linha aqui, com os tokens e o custo estimado. Serve a duas coisas:
--
--   1. MEDIR. O plano escolhe modelo e esforço por rota com estimativas; esta
--      tabela troca a estimativa pelo número real, rota a rota.
--   2. LIMITAR. Com `AI_MONTHLY_BUDGET_USD` definida, as rotas somam o mês
--      (função abaixo) antes de chamar o modelo e param no teto.
--
-- ── Quem grava ──
-- Só o servidor, pela service_role (`features/ia/usage/recordUsage.ts`). O
-- registro de gasto não pode ser escrito por sessão: um membro poderia
-- apagar o próprio consumo ou inventar o de outro. Por isso nenhuma policy de
-- escrita. A leitura é de `configuracoes:manage` — quem administra a conta.
--
-- ── O custo é estimativa ──
-- `cost_usd` sai da tabela de preços em código, no momento da chamada. Modelo
-- sem preço conhecido fica com `cost_usd` nulo em vez de um número inventado
-- (e não entra na soma do teto). A fatura de verdade é a do provedor.
-- ============================================================

create table if not exists public.ai_usage (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  /** De onde veio a chamada: as rotas de `AI_ROUTE_SETTINGS`. */
  route               text not null
                        check (route in ('chat', 'portal', 'contract_reader', 'drafting')),
  provider            text not null check (provider in ('anthropic', 'google')),
  /** O modelo que respondeu, como o provedor informou. */
  model               text not null,

  /** Quem pediu, na equipe. Nulo no portal. */
  user_id             uuid references auth.users(id) on delete set null,
  /** O link do portal, quando foi um cliente. */
  portal_link_id      uuid references public.client_portal_links(id) on delete set null,
  /** Conversa do chat (uuid) ou do portal (texto opaco). Sem FK de propósito:
   * as duas origens têm formatos diferentes, e o registro sobrevive à conversa. */
  conversation_id     text,

  /** Entrada SEM cache — a parte cobrada pelo preço cheio. */
  input_tokens        integer not null default 0 check (input_tokens >= 0),
  cache_read_tokens   integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens  integer not null default 0 check (cache_write_tokens >= 0),
  /** Saída total, raciocínio incluído. */
  output_tokens       integer not null default 0 check (output_tokens >= 0),
  reasoning_tokens    integer check (reasoning_tokens >= 0),

  /** `stop`, `tool-calls`, `length`, `content-filter`… do AI SDK. */
  finish_reason       text,
  cost_usd            numeric(12, 6) check (cost_usd >= 0)
);

/** A soma do mês (teto) e a leitura por período. */
create index if not exists idx_ai_usage_created
  on public.ai_usage(created_at desc);

/** Consumo por pessoa. */
create index if not exists idx_ai_usage_user
  on public.ai_usage(user_id, created_at desc)
  where user_id is not null;


-- ── RLS ──────────────────────────────────────────────────────────────────────

select public.apply_rbac_policies(
  'ai_usage',
  'configuracoes:manage', null, null, null
);


-- ── Soma do mês ──────────────────────────────────────────────────────────────
--
-- O mês é o do escritório (America/Sao_Paulo), não o do servidor em UTC: sem
-- isso, o teto viraria às 21h do último dia. Só a service_role executa — é a
-- rota que confere o teto, e o total do escritório não é dado de sessão.

create or replace function public.ai_usage_month_cost_usd()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cost_usd), 0)
    from public.ai_usage
   where created_at >= (
     date_trunc('month', now() at time zone 'America/Sao_Paulo')
       at time zone 'America/Sao_Paulo'
   );
$$;

revoke execute on function public.ai_usage_month_cost_usd() from public, anon, authenticated;
grant execute on function public.ai_usage_month_cost_usd() to service_role;
