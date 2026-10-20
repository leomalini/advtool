-- ============================================================
-- 75 — O COMPROMISSO DE AUDIÊNCIA PERDIA O CARD E O CLIENTE
--
-- Defeito da 74, encontrado conferindo o backfill na base real.
--
-- `apply_movement_hearing_event` resolvia card, cliente e responsável numa
-- consulta só, filtrada por `ci.assigned_to is not null`. Quando nenhum card do
-- processo tem responsável, a consulta não devolve linha — e o compromisso
-- perde o vínculo com o card E com o cliente, não só o responsável.
--
-- Não é hipótese: os dois processos com audiência agendada em 20/10/2026 têm
-- card de `wf-processos` com `assigned_to` nulo, e os dois eventos nasceram com
-- `crm_item_id` nulo. Sem o card, a audiência não aparece na aba Agenda do
-- card no CRM.
--
-- A correção separa as duas perguntas, que são independentes: QUAL card é este
-- processo, e QUEM responde por ele.
--
-- O `update` passa a preencher card e cliente também, com `coalesce` sobre o
-- valor atual: o backfill conserta as linhas já criadas sem desfazer uma
-- alteração feita na tela.
-- ============================================================

create or replace function public.apply_movement_hearing_event(
  m public.legal_process_movements
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_type     text;
  v_assignee uuid;
  v_client   uuid;
  v_crm_item uuid;
  v_label    text;
  v_title    text;
  v_body     text;
begin
  if m.hearing_slot is null or m.hearing_at is null then
    return;
  end if;

  select id into v_type
    from public.event_types
   order by (id = 'hearing') desc, position, id
   limit 1;
  if v_type is null then
    return;
  end if;

  -- QUAL card é este processo, e de quem é o caso. Sem filtro por
  -- responsável: o card existe mesmo quando ninguém está designado nele, e é
  -- ele que liga o compromisso à aba Agenda do CRM.
  select ci.id, ci.client_id
    into v_crm_item, v_client
    from public.crm_items ci
   where ci.legal_process_id = m.legal_process_id
   order by (ci.workflow_id = 'wf-processos') desc, ci.created_at
   limit 1;

  -- QUEM responde: o do card de processos, depois o de qualquer card do
  -- processo, depois o primeiro admin ativo.
  select ci.assigned_to into v_assignee
    from public.crm_items ci
   where ci.legal_process_id = m.legal_process_id
     and ci.assigned_to is not null
   order by (ci.workflow_id = 'wf-processos') desc, ci.created_at
   limit 1;

  if v_assignee is null then
    select id into v_assignee
      from public.profiles
     where is_active and role = 'admin'
     order by created_at
     limit 1;
  end if;

  -- `events.assigned_to` e `events.created_by` são NOT NULL e não existe
  -- usuário "sistema". Sem ninguém a quem atribuir, não grava.
  if v_assignee is null then
    return;
  end if;

  v_label := case m.hearing_slot
    when 'una'         then 'Audiência Una'
    when 'conciliacao' then 'Audiência de Conciliação'
    when 'instrucao'   then 'Audiência de Instrução e Julgamento'
    else                    'Audiência'
  end;

  v_title := v_label || ' (a confirmar)';
  v_body  := 'Data lida automaticamente do andamento de '
             || to_char((m.movement_date at time zone 'UTC')::date, 'DD/MM/YYYY')
             || ': "' || left(coalesce(nullif(btrim(m.title), ''), m.description), 300) || '". '
             || 'Confira nos autos antes de se comprometer.';

  select id into v_event_id
    from public.events
   where legal_process_id = m.legal_process_id
     and hearing_slot = m.hearing_slot;

  if v_event_id is null then
    insert into public.events (
      title, description, type, start_at, end_at, all_day,
      legal_process_id, crm_item_id, client_id,
      assigned_to, created_by, movement_id, hearing_slot
    )
    values (
      v_title, v_body, v_type, m.hearing_at, m.hearing_at, false,
      m.legal_process_id, v_crm_item, v_client,
      v_assignee, v_assignee, m.id, m.hearing_slot
    )
    returning id into v_event_id;
  else
    -- Remarcação: a mesma audiência em outra data. Move, não duplica.
    --
    -- `coalesce` em card e cliente: preenche o que faltava (é o que conserta as
    -- linhas criadas pela 74) sem sobrescrever um vínculo ajustado na tela.
    -- `assigned_to` e `created_by` seguem intocados pela mesma razão.
    update public.events
       set title       = v_title,
           description = v_body,
           start_at    = m.hearing_at,
           end_at      = m.hearing_at,
           all_day     = false,
           movement_id = m.id,
           crm_item_id = coalesce(crm_item_id, v_crm_item),
           client_id   = coalesce(client_id, v_client)
     where id = v_event_id;
  end if;

  insert into public.event_assignees (event_id, profile_id)
  values (v_event_id, v_assignee)
  on conflict do nothing;
end $$;

revoke all on function public.apply_movement_hearing_event(public.legal_process_movements)
  from public, anon, authenticated;


-- ── Backfill: reconserta os compromissos que a 74 criou ──────────────────────

do $$
declare
  v_fixed int;
  r public.legal_process_movements;
begin
  for r in
    select *
      from public.legal_process_movements
     where hearing_slot is not null
       and hearing_at is not null
     order by movement_date, created_at
  loop
    perform public.apply_movement_hearing_event(r);
  end loop;

  select count(*) into v_fixed
    from public.events
   where movement_id is not null
     and crm_item_id is not null;

  raise notice '── Vínculos de audiência ──';
  raise notice 'compromissos com card vinculado ... %', v_fixed;
end $$;
