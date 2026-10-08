-- ============================================================
-- 68 — POR ONDE A MOVIMENTAÇÃO CHEGOU
--
-- Plano: `docs/dashboard.md`, decisão 1.
--
-- O dashboard mostra o que o monitoramento da BuscaProcessos trouxe de novo.
-- `created_at` sozinho não responde isso: cadastrar um processo importa o
-- histórico inteiro de uma vez (43 linhas em 10/09/2026, 22 em 15/09 e outras
-- 22 em 16/09), e contar por chegada mostraria esse histórico como novidade.
--
-- `source` diz a ORIGEM do dado — API ou digitado (migration 26). Esta coluna
-- diz o CANAL pelo qual a linha entrou:
--
--   · 'webhook' — entrega do monitoramento   (src/lib/buscaprocessos/webhook.ts)
--   · 'sync'    — consulta ao cadastrar ou    (src/lib/buscaprocessos/sync.ts)
--                 sincronizar o processo
--   · 'manual'  — digitada na tela ou pelo    (addLegalProcessMovement)
--                 assistente
--
-- Sem default: as três escritas passam o valor. Um default escolheria um
-- canal por quem esqueceu de informar — e o errado, para dois dos três.
-- Nula fica só a linha de um caminho futuro que não informe; o dashboard a
-- trata como "não veio do webhook".
--
-- ⚠️ APLICAR ANTES DO DEPLOY do código que grava a coluna. Gravar numa coluna
-- que não existe faz o webhook registrar `error`, e a movimentação só volta
-- pelo reprocessamento.
-- ============================================================

alter table public.legal_process_movements
  add column if not exists received_via text
    check (received_via is null or received_via in ('webhook', 'sync', 'manual'));

comment on column public.legal_process_movements.received_via is
  'Canal pelo qual a linha entrou: webhook (monitoramento), sync (consulta ao '
  'cadastrar ou sincronizar) ou manual. Independente de source, que é a origem '
  'do dado. Nula = caminho que não informou.';


-- ── Backfill ─────────────────────────────────────────────────────────────────
--
-- Toda movimentação que o webhook gravou deixou dois rastros: o aviso
-- `movimentacao_nova` de `source = 'webhook'` apontando para ela
-- (`notifyMovimentacao`) e o destino `inserted` na entrega registrada em
-- `webhook_events`. Em 07/10/2026 os dois davam as mesmas 29 linhas; os dois
-- entram porque o aviso é best-effort e pode faltar.
--
-- Os três updates só tocam linha nula, então rodar de novo não muda nada.

update public.legal_process_movements m
   set received_via = 'webhook'
 where m.received_via is null
   and (
     exists (
       select 1
         from public.notifications n
        where n.kind = 'movimentacao_nova'
          and n.source = 'webhook'
          and n.entity_type = 'legal_process_movement'
          and n.entity_id = m.id
     )
     or exists (
       select 1
         from public.webhook_events e,
              jsonb_array_elements(e.destinations) d
        where e.provider = 'busca_processos'
          and d ->> 'table' = 'legal_process_movements'
          and d ->> 'action' = 'inserted'
          and d ->> 'id' = m.id::text
     )
   );

update public.legal_process_movements
   set received_via = 'manual'
 where received_via is null
   and source = 'manual';

-- O resto veio da consulta à API ao cadastrar ou sincronizar.
update public.legal_process_movements
   set received_via = 'sync'
 where received_via is null;


-- ── Índice ───────────────────────────────────────────────────────────────────
--
-- A consulta do dashboard: o que chegou pelo webhook nos últimos dias, do mais
-- novo para o mais antigo.

create index if not exists idx_movements_received_via_webhook
  on public.legal_process_movements(created_at desc)
  where received_via = 'webhook';
