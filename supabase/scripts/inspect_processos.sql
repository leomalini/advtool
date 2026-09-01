-- Somente leitura. Mostra o que existe hoje ligado a processos.
select 'legal_processes'          as tabela, count(*) as total from legal_processes
union all select 'legal_process_movements', count(*) from legal_process_movements
union all select 'legal_process_parties',   count(*) from legal_process_parties
union all select 'crm_items em wf-processos', count(*) from crm_items where workflow_id = 'wf-processos'
union all select 'crm_items com legal_process_id', count(*) from crm_items where legal_process_id is not null
union all select 'events vinculados',     count(*) from events           where legal_process_id is not null
union all select 'tasks vinculadas',      count(*) from tasks            where legal_process_id is not null
union all select 'documents vinculados',  count(*) from documents        where legal_process_id is not null
union all select 'lançamentos vinculados',count(*) from financial_entries where legal_process_id is not null
order by 1;

-- Os processos em si, para você reconhecer o que é teste.
select id, cnj_number, procedural_class, status, created_at
from legal_processes
order by created_at;
