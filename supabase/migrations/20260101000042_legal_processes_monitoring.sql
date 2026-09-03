-- ============================================================
-- 42 — VÍNCULO COM O MONITORAMENTO DA BUSCAPROCESSOS
--
-- `POST /v1/monitoramentos/processos` devolve um id e cobra por mês enquanto
-- o monitoramento estiver ativo (`cobranca.recorrencia: 'MENSAL'`). Esse id
-- não tinha onde morar: o monitor era criado e ficava órfão, sem caminho de
-- volta para consultá-lo ou cancelá-lo pelo sistema.
--
-- `frequencia` é campo do corpo da requisição (DIARIA | SEMANAL | MENSAL) e
-- também não existia aqui — sem ele não dá para exibir nem reenviar a mesma
-- configuração.
--
-- Colunas alimentadas pela API, não pelo formulário: ficam fora de
-- legalProcessSchema de propósito.
-- ============================================================

alter table public.legal_processes
  add column if not exists monitoring_id        text,
  add column if not exists monitoring_frequency text
                             check (monitoring_frequency in ('DIARIA', 'SEMANAL', 'MENSAL')),
  -- Estado devolvido pela API (ex.: 'ENCONTRADO'); texto livre do lado deles.
  add column if not exists monitoring_status    text,
  add column if not exists monitoring_synced_at timestamptz;

-- Um monitoramento pertence a um processo só. O índice parcial deixa vários
-- processos sem monitoramento (null) convivendo, mas impede que o mesmo id
-- apareça em dois — o que quebraria a limpeza feita pelo DELETE da rota.
create unique index if not exists idx_legal_processes_monitoring_id
  on public.legal_processes(monitoring_id)
  where monitoring_id is not null;
