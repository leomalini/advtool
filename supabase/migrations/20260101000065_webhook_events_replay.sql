-- ============================================================
-- 65 — REPROCESSAMENTO DE ENTREGAS RECUSADAS
--
-- Uma entrega recusada não se perde: a rota guarda o corpo inteiro em
-- `webhook_events` justamente para poder reprocessá-lo depois. O que faltava
-- era saber QUAIS já foram reprocessadas. Sem isso, cada rodada reenviava todas
-- as recusadas desde o início — a maioria voltava `duplicate`, cada uma virava
-- uma linha nova no log, e "quantas intimações ainda estão presas?" não tinha
-- resposta.
--
-- Duas colunas, uma de cada lado:
--
--   · `replayed_at` — na linha RECUSADA: quando ela foi reprocessada. Nula é o
--                     que define a fila de pendentes.
--   · `replay_of`   — na linha NOVA, criada pelo reprocessamento: aponta para a
--                     recusada de origem. É o que separa "a BuscaProcessos
--                     entregou" de "nós reprocessamos" — o alerta de recusas
--                     seguidas só conta as entregas da origem.
-- ============================================================

alter table public.webhook_events
  add column if not exists replayed_at timestamptz,
  add column if not exists replay_of   uuid references public.webhook_events(id) on delete set null;

-- A fila do botão "Reprocessar": recusadas reais ainda não recuperadas.
create index if not exists idx_webhook_events_pending_replay
  on public.webhook_events(received_at)
  where status = 'invalid' and is_test = false and replayed_at is null;

-- O alerta lê as últimas entregas da ORIGEM a cada recusa.
create index if not exists idx_webhook_events_origin_deliveries
  on public.webhook_events(received_at desc)
  where is_test = false and replay_of is null;

-- ── Recusas já recuperadas antes desta migration ─────────────────────────────
--
-- As intimações recusadas entre 10 e 23/09/2026 foram recuperadas pelo
-- terminal, quando ainda não havia onde marcar isso. Sem este update elas
-- voltariam à fila e seriam reenviadas de novo (todas `duplicate`).
--
-- A prova de recuperação é a mesma da deduplicação: existir a publicação com o
-- id da origem. Só diário entra aqui — movimentação de processo não passou por
-- reprocessamento nenhum e continua pendente.
update public.webhook_events e
   set replayed_at = now()
 where e.status = 'invalid'
   and e.is_test = false
   and e.replayed_at is null
   and e.payload ->> 'event' = 'diario_movimentacao_nova'
   and exists (
     select 1
       from public.publications p
      where p.source = 'busca_processos'
        and p.external_id = 'diario:' || (e.payload -> 'movimentacao' ->> 'id')
   );
