-- ============================================================
-- 48 — LOG DE WEBHOOKS
--
-- O endpoint `/api/webhooks/buscaprocessos` responde 200 mesmo quando não
-- processa nada — de propósito, para a BuscaProcessos não ficar retentando o
-- que nunca vai dar certo. O efeito colateral é que ele é invisível: não havia
-- como responder "chegou?", "a assinatura conferiu?", "para onde foi o dado?".
--
-- Cada requisição vira uma linha aqui, e `destinations` responde a última
-- pergunta de forma literal: [{table, id, action}].
--
-- `is_test` separa o que a tela de Configurações disparou do que a origem
-- mandou de verdade — sem isso, testar polui o histórico que serve para
-- diagnosticar produção.
--
-- Retenção: não há expurgo automático. O botão "limpar eventos de teste" apaga
-- os `is_test`; o restante é histórico de integração e cabe folgado (uma linha
-- por webhook recebido).
-- ============================================================

create table if not exists public.webhook_events (
  id               uuid primary key default gen_random_uuid(),

  provider         text not null default 'busca_processos',
  /** `event` do payload, ou o cabeçalho x-buscaprocessos-event. */
  event            text,
  /** `id` do evento na origem — permite reconhecer reentrega. */
  external_id      text,

  /** null quando não havia segredo configurado para conferir. */
  signature_valid  boolean,

  /** Disparado pela tela de Configurações, não pela origem. */
  is_test          boolean not null default false,
  /** Simulação: nada foi gravado, `destinations` diz o que TERIA acontecido. */
  dry_run          boolean not null default false,

  status           text not null check (status in (
    'received',   -- chegou, ainda não classificado
    'processed',  -- gravou algo novo
    'duplicate',  -- já existia; ver destinations[].id
    'ignored',    -- evento que não nos interessa
    'unmatched',  -- CNJ sem processo cadastrado
    'invalid',    -- assinatura ou corpo recusado
    'error'
  )),

  /** Para onde a informação foi (ou iria): [{table, id, action}]. */
  destinations     jsonb not null default '[]',
  /** Motivo legível de um status que não é 'processed'. */
  reason           text,
  error            text,

  payload          jsonb,
  /** Só os cabeçalhos que importam para diagnóstico — nunca o segredo. */
  headers          jsonb,

  duration_ms      integer,
  received_at      timestamptz not null default now()
);

create index if not exists idx_webhook_events_received
  on public.webhook_events(received_at desc);

create index if not exists idx_webhook_events_status
  on public.webhook_events(status, received_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- Leitura para quem enxerga Configurações — é onde a tela vive. Escrita e
-- limpeza só pelo `service_role` das rotas de servidor: o webhook não tem
-- sessão, e apagar histórico de integração não é ação de tela comum.

select public.apply_rbac_policies(
  'webhook_events',
  'configuracoes:view', null, null, null
);

-- ── Realtime ─────────────────────────────────────────────────────────────────
--
-- A lista de recebimentos se atualiza sozinha enquanto alguém dispara testes —
-- é o que transforma a tela em ferramenta de validação em vez de relatório.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publicação supabase_realtime ausente — Realtime não habilitado para webhook_events';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'webhook_events'
  ) then
    execute 'alter publication supabase_realtime add table public.webhook_events';
  end if;
end $$;
