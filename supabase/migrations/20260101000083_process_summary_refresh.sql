-- ============================================================
-- 83 — RESUMO DO PROCESSO: ATUALIZAÇÃO AUTOMÁTICA
--
-- Plano: `docs/assistente-claude.md`, fase 2b. Decisão do usuário
-- (2026-10-27): o resumo se refaz sozinho quando chega movimentação — pelo
-- webhook da BuscaProcessos ou pelo "Atualizar dados" — e quando alguém abre um
-- processo cujo resumo ficou para trás. Só para processos que JÁ têm resumo
-- (alguém gerou uma vez = o escritório quer acompanhar), no máximo uma vez a
-- cada 15 minutos por processo.
--
-- ── `refreshing_since`: a reserva ──
-- Movimentações chegam em rajada: 42 de um processo num mês, várias no mesmo
-- minuto, cada uma numa entrega do webhook. Sem reserva, duas entregas
-- simultâneas veriam o mesmo resumo velho e pagariam duas gerações. Quem vai
-- gerar marca `refreshing_since` com um UPDATE condicional (só passa se a coluna
-- está vazia ou velha); quem perde, desiste. Ao gravar o resumo novo a coluna
-- volta a nula. Se a função morrer no meio, a reserva vence sozinha em 5
-- minutos (`features/processos/summary/refreshProcessSummary.ts`).
--
-- Resumo gerado automaticamente fica com `generated_by` nulo: não foi ninguém.
-- ============================================================

alter table public.legal_process_summaries
  add column if not exists refreshing_since timestamptz;
