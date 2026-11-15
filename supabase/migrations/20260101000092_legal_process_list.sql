-- ============================================================
-- 92 — LISTA PAGINADA DE PROCESSOS
-- ============================================================
--
-- A lista de Processos pagina no servidor (docs/paginacao.md). Antes ela
-- baixava todos os processos, cada um com movimentações, publicações,
-- documentos e partes, e filtrava e ordenava no navegador.
--
-- Os filtros e a ordem moram no card "mestre" do processo — etapa, área,
-- responsável, prazo, atualização —, que é um `crm_items` ligado por
-- `legal_process_id`, um para muitos. O PostgREST não ordena nem filtra a
-- tabela pai por um recurso embutido um-para-muitos, então a view achata o
-- card mestre numa linha só por processo.
--
-- Card mestre: o do workflow fixo `wf-processos`; sem ele, o mais antigo —
-- o mesmo critério de `pickMasterCrmItem` (legalProcesses.service.ts), com
-- `created_at, id` para ser determinístico.
--
-- `security_invoker`: a view lê as tabelas com as permissões de quem
-- consulta, então a RLS de cada uma (processos, cards, clientes, perfis)
-- vale aqui exatamente como vale na tela de hoje.

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
  pr.full_name         as assigned_name
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

-- A busca de texto. Filtros de etapa, área, responsável, prazo e
-- monitoramento, a ordem e a página são encadeados pelo PostgREST sobre o
-- resultado; o que ele não expressa é "o termo aparece em qualquer um destes
-- campos" sem a sintaxe frágil do `or=()` — vírgula e parêntese no termo
-- quebrariam o filtro.
--
-- Espelha `filterLegalProcesses`, sem diferenciar maiúsculas: título, CNJ,
-- partes, advogado contrário, tribunal, vara, próxima tarefa e cliente (nome,
-- razão social e nome fantasia); e o CNJ só com dígitos, para quem cola o
-- número sem pontuação. `strpos`, e não `ilike`: `%` e `_` são texto.
create or replace function public.search_legal_processes(p_search text)
returns setof public.legal_process_list
language sql
stable
security invoker
set search_path = public
as $$
  with term as (
    select
      lower(btrim(coalesce(p_search, ''))) as q,
      regexp_replace(coalesce(p_search, ''), '\D', '', 'g') as digits
  )
  select l.*
  from public.legal_process_list l
  cross join term t
  where t.q = ''
     or strpos(
          lower(concat_ws(' ',
            l.title, l.cnj_number, l.plaintiff, l.defendant, l.opposing_counsel,
            l.court, l.court_division, l.next_task_summary,
            l.client_name, l.client_company_name, l.client_trade_name
          )),
          t.q
        ) > 0
     or (
       t.digits <> ''
       and strpos(regexp_replace(coalesce(l.cnj_number, ''), '\D', '', 'g'), t.digits) > 0
     )
$$;

grant execute on function public.search_legal_processes(text) to authenticated;
