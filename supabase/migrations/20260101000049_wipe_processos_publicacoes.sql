-- ============================================================
-- 49 — EXPURGO DE PROCESSOS E PUBLICAÇÕES
--
-- ⚠️ MIGRATION DE DADOS, NÃO DE SCHEMA. Apaga linhas de produção.
--    Não edite este arquivo para "rodar de novo": escreva uma nova migration.
--
-- Contexto: a base acumulou processos e publicações dos testes de integração
-- com a BuscaProcessos (103 publicações, das quais 98 órfãs, vindas da busca
-- por OAB e do webhook). Antes de exercitar o fluxo de cadastro do zero — e
-- agora com a frequência de monitoramento fazendo parte dele — a base precisa
-- voltar a ficar vazia desses dois módulos.
--
-- Escopo confirmado com o usuário:
--
--   publications              → apagadas (cascata: publication_parties)
--   legal_processes           → apagados (cascata: movimentações, partes e
--                               catálogo de documentos públicos)
--   crm_items de wf-processos → apagados (cascata: comentários e histórico)
--   notifications de publicação → apagadas (virariam link morto)
--   webhook_events            → apagados (log de payloads recebidos)
--
-- FORA DE ESCOPO (relatado ao usuário, não tocado aqui):
--   · clientes;
--   · cards de outros workflows (wf-negociacao) e o que pende deles;
--   · events, tasks, documents e financial_entries — diferente do expurgo da
--     migration 41, aqui eles NÃO são apagados. Nenhum está vinculado a
--     processo hoje; se algum estiver quando isto rodar, o vínculo é
--     ON DELETE SET NULL e a linha apenas perde o `legal_process_id`. O bloco
--     reporta quantas perderam o vínculo para que isso não passe em silêncio;
--   · `activities` — o feed é registro do que aconteceu, e aconteceu;
--   · arquivos no bucket `attachments`.
--
-- ── Trava de segurança ──────────────────────────────────────────────────────
-- Monitoramento de processo é cobrado por mês enquanto ativo, e `monitoring_id`
-- (migration 42) é o ÚNICO caminho de volta para cancelá-lo. Apagar o processo
-- com o monitoramento em pé deixaria a cobrança correndo sem meio de encerrá-la
-- pelo sistema. Por isso, se houver qualquer processo monitorado, este bloco
-- ABORTA: cancele os monitoramentos primeiro (tela de detalhes do processo, ou
-- DELETE /api/buscaprocessos/monitoramentos/{id}) e rode de novo.
-- ============================================================

do $$
declare
  v_publicacoes  int;
  v_pub_partes   int;
  v_processos    int;
  v_movimentos   int;
  v_partes       int;
  v_docs_pub     int;
  v_cards        int;
  v_avisos       int;
  v_webhooks     int;
  v_monitorados  int;
  v_events_soltos      int;
  v_tasks_soltas       int;
  v_tasks_publicacao   int;
  v_docs_soltos        int;
  v_financeiro_soltos  int;
begin
  select count(*) into v_monitorados
    from public.legal_processes
    where monitoring_id is not null;

  if v_monitorados > 0 then
    raise exception
      'Expurgo abortado: % processo(s) com monitoramento ativo na BuscaProcessos. '
      'Apagá-los perderia o monitoring_id, e com ele a única forma de encerrar a '
      'cobrança mensal. Cancele os monitoramentos e rode de novo.', v_monitorados;
  end if;

  select count(*) into v_publicacoes from public.publications;
  select count(*) into v_pub_partes  from public.publication_parties;
  select count(*) into v_processos   from public.legal_processes;
  select count(*) into v_movimentos  from public.legal_process_movements;
  select count(*) into v_partes      from public.legal_process_parties;
  select count(*) into v_docs_pub    from public.legal_process_public_documents;
  select count(*) into v_webhooks    from public.webhook_events;

  select count(*) into v_cards
    from public.crm_items where workflow_id = 'wf-processos';

  select count(*) into v_avisos
    from public.notifications where entity_type = 'publication';

  -- O que apenas PERDE o vínculo (ON DELETE SET NULL). Contado antes do
  -- delete: depois já não há como identificar quem apontava para o quê.
  select count(*) into v_events_soltos
    from public.events where legal_process_id is not null;
  select count(*) into v_tasks_soltas
    from public.tasks where legal_process_id is not null;
  select count(*) into v_tasks_publicacao
    from public.tasks where publication_id is not null;
  select count(*) into v_docs_soltos
    from public.documents where legal_process_id is not null;
  select count(*) into v_financeiro_soltos
    from public.financial_entries where legal_process_id is not null;

  if v_publicacoes = 0 and v_processos = 0 and v_cards = 0 and v_webhooks = 0 then
    raise notice 'Nada a expurgar: sem processos, publicações, cards de wf-processos ou webhooks.';
    return;
  end if;

  -- 1. Avisos do sino que apontam para publicação. Antes das publicações
  --    porque `notifications` não tem FK — é vínculo frouxo por entity_id, e
  --    apagar a publicação primeiro deixaria o aviso sem como ser identificado.
  delete from public.notifications where entity_type = 'publication';

  -- 2. Publicações (cascata leva publication_parties). `duplicate_of_id`
  --    aponta para a própria tabela com ON DELETE SET NULL, então o delete em
  --    massa não precisa de ordem interna.
  delete from public.publications;

  -- 3. Log de webhooks recebidos.
  delete from public.webhook_events;

  -- 4. Cards do CRM em wf-processos (cascata leva comentários e histórico de
  --    etapa). Explícito porque `crm_items.legal_process_id` é SET NULL desde a
  --    migration 14 — apagar o processo deixaria o card órfão, não o removeria.
  delete from public.crm_items where workflow_id = 'wf-processos';

  -- 5. Processos (cascata leva movimentações, partes e documentos públicos).
  delete from public.legal_processes;

  raise notice '── Expurgo concluído ──';
  raise notice 'publicações apagadas .......... %', v_publicacoes;
  raise notice '  partes (cascata) ............ %', v_pub_partes;
  raise notice 'processos apagados ............ %', v_processos;
  raise notice '  movimentações (cascata) ..... %', v_movimentos;
  raise notice '  partes (cascata) ............ %', v_partes;
  raise notice '  docs públicos (cascata) ..... %', v_docs_pub;
  raise notice 'cards wf-processos apagados ... %', v_cards;
  raise notice 'avisos de publicação apagados . %', v_avisos;
  raise notice 'webhook_events apagados ....... %', v_webhooks;
  raise notice '── Mantidos, apenas sem vínculo ──';
  raise notice 'events que perderam o processo ...... %', v_events_soltos;
  raise notice 'tasks que perderam o processo ....... %', v_tasks_soltas;
  raise notice 'tasks que perderam a publicação ..... %', v_tasks_publicacao;
  raise notice 'documents que perderam o processo ... %', v_docs_soltos;
  raise notice 'lançamentos que perderam o processo . %', v_financeiro_soltos;
  raise notice 'MANTIDOS: clientes, cards de outros workflows, activities e o bucket attachments.';
end $$;
