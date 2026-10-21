-- ============================================================
-- 77 — AUDIÊNCIAS: CHECKLIST DE PREPARAÇÃO
--
-- Fase 3 de docs/audiencias.md. Cada audiência ganha um checklist copiado de
-- modelos por tipo e por área, e os itens com prazo viram tarefas datadas
-- relativas à audiência (D-15, D-3, D-1) no módulo de Tarefas.
--
-- ── Quando o checklist nasce ────────────────────────────────────────────────
--
-- Quando a audiência está `designada` E com a data conferida — decisão
-- aprovada na fase 1: tarefa com prazo calculado sobre uma data mal lida do
-- andamento é pior que tarefa nenhuma. Na prática:
--
--   cadastrada à mão (Agenda, processo)  → nasce conferida → checklist na hora
--   lida do andamento                    → checklist no "Conferi nos autos"
--   sem data                             → checklist quando a data entra
--
-- Uma vez só (`hearings.checklist_generated_at`): quem apagou um item não o vê
-- voltar porque a audiência foi remarcada e conferida de novo.
--
-- ── O que acompanha o quê ──────────────────────────────────────────────────
--
--   remarcação          → as tarefas pendentes andam junto (gatilho em
--                         `hearing_date_changes`, por onde TODA mudança de data
--                         passa: andamento, Agenda, ficha)
--   tarefa concluída    → nunca é alterada nem apagada (a mesma regra das
--                         séries da Agenda, migration 52)
--   tarefa concluída em Tarefas → o item do checklist fica feito
--   item marcado no checklist   → a tarefa fica concluída
--   audiência encerrada (cancelada, e na fase 4 realizada / não realizada)
--                       → as tarefas ainda intocadas (`todo`) saem; reativar
--                         a audiência as recria
--
-- ⚠️ A área do caso vem de `crm_items.legal_area` do card de processos. Medido
-- em 20/10/2026: os 8 cards da base têm a área NULA. Os modelos por área ficam
-- prontos, mas só se aplicam a partir do momento em que a área é preenchida;
-- os itens gerais e os por tipo valem já.
-- ============================================================


-- ── 1. Modelos ──────────────────────────────────────────────────────────────

create table if not exists public.hearing_checklist_templates (
  id            uuid primary key default gen_random_uuid(),
  /** Nulo = vale para todos os tipos. */
  kind_id       text
    constraint hearing_checklist_templates_kind_id_fkey
    references public.hearing_kinds(id) on delete cascade,
  /** Nulo = vale para todas as áreas. Mesmo vocabulário de
   * `crm_items.legal_area` e de `clients.legal_areas` (migration 53). */
  legal_area    text
    check (legal_area is null or legal_area in (
      'trabalhista', 'civel', 'familia', 'tributario',
      'criminal', 'previdenciario', 'consumidor'
    )),
  label         text not null check (length(btrim(label)) between 1 and 200),
  /** Dias antes da audiência. Nulo = sem prazo (item só de conferência). */
  offset_days   integer check (offset_days is null or offset_days between 0 and 365),
  creates_task  boolean not null default true,
  /** Entra no "o que levar" da mensagem ao cliente (fase 5). */
  client_brings boolean not null default false,
  position      integer not null default 0,
  is_system     boolean not null default false,
  created_at    timestamptz not null default now(),

  -- Tarefa precisa de data.
  constraint chk_hearing_checklist_templates_task_needs_offset
    check (not creates_task or offset_days is not null)
);

create index if not exists idx_hearing_checklist_templates_kind
  on public.hearing_checklist_templates(kind_id, position);

-- Apoio, como `hearing_kinds` na 76: todo mundo lê, só o admin altera.
select public.apply_rbac_policies(
  'hearing_checklist_templates',
  '*', 'configuracoes:manage', 'configuracoes:manage', 'configuracoes:manage'
);

-- O checklist-padrão aprovado pelo usuário em 2026-10-20. Idempotente pelo
-- rótulo + tipo + área, para a migration poder rodar de novo.
insert into public.hearing_checklist_templates
  (kind_id, legal_area, label, offset_days, creates_task, client_brings, position, is_system)
select v.kind_id, v.legal_area, v.label, v.offset_days, true, v.client_brings, v.position, true
  from (values
    (null::text,     null::text, 'Conferir data, horário e local ou link nos autos',            7,  false, 0),
    (null,           null,       'Confirmar a presença do cliente',                              3,  false, 1),
    (null,           null,       'Enviar ao cliente o endereço ou link e as orientações',        1,  false, 2),
    (null,           null,       'Revisar os autos e o roteiro da audiência',                    1,  false, 3),
    ('conciliacao',  null,       'Definir com o cliente a proposta e o limite de acordo',        5,  false, 0),
    ('mediacao',     null,       'Definir com o cliente a proposta e o limite de acordo',        5,  false, 0),
    ('una',          null,       'Carta de preposição e preposto (quando o cliente é empresa)',  5,  true,  0),
    ('una',          null,       'Confirmar as testemunhas que comparecem sem intimação',        5,  false, 1),
    ('inicial',      null,       'Carta de preposição e preposto (quando o cliente é empresa)',  5,  true,  0),
    ('inicial',      null,       'Confirmar as testemunhas que comparecem sem intimação',        5,  false, 1),
    ('instrucao',    null,       'Protocolar o rol de testemunhas (conferir o prazo no despacho)', 15, false, 0),
    ('instrucao',    null,       'Avisar as testemunhas',                                        7,  false, 1),
    ('instrucao',    null,       'Separar os documentos originais',                              2,  true,  2),
    (null,           'familia',  'Reunir documentos e comprovantes do cliente',                  3,  true,  0),
    ('anpp',         null,       'Revisar com o cliente as condições do acordo',                 3,  false, 0)
  ) as v(kind_id, legal_area, label, offset_days, client_brings, position)
 where not exists (
   select 1 from public.hearing_checklist_templates t
    where t.label = v.label
      and t.kind_id is not distinct from v.kind_id
      and t.legal_area is not distinct from v.legal_area
 );


-- ── 2. O checklist de cada audiência ────────────────────────────────────────

create table if not exists public.hearing_checklist_items (
  id            uuid primary key default gen_random_uuid(),
  hearing_id    uuid not null
    constraint hearing_checklist_items_hearing_id_fkey
    references public.hearings(id) on delete cascade,
  /** De qual modelo veio. Nulo = item acrescentado na ficha. */
  template_id   uuid
    constraint hearing_checklist_items_template_id_fkey
    references public.hearing_checklist_templates(id) on delete set null,
  label         text not null check (length(btrim(label)) between 1 and 200),
  offset_days   integer check (offset_days is null or offset_days between 0 and 365),
  client_brings boolean not null default false,
  position      integer not null default 0,
  /** A tarefa que este item criou. Apagar a tarefa não apaga o item. */
  task_id       uuid
    constraint hearing_checklist_items_task_id_fkey
    references public.tasks(id) on delete set null,
  done_at       timestamptz,
  done_by       uuid
    constraint hearing_checklist_items_done_by_fkey
    references public.profiles(id) on delete set null,
  /** "Não se aplica": conta como resolvido para a audiência ficar pronta. */
  skipped_at    timestamptz,
  skipped_by    uuid
    constraint hearing_checklist_items_skipped_by_fkey
    references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint chk_hearing_checklist_items_one_state
    check (done_at is null or skipped_at is null)
);

create index if not exists idx_hearing_checklist_items_hearing
  on public.hearing_checklist_items(hearing_id, position);
create unique index if not exists uq_hearing_checklist_items_task
  on public.hearing_checklist_items(task_id)
  where task_id is not null;

-- Marcar item é a interação corriqueira: cai em `:update`, como o checklist
-- das tarefas na 37.
select public.apply_rbac_policies(
  'hearing_checklist_items',
  'agenda:view', 'agenda:update', 'agenda:update', 'agenda:update'
);


-- ── 3. Colunas novas na ficha ───────────────────────────────────────────────

alter table public.hearings
  add column if not exists checklist_generated_at timestamptz,
  /** A exceção do Quadro: pronta mesmo com itens pendentes. */
  add column if not exists ready_override_at timestamptz,
  add column if not exists ready_override_by uuid
    constraint hearings_ready_override_by_fkey
    references public.profiles(id) on delete set null;


-- ── 4. Tarefa de um item ────────────────────────────────────────────────────

/** O dia da tarefa: a audiência menos o prazo, no relógio de Brasília. Nunca
 * antes de hoje — tarefa criada já vencida conta uma história falsa ("atrasou
 * 10 dias") sobre algo que acabou de nascer. */
create or replace function public.hearing_checklist_due(
  p_start_at timestamptz,
  p_offset   integer
)
returns date
language sql
stable
as $$
  select greatest(
    (p_start_at at time zone 'America/Sao_Paulo')::date - p_offset,
    (now() at time zone 'America/Sao_Paulo')::date
  )
$$;

/** Cria a tarefa do item, quando cabe uma: item com prazo, sem tarefa, ainda
 * em aberto, numa audiência designada que não aconteceu. */
create or replace function public.create_hearing_checklist_task(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item    public.hearing_checklist_items;
  v_hearing public.hearings;
  v_event   public.events;
  v_task_id uuid;
begin
  select * into v_item from public.hearing_checklist_items where id = p_item_id;
  if not found
     or v_item.offset_days is null
     or v_item.task_id is not null
     or v_item.done_at is not null
     or v_item.skipped_at is not null then
    return;
  end if;

  select * into v_hearing from public.hearings where id = v_item.hearing_id;
  if v_hearing.status <> 'designada' or v_hearing.event_id is null then
    return;
  end if;

  select * into v_event from public.events where id = v_hearing.event_id;
  if v_event.start_at <= now() then
    return;
  end if;

  insert into public.tasks (
    title, description, status, priority,
    assigned_to, client_id, crm_item_id, legal_process_id,
    due_date, created_by
  )
  values (
    -- 200 é o limite do título no formulário de tarefas (task.schema.ts).
    left(
      v_item.label || ' — ' || public.hearing_event_title(v_hearing.kind_id) || ' '
        || to_char(v_event.start_at at time zone 'America/Sao_Paulo', 'DD/MM'),
      200
    ),
    'Item do checklist da audiência de '
      || to_char(v_event.start_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
      || '. Concluir aqui marca o item na ficha da audiência.',
    'todo', 'medium',
    v_event.assigned_to, v_event.client_id, v_event.crm_item_id, v_hearing.legal_process_id,
    public.hearing_checklist_due(v_event.start_at, v_item.offset_days),
    coalesce(auth.uid(), v_hearing.date_confirmed_by, v_event.created_by)
  )
  returning id into v_task_id;

  update public.hearing_checklist_items set task_id = v_task_id where id = v_item.id;
end $$;


/** Copia os modelos que valem para a audiência e cria as tarefas. Uma vez por
 * audiência. */
create or replace function public.generate_hearing_checklist(p_hearing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hearing public.hearings;
  v_area    text;
  r         record;
begin
  select * into v_hearing from public.hearings where id = p_hearing_id for update;
  if not found or v_hearing.checklist_generated_at is not null then
    return;
  end if;

  -- A área do caso: a do card de processos, como em toda a aplicação.
  select ci.legal_area into v_area
    from public.crm_items ci
   where ci.legal_process_id = v_hearing.legal_process_id
     and ci.legal_area is not null
   order by (ci.workflow_id = 'wf-processos') desc, ci.created_at
   limit 1;

  -- Gerais primeiro, depois os do tipo, depois os da área.
  insert into public.hearing_checklist_items
    (hearing_id, template_id, label, offset_days, client_brings, position)
  select v_hearing.id, t.id, t.label,
         case when t.creates_task then t.offset_days else null end,
         t.client_brings,
         row_number() over (
           order by (t.kind_id is not null), (t.legal_area is not null), t.position, t.created_at
         )
    from public.hearing_checklist_templates t
   where (t.kind_id is null or t.kind_id = v_hearing.kind_id)
     and (t.legal_area is null or t.legal_area = v_area);

  update public.hearings set checklist_generated_at = now() where id = v_hearing.id;

  for r in
    select id from public.hearing_checklist_items
     where hearing_id = v_hearing.id
     order by position
  loop
    perform public.create_hearing_checklist_task(r.id);
  end loop;
end $$;

revoke all on function public.hearing_checklist_due(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.create_hearing_checklist_task(uuid) from public, anon, authenticated;
revoke all on function public.generate_hearing_checklist(uuid) from public, anon, authenticated;


-- ── 5. Gatilhos ─────────────────────────────────────────────────────────────

-- Ficha: nasce o checklist quando ela fica designada e conferida; ao encerrar,
-- saem as tarefas intocadas; ao reativar, voltam.
create or replace function public.sync_hearing_checklist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if new.status = 'designada'
     and new.date_confirmed_at is not null
     and new.checklist_generated_at is null then
    perform public.generate_hearing_checklist(new.id);
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status not in ('a_designar', 'designada') then
      -- Encerrou: tarefa de preparação intocada não tem mais objeto. A que
      -- alguém começou ou concluiu fica — é trabalho de alguém.
      delete from public.tasks t
       using public.hearing_checklist_items i
       where i.hearing_id = new.id
         and i.task_id = t.id
         and t.status = 'todo';
    elsif new.status = 'designada' and old.status not in ('a_designar', 'designada') then
      -- Reativada: o que ainda está em aberto ganha a tarefa de volta.
      for r in
        select id from public.hearing_checklist_items
         where hearing_id = new.id and task_id is null
      loop
        perform public.create_hearing_checklist_task(r.id);
      end loop;
    end if;
  end if;

  return null;
end $$;

revoke all on function public.sync_hearing_checklist() from public, anon, authenticated;

drop trigger if exists sync_hearing_checklist on public.hearings;
create trigger sync_hearing_checklist
  after insert or update of status, date_confirmed_at
  on public.hearings
  for each row execute function public.sync_hearing_checklist();


-- Remarcação: as tarefas pendentes andam junto. `hearing_date_changes` é o
-- ponto por onde passa toda mudança de data (andamento, Agenda, ficha), então
-- um gatilho só cobre os três caminhos.
create or replace function public.move_hearing_checklist_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tasks t
     set due_date = public.hearing_checklist_due(new.to_start_at, i.offset_days)
    from public.hearing_checklist_items i
   where i.hearing_id = new.hearing_id
     and i.task_id = t.id
     and i.offset_days is not null
     and t.status <> 'done';
  return null;
end $$;

revoke all on function public.move_hearing_checklist_tasks() from public, anon, authenticated;

drop trigger if exists move_hearing_checklist_tasks on public.hearing_date_changes;
create trigger move_hearing_checklist_tasks
  after insert on public.hearing_date_changes
  for each row execute function public.move_hearing_checklist_tasks();


-- Tarefa concluída (ou reaberta) em Tarefas → o item acompanha.
create or replace function public.sync_checklist_item_from_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'done' then
    update public.hearing_checklist_items
       set done_at = now(),
           done_by = coalesce(auth.uid(), done_by),
           skipped_at = null,
           skipped_by = null
     where task_id = new.id
       and done_at is null;
  else
    update public.hearing_checklist_items
       set done_at = null,
           done_by = null
     where task_id = new.id
       and done_at is not null;
  end if;
  return null;
end $$;

revoke all on function public.sync_checklist_item_from_task() from public, anon, authenticated;

drop trigger if exists sync_checklist_item_from_task on public.tasks;
create trigger sync_checklist_item_from_task
  after update of status on public.tasks
  for each row
  when (old.status is distinct from new.status)
  execute function public.sync_checklist_item_from_task();


-- ── 6. Ações da ficha ───────────────────────────────────────────────────────
--
-- `security definer` com a permissão conferida à mão: marcar o item mexe na
-- tarefa que ele criou, e quem prepara a audiência (agenda:update) tem de
-- conseguir fazer isso mesmo sem `tarefas:update`. A tarefa é o espelho do
-- item, não um trabalho à parte.

/** p_state: 'done' | 'pending' | 'skipped'. */
create or replace function public.set_hearing_checklist_item(
  p_item_id uuid,
  p_state   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_item public.hearing_checklist_items;
  v_task public.tasks;
begin
  if v_uid is null or not public.can('agenda', 'update') then
    raise exception 'Sem permissão para alterar audiências' using errcode = '42501';
  end if;
  if p_state not in ('done', 'pending', 'skipped') then
    raise exception 'Estado inválido: %', p_state using errcode = '22023';
  end if;

  select * into v_item from public.hearing_checklist_items where id = p_item_id for update;
  if not found then
    raise exception 'Item não encontrado' using errcode = 'P0002';
  end if;

  if v_item.task_id is not null then
    select * into v_task from public.tasks where id = v_item.task_id;
  end if;

  if p_state = 'done' then
    update public.hearing_checklist_items
       set done_at = now(), done_by = v_uid, skipped_at = null, skipped_by = null
     where id = v_item.id;
    if v_task.id is not null and v_task.status <> 'done' then
      update public.tasks set status = 'done' where id = v_task.id;
    end if;

  elsif p_state = 'pending' then
    update public.hearing_checklist_items
       set done_at = null, done_by = null, skipped_at = null, skipped_by = null
     where id = v_item.id;
    if v_task.id is not null and v_task.status = 'done' then
      update public.tasks set status = 'todo' where id = v_task.id;
    end if;
    -- Voltou de "não se aplica": a tarefa, que saiu, volta.
    perform public.create_hearing_checklist_task(v_item.id);

  else
    update public.hearing_checklist_items
       set skipped_at = now(), skipped_by = v_uid, done_at = null, done_by = null
     where id = v_item.id;
    -- A tarefa intocada sai; a que alguém já mexeu fica, solta do item.
    if v_task.id is not null then
      update public.hearing_checklist_items set task_id = null where id = v_item.id;
      if v_task.status = 'todo' then
        delete from public.tasks where id = v_task.id;
      end if;
    end if;
  end if;
end $$;

revoke all on function public.set_hearing_checklist_item(uuid, text) from public, anon;
grant execute on function public.set_hearing_checklist_item(uuid, text) to authenticated;


/** Item acrescentado na ficha. Com prazo, ganha tarefa como os do modelo. */
create or replace function public.add_hearing_checklist_item(
  p_hearing_id  uuid,
  p_label       text,
  p_offset_days integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_position integer;
begin
  if auth.uid() is null or not public.can('agenda', 'update') then
    raise exception 'Sem permissão para alterar audiências' using errcode = '42501';
  end if;
  if not exists (select 1 from public.hearings where id = p_hearing_id) then
    raise exception 'Audiência não encontrada' using errcode = 'P0002';
  end if;

  select coalesce(max(position), 0) + 1 into v_position
    from public.hearing_checklist_items
   where hearing_id = p_hearing_id;

  insert into public.hearing_checklist_items (hearing_id, label, offset_days, position)
  values (p_hearing_id, btrim(p_label), p_offset_days, v_position)
  returning id into v_id;

  perform public.create_hearing_checklist_task(v_id);
  return v_id;
end $$;

revoke all on function public.add_hearing_checklist_item(uuid, text, integer) from public, anon;
grant execute on function public.add_hearing_checklist_item(uuid, text, integer) to authenticated;


/** Tira o item; a tarefa dele sai junto se ninguém a tocou. */
create or replace function public.remove_hearing_checklist_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
begin
  if auth.uid() is null or not public.can('agenda', 'update') then
    raise exception 'Sem permissão para alterar audiências' using errcode = '42501';
  end if;

  delete from public.hearing_checklist_items
   where id = p_item_id
  returning task_id into v_task_id;
  if not found then
    raise exception 'Item não encontrado' using errcode = 'P0002';
  end if;

  if v_task_id is not null then
    delete from public.tasks where id = v_task_id and status = 'todo';
  end if;
end $$;

revoke all on function public.remove_hearing_checklist_item(uuid) from public, anon;
grant execute on function public.remove_hearing_checklist_item(uuid) to authenticated;


-- ── 7. Backfill ─────────────────────────────────────────────────────────────
--
-- Audiências já designadas e conferidas ganham o checklist agora. Na base de
-- 20/10/2026 não há nenhuma (as duas com data vieram do andamento e esperam
-- conferência), então isto não deve criar nada — e o aviso diz.

do $$
declare
  v_templates int;
  v_before    int;
  v_after     int;
  r record;
begin
  select count(*) into v_templates from public.hearing_checklist_templates;
  select count(*) into v_before from public.hearing_checklist_items;

  for r in
    select id from public.hearings
     where status = 'designada'
       and date_confirmed_at is not null
       and checklist_generated_at is null
  loop
    perform public.generate_hearing_checklist(r.id);
  end loop;

  select count(*) into v_after from public.hearing_checklist_items;

  raise notice '── Checklist de audiências ──';
  raise notice 'modelos .............................. %', v_templates;
  raise notice 'itens criados agora .................. %', v_after - v_before;
end $$;
