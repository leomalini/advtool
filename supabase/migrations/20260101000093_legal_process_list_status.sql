-- ============================================================
-- 93 — STATUS NA LISTA DE PROCESSOS
-- ============================================================
--
-- A lista de Processos mostrava todos os processos sem dizer quais estão
-- arquivados: o dashboard conta só os ativos (`status = 'ativo'`) e a lista
-- somava os arquivados junto, sem coluna nem filtro para separar.
--
-- A view `legal_process_list` (migration 92) passa a trazer `lp.status`. Ela
-- vai no fim da lista de colunas: `create or replace view` só aceita coluna
-- nova depois das que já existem. O filtro é encadeado pelo PostgREST sobre
-- `search_legal_processes`, como os outros.

create or replace view public.legal_process_list
with (security_invoker = true)
as
select
  lp.id,
  lp.cnj_number,
  lp.court,
  lp.court_division,
  lp.plaintiff,
  lp.defendant,
  lp.opposing_counsel,
  lp.monitoring_frequency,
  lp.created_at,
  lp.updated_at,
  ci.id                as crm_item_id,
  ci.title,
  ci.legal_area,
  ci.column_id,
  ci.assigned_to,
  ci.next_deadline,
  ci.next_task_summary,
  ci.updated_at        as crm_updated_at,
  ci.client_id,
  cl.type              as client_type,
  cl.name              as client_name,
  cl.company_name      as client_company_name,
  cl.trade_name        as client_trade_name,
  pr.full_name         as assigned_name,
  lp.status
from public.legal_processes lp
left join lateral (
  select c.*
  from public.crm_items c
  where c.legal_process_id = lp.id
  order by (c.workflow_id = 'wf-processos') desc, c.created_at, c.id
  limit 1
) ci on true
left join public.clients  cl on cl.id = ci.client_id
left join public.profiles pr on pr.id = ci.assigned_to;

revoke all on public.legal_process_list from anon;
grant select on public.legal_process_list to authenticated;
