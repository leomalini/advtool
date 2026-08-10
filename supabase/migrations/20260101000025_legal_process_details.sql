-- ============================================================
-- 25 — CAMPOS DE IDENTIFICAÇÃO DO PROCESSO
--
-- A tela de detalhe exibe valor da causa, ajuizamento, comarca, classe,
-- assunto, tipo e status. Nenhum existia: a página mostrava "Judicial" e
-- "Ativo" fixos no código, e a faixa de infos reaproveitava `next_deadline`
-- (o prazo do CRM) como se fosse a data de ajuizamento.
--
-- Todos esses campos já vêm da API BuscaProcessos (BpProcesso.valor, .classe,
-- .assunto, .dataDistribuicao, .status) e eram descartados no mapeamento.
-- ============================================================

alter table public.legal_processes
  add column if not exists case_value       numeric(14,2),
  add column if not exists filing_date      date,
  add column if not exists comarca          text,
  add column if not exists procedural_class text,
  add column if not exists subject          text,
  add column if not exists process_type     text not null default 'judicial'
                             check (process_type in ('judicial', 'administrativo')),
  add column if not exists status           text not null default 'ativo'
                             check (status in ('ativo', 'arquivado', 'suspenso'));

create index if not exists idx_legal_processes_status on public.legal_processes(status);
