-- Somente leitura. Mostra o que existe hoje ligado a processos e publicações.
select 'legal_processes'          as tabela, count(*) as total from legal_processes
union all select 'legal_process_movements', count(*) from legal_process_movements
union all select 'legal_process_parties',   count(*) from legal_process_parties
union all select 'legal_process_public_documents', count(*) from legal_process_public_documents
union all select 'publications',            count(*) from publications
union all select 'publications órfãs',      count(*) from publications where legal_process_id is null
union all select 'publications duplicatas', count(*) from publications where duplicate_of_id is not null
union all select 'publication_parties',     count(*) from publication_parties
union all select 'crm_items em wf-processos', count(*) from crm_items where workflow_id = 'wf-processos'
union all select 'crm_items com legal_process_id', count(*) from crm_items where legal_process_id is not null
union all select 'events vinculados',     count(*) from events           where legal_process_id is not null
union all select 'tasks vinculadas',      count(*) from tasks            where legal_process_id is not null
union all select 'tasks com publicação',  count(*) from tasks            where publication_id is not null
union all select 'documents vinculados',  count(*) from documents        where legal_process_id is not null
union all select 'lançamentos vinculados',count(*) from financial_entries where legal_process_id is not null
union all select 'notifications de publicação', count(*) from notifications where entity_type = 'publication'
union all select 'webhook_events',        count(*) from webhook_events
order by 1;

-- Os processos em si, para você reconhecer o que é teste.
select id, cnj_number, procedural_class, status, created_at
from legal_processes
order by created_at;

-- ⚠️ Monitoramento ativo trava o expurgo da migration 49: apagar o processo
-- levaria junto o `monitoring_id`, única forma de encerrar a cobrança mensal.
-- Cancele estes antes de expurgar.
select id, cnj_number, monitoring_id, monitoring_frequency, monitoring_status
from legal_processes
where monitoring_id is not null;
