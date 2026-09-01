-- ============================================================
-- 41 — Expurgo dos processos de teste
--
-- ⚠️ MIGRATION DE DADOS, NÃO DE SCHEMA. Apaga linhas de produção.
--    Não edite este arquivo para "rodar de novo": escreva uma nova migration.
--
-- Contexto: a base tinha processos fictícios, com números CNJ que não existem
-- em tribunal nenhum. Antes de ligar a API BuscaProcessos com a chave real, eles
-- precisam sair — do contrário o monitoramento consultaria CNJs inexistentes a
-- cada ciclo.
--
-- Escopo confirmado com o usuário: tudo que nasceu de processo.
--
--   legal_processes           → apagados (cascata: movimentações e partes)
--   crm_items de wf-processos → apagados (cascata: comentários e histórico)
--   events / tasks            → apagados quando vinculados a um dos dois
--   documents / financial_entries → idem
--
-- Ordem importa: os vínculos de events/tasks/documents/financial_entries são
-- ON DELETE SET NULL. Se os processos saíssem primeiro, o legal_process_id
-- viraria null e não haveria mais como identificar o que apagar.
--
-- FORA DE ESCOPO (relatado ao usuário, não tocado aqui):
--   · arquivos no bucket `attachments` — as linhas de `documents` saem, os
--     objetos no storage ficam;
--   · `activities` — o feed é registro do que aconteceu, e aconteceu;
--   · clientes, e cards de CRM de outros workflows que apontavam para um
--     processo (esses apenas perdem o vínculo).
-- ============================================================

do $$
declare
  v_processos    int;
  v_cards        int;
  v_events       int;
  v_tasks        int;
  v_docs         int;
  v_financeiro   int;
  v_movimentos   int;
  v_partes       int;
  v_cards_outros int;
begin
  select count(*) into v_processos  from public.legal_processes;
  select count(*) into v_movimentos from public.legal_process_movements;
  select count(*) into v_partes     from public.legal_process_parties;
  select count(*) into v_cards      from public.crm_items where workflow_id = 'wf-processos';
  select count(*) into v_cards_outros
    from public.crm_items
    where workflow_id <> 'wf-processos' and legal_process_id is not null;

  if v_processos = 0 and v_cards = 0 then
    raise notice 'Nada a expurgar: nenhum processo e nenhum card em wf-processos.';
    return;
  end if;

  create temporary table _alvo_processos on commit drop as
    select id from public.legal_processes;

  create temporary table _alvo_cards on commit drop as
    select id from public.crm_items where workflow_id = 'wf-processos';

  -- 1. Dependentes de vínculo frouxo (SET NULL) — precisam sair antes.
  with removidos as (
    delete from public.events
    where legal_process_id in (select id from _alvo_processos)
       or crm_item_id      in (select id from _alvo_cards)
    returning 1
  ) select count(*) into v_events from removidos;

  with removidos as (
    delete from public.tasks
    where legal_process_id in (select id from _alvo_processos)
       or crm_item_id      in (select id from _alvo_cards)
    returning 1
  ) select count(*) into v_tasks from removidos;

  with removidos as (
    delete from public.documents
    where legal_process_id in (select id from _alvo_processos)
       or crm_item_id      in (select id from _alvo_cards)
    returning 1
  ) select count(*) into v_docs from removidos;

  with removidos as (
    delete from public.financial_entries
    where legal_process_id in (select id from _alvo_processos)
       or crm_item_id      in (select id from _alvo_cards)
    returning 1
  ) select count(*) into v_financeiro from removidos;

  -- 2. Cards do CRM (cascata leva comentários e histórico de etapa).
  delete from public.crm_items where id in (select id from _alvo_cards);

  -- 3. Processos (cascata leva movimentações e partes).
  delete from public.legal_processes where id in (select id from _alvo_processos);

  raise notice '── Expurgo concluído ──';
  raise notice 'processos apagados ............ %', v_processos;
  raise notice '  movimentações (cascata) ..... %', v_movimentos;
  raise notice '  partes (cascata) ............ %', v_partes;
  raise notice 'cards wf-processos apagados ... %', v_cards;
  raise notice 'eventos apagados .............. %', v_events;
  raise notice 'tarefas apagadas .............. %', v_tasks;
  raise notice 'documentos apagados ........... %', v_docs;
  raise notice 'lancamentos apagados .......... %', v_financeiro;
  raise notice 'MANTIDOS: % card(s) de outros workflows que apontavam para um processo (apenas perderam o vinculo).', v_cards_outros;
  raise notice 'MANTIDOS: arquivos no bucket attachments e o feed de activities.';
end $$;
