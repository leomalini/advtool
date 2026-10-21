-- ============================================================
-- 76 — AUDIÊNCIAS: A FICHA
--
-- Fase 1 de docs/audiencias.md. Até aqui audiência era só um `events` com
-- `type = 'hearing'`, e o evento não tem status: a Agenda não sabe dizer se a
-- audiência foi realizada, cancelada ou remarcada. Esta migration cria a FICHA
-- da audiência, ligada 1:1 ao evento, e muda a 74 para gravar nela.
--
-- ── O desenho ───────────────────────────────────────────────────────────────
--
-- O evento continua sendo o horário na Agenda; a ficha guarda o que só
-- audiência tem. A DATA MORA SÓ NO EVENTO (`start_at`/`end_at`): duas cópias
-- divergiriam no primeiro arrastar na Agenda. Por isso:
--
--   ficha sem evento   = audiência sem data (`a_designar`)
--   cancelar           = `show_in_agenda = false`, e não excluir o evento —
--                        a data e os anexos continuam existindo
--   excluir o evento   = excluir a audiência (`on delete cascade`)
--
-- ── Os quatro defeitos da 74 que esta migration corrige ─────────────────────
--
-- 1. A 74 procurava o compromisso por (processo, slot) sem olhar se a audiência
--    já tinha acontecido: uma segunda conciliação designada no mesmo processo
--    MOVIA o evento da primeira, e o índice `uq_events_hearing` impedia que
--    existissem duas. Agora a busca é pela ficha ATIVA do mesmo tipo.
-- 2. A pendência "audiência sem data" contava movimentações. Cadastrar a data
--    à mão não mudava a movimentação, então a pendência nunca saía. Pior: na
--    base real ela está acesa POR ENGANO no processo 319c1e2e — a conciliação
--    de 06/10 tem data, mas o mesmo ato chegou de novo em 25/09 no formato
--    codificado da TPU ("de Conciliação — designada: 9"), sem data. Agora a
--    pendência conta fichas `a_designar`.
-- 3. A remarcação reescrevia `title` e `description` do evento, desfazendo
--    qualquer edição feita na tela. Agora o texto do evento só é escrito na
--    criação, e o "a confirmar" sai do título para a ficha
--    (`date_confirmed_at`).
-- 4. O evento nascia com `start_at = end_at`. Agora ganha a duração padrão do
--    tipo de audiência — sem duração não há conflito de pauta a calcular.
--
-- ── Medido na base real em 20/10/2026, antes de escrever ────────────────────
--
-- 10 movimentações de audiência em 2 processos, 2 eventos (os da 74), nenhum
-- evento `hearing` criado à mão. O par "Una designada para 13/10" →
-- "redesignada para 12/11" vira uma ficha com duas datas no histórico, e a
-- "de Instrução e Julgamento — designada: 9" do mesmo processo vira ficha sem
-- data — a mesma pendência que a 74 já mostrava.
-- ============================================================


-- ── 1. Tipos de audiência ───────────────────────────────────────────────────
--
-- Mesmo desenho de `event_types` (migration 32): id textual, seed do sistema,
-- editável pelo escritório. Um CHECK só mudaria por migration.

create table if not exists public.hearing_kinds (
  id                       text primary key,
  /** Rótulo curto, o dos chips e filtros: "Conciliação". */
  label                    text not null,
  /** Título do compromisso na Agenda: "Audiência de Conciliação". Nulo cai
   * para "Audiência — <label>". */
  event_title              text,
  default_duration_minutes integer not null default 60
    check (default_duration_minutes between 5 and 1440),
  position                 integer not null default 0,
  is_system                boolean not null default false,
  created_at               timestamptz not null default now()
);

-- Os ids de `legal_process_movements.hearing_slot` (migration 74) existem aqui
-- com o mesmo nome: 'una', 'conciliacao', 'instrucao', 'outra'. É o que deixa
-- a movimentação apontar o tipo sem tabela de tradução.
insert into public.hearing_kinds
  (id, label, event_title, default_duration_minutes, position, is_system)
values
  ('conciliacao',  'Conciliação',            'Audiência de Conciliação',            30,  0, true),
  ('mediacao',     'Mediação',               'Audiência de Mediação',               60,  1, true),
  ('inicial',      'Inicial',                'Audiência Inicial',                   30,  2, true),
  ('una',          'Una',                    'Audiência Una',                       60,  3, true),
  ('instrucao',    'Instrução e Julgamento', 'Audiência de Instrução e Julgamento', 120, 4, true),
  ('justificacao', 'Justificação',           'Audiência de Justificação',           60,  5, true),
  ('custodia',     'Custódia',               'Audiência de Custódia',               30,  6, true),
  ('anpp',         'Homologação de ANPP',    'Audiência de Homologação de ANPP',    30,  7, true),
  ('juri',         'Sessão do Júri',         'Sessão do Júri',                      480, 8, true),
  ('outra',        'Outra',                  'Audiência',                           60,  9, true)
on conflict (id) do nothing;

-- Apoio, como `event_types` na 37: todo mundo lê, só o admin altera.
select public.apply_rbac_policies(
  'hearing_kinds',
  '*', 'configuracoes:manage', 'configuracoes:manage', 'configuracoes:manage'
);


-- ── 2. A ficha ──────────────────────────────────────────────────────────────

create table if not exists public.hearings (
  id                uuid primary key default gen_random_uuid(),

  /** O horário na Agenda. Nulo = sem data. Excluir o evento exclui a
   * audiência: cancelar é pela ficha, que esconde o evento sem apagá-lo. */
  event_id          uuid unique
    constraint hearings_event_id_fkey
    references public.events(id) on delete cascade,

  /** Nulo quando a audiência foi criada na Agenda sem processo. Para a ficha
   * com evento, espelha `events.legal_process_id` (gatilho abaixo). */
  legal_process_id  uuid
    constraint hearings_legal_process_id_fkey
    references public.legal_processes(id) on delete set null,

  kind_id           text not null
    constraint hearings_kind_id_fkey
    references public.hearing_kinds(id) on delete restrict,

  /** Remarcação NÃO é status: é uma linha em `hearing_date_changes`.
   * `realizada` e `nao_realizada` entram na fase 4. */
  status            text not null default 'designada'
    check (status in ('a_designar', 'designada', 'realizada', 'nao_realizada', 'cancelada')),

  /** Nulo = ainda não informada. */
  modality          text
    check (modality is null or modality in ('presencial', 'virtual', 'hibrida')),

  /** Só http(s): o link vira `href` na tela, e `javascript:` ali seria XSS.
   * Endereço e sala ficam em `events.location`, que já existe. */
  meeting_url       text
    check (meeting_url is null or meeting_url ~* '^https?://\S+$'),

  source            text not null
    check (source in ('movimentacao', 'manual')),

  /** O ato mais recente que esta ficha segue. É a referência para decidir se
   * um ato que chega depois é mais novo ou mais velho que a data atual. */
  movement_id       uuid
    constraint hearings_movement_id_fkey
    references public.legal_process_movements(id) on delete set null,

  /** Nulo = data lida do texto do andamento, ainda não conferida nos autos. */
  date_confirmed_at timestamptz,
  date_confirmed_by uuid
    constraint hearings_date_confirmed_by_fkey
    references public.profiles(id) on delete set null,

  /** Quando a ficha saiu de `a_designar`/`designada`. Um ato com data de
   * andamento anterior a isto é história, e não reabre nada. */
  closed_at         timestamptz,

  /** Nulo quando foi o andamento que criou. */
  created_by        uuid
    constraint hearings_created_by_fkey
    references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Sem data é exatamente não ter evento; designada é exatamente ter.
  constraint chk_hearings_schedule check (
    (status <> 'a_designar' or event_id is null)
    and (status <> 'designada' or event_id is not null)
  )
);

comment on table public.hearings is
  'Ficha da audiência (migration 76). A data mora em events.start_at; a ficha '
  'sem evento é a audiência sem data. Ver docs/audiencias.md.';

create index if not exists idx_hearings_legal_process_id
  on public.hearings(legal_process_id);
create index if not exists idx_hearings_movement_id
  on public.hearings(movement_id)
  where movement_id is not null;
-- A busca do gatilho de andamento: a ficha ativa de (processo, tipo).
create index if not exists idx_hearings_active
  on public.hearings(legal_process_id, kind_id)
  where status in ('a_designar', 'designada');

drop trigger if exists set_updated_at on public.hearings;
create trigger set_updated_at before update on public.hearings
  for each row execute function public.set_updated_at();

-- A ficha não se lê sem o evento, então responde ao mesmo recurso. Um recurso
-- próprio poderia abrir a tela a quem não lê os dados — o mesmo argumento de
-- Movimentações com `processos`.
select public.apply_rbac_policies(
  'hearings',
  'agenda:view', 'agenda:create', 'agenda:update', 'agenda:delete'
);


-- ── 3. Histórico de datas ───────────────────────────────────────────────────

create table if not exists public.hearing_date_changes (
  id            uuid primary key default gen_random_uuid(),
  hearing_id    uuid not null
    constraint hearing_date_changes_hearing_id_fkey
    references public.hearings(id) on delete cascade,
  /** Nulo = a primeira data da audiência. */
  from_start_at timestamptz,
  to_start_at   timestamptz not null,
  /** Preenchido quando foi o andamento que mudou a data. */
  movement_id   uuid
    constraint hearing_date_changes_movement_id_fkey
    references public.legal_process_movements(id) on delete set null,
  /** Nulo quando foi o andamento (ou uma migration). */
  changed_by    uuid
    constraint hearing_date_changes_changed_by_fkey
    references public.profiles(id) on delete set null,
  /** `clock_timestamp()`, e não `now()`: o sync grava vários atos numa
   * instrução só, e com `now()` duas remarcações da mesma carga empatariam —
   * a tela não saberia qual veio primeiro. */
  changed_at    timestamptz not null default clock_timestamp()
);

create index if not exists idx_hearing_date_changes_hearing
  on public.hearing_date_changes(hearing_id, changed_at desc);
create index if not exists idx_hearing_date_changes_movement
  on public.hearing_date_changes(movement_id)
  where movement_id is not null;

-- Append-only, como `activities`: quem grava são os gatilhos e as funções
-- abaixo, todos `security definer`.
select public.apply_rbac_policies(
  'hearing_date_changes',
  'agenda:view', 'agenda:update', null, null
);


-- ── 4. Funções de apoio ─────────────────────────────────────────────────────

/** O tipo provável a partir de um texto livre — o título de um evento criado
 * na Agenda. Finalidade antes de formato, na mesma ordem da 74. */
create or replace function public.hearing_kind_from_text(p_text text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_text, '') ~* 'concilia'                then 'conciliacao'
    when coalesce(p_text, '') ~* 'media[çc][ãa]o'          then 'mediacao'
    when coalesce(p_text, '') ~* 'instru[çc][ãa]o'         then 'instrucao'
    when coalesce(p_text, '') ~* '\muna\M'                 then 'una'
    when coalesce(p_text, '') ~* '\minicial\M'             then 'inicial'
    when coalesce(p_text, '') ~* 'justifica[çc][ãa]o'      then 'justificacao'
    when coalesce(p_text, '') ~* 'cust[óo]dia'             then 'custodia'
    when coalesce(p_text, '') ~* '(\manpp\M|n[ãa]o persecu)' then 'anpp'
    when coalesce(p_text, '') ~* 'j[úu]ri'                 then 'juri'
    else 'outra'
  end
$$;

/** O tipo pedido, se ainda existir; senão 'outra'; senão o primeiro da
 * lista. O escritório pode apagar tipos, e gravar a movimentação não pode
 * falhar por isso. Nulo só com a tabela vazia. */
create or replace function public.resolve_hearing_kind(p_wanted text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select id
    from public.hearing_kinds
   order by (id = p_wanted) desc, (id = 'outra') desc, position, id
   limit 1
$$;

create or replace function public.hearing_event_title(p_kind_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select coalesce(event_title, 'Audiência — ' || label)
       from public.hearing_kinds where id = p_kind_id),
    'Audiência'
  )
$$;

create or replace function public.hearing_default_duration(p_kind_id text)
returns interval
language sql
stable
security definer
set search_path = public
as $$
  select make_interval(mins => coalesce(
    (select default_duration_minutes from public.hearing_kinds where id = p_kind_id),
    60
  ))
$$;

/** O tipo de evento das audiências: 'hearing', ou o primeiro da lista se o
 * escritório o apagou — a mesma regra das migrations 71 e 74. */
create or replace function public.hearing_event_type()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select id
    from public.event_types
   order by (id = 'hearing') desc, position, id
   limit 1
$$;

/** Card, cliente e responsável do processo, nas duas perguntas separadas da
 * migration 75. Sem responsável no card, cai para `p_fallback_assignee` (quem
 * está agendando) e, sem ele, para o primeiro admin ativo. */
create or replace function public.hearing_process_links(
  p_legal_process_id   uuid,
  p_fallback_assignee  uuid default null,
  out o_crm_item_id    uuid,
  out o_client_id      uuid,
  out o_assignee_id    uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_legal_process_id is not null then
    select ci.id, ci.client_id
      into o_crm_item_id, o_client_id
      from public.crm_items ci
     where ci.legal_process_id = p_legal_process_id
     order by (ci.workflow_id = 'wf-processos') desc, ci.created_at
     limit 1;

    select ci.assigned_to
      into o_assignee_id
      from public.crm_items ci
     where ci.legal_process_id = p_legal_process_id
       and ci.assigned_to is not null
     order by (ci.workflow_id = 'wf-processos') desc, ci.created_at
     limit 1;
  end if;

  o_assignee_id := coalesce(o_assignee_id, p_fallback_assignee);

  if o_assignee_id is null then
    select id into o_assignee_id
      from public.profiles
     where is_active and role = 'admin'
     order by created_at
     limit 1;
  end if;
end $$;

revoke all on function public.hearing_kind_from_text(text) from public, anon, authenticated;
revoke all on function public.resolve_hearing_kind(text) from public, anon, authenticated;
revoke all on function public.hearing_event_title(text) from public, anon, authenticated;
revoke all on function public.hearing_default_duration(text) from public, anon, authenticated;
revoke all on function public.hearing_event_type() from public, anon, authenticated;
revoke all on function public.hearing_process_links(uuid, uuid) from public, anon, authenticated;


-- ── 5. Andamento → ficha (substitui a função da 74/75) ──────────────────────
--
-- ⚠️ `advtool.hearing_sync`. As funções que escrevem a ficha E o evento ligam
-- esta configuração local antes de escrever em `events`, para o gatilho de
-- `events` (seção 6) ficar de fora: sem isso ele criaria uma segunda ficha
-- para o evento recém-criado, ou gravaria a remarcação duas vezes no
-- histórico. `set_config(..., true)` vale até o fim da transação, então cada
-- função desliga logo depois de escrever.

create or replace function public.apply_movement_hearing(
  m public.legal_process_movements
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind       text;
  v_hearing    public.hearings;
  v_current    public.legal_process_movements;
  v_manual_at  timestamptz;
  v_act_day    date;
  v_floor_day  date;
  v_links      record;
  v_type       text;
  v_event_id   uuid;
  v_old_start  timestamptz;
  v_old_end    timestamptz;
  v_old_allday boolean;
  v_duration   interval;
begin
  -- Sem slot o ato não designa audiência (a 74 já exclui "realizada",
  -- "cancelada" e "Juntada de Termo").
  if m.hearing_slot is null then
    return;
  end if;

  v_kind := public.resolve_hearing_kind(m.hearing_slot);
  if v_kind is null then
    return;
  end if;

  -- O dia do ato. `movement_date` é meia-noite UTC do dia (convenção da 72).
  v_act_day := (m.movement_date at time zone 'UTC')::date;

  -- ① O ato já pertence a uma ficha?
  select h.* into v_hearing
    from public.hearings h
   where h.movement_id = m.id
      or exists (
        select 1 from public.hearing_date_changes c
         where c.hearing_id = h.id and c.movement_id = m.id
      )
   order by h.created_at desc
   limit 1;

  if found then
    -- Ficha encerrada, ou ato que ela já superou: o ato é história. É o caso
    -- de um ressincronismo que reescreve `raw_data` de um ato antigo.
    if v_hearing.status not in ('a_designar', 'designada')
       or v_hearing.movement_id is distinct from m.id then
      return;
    end if;
  else
    -- ② Audiência deste tipo encerrada DEPOIS do ato: ele é anterior a ela, e
    -- reabrir criaria uma audiência que já aconteceu ou foi cancelada.
    if exists (
      select 1 from public.hearings h
       where h.legal_process_id = m.legal_process_id
         and h.kind_id = v_kind
         and h.closed_at is not null
         and (h.closed_at at time zone 'America/Sao_Paulo')::date >= v_act_day
    ) then
      return;
    end if;

    -- ③ A ficha ATIVA do mesmo tipo. Sem índice único: "continuação da
    -- instrução" é uma segunda instrução legítima, e a mais recente é a que
    -- o andamento move.
    select h.* into v_hearing
      from public.hearings h
     where h.legal_process_id = m.legal_process_id
       and h.kind_id = v_kind
       and h.status in ('a_designar', 'designada')
     order by h.created_at desc
     limit 1;

    if not found then
      -- ④ Audiência nova. Nasce sem data; a data, se houver, entra abaixo.
      insert into public.hearings (legal_process_id, kind_id, status, source, movement_id)
      values (m.legal_process_id, v_kind, 'a_designar', 'movimentacao', m.id)
      returning * into v_hearing;
    else
      if v_hearing.movement_id is not null then
        select * into v_current
          from public.legal_process_movements
         where id = v_hearing.movement_id;
      end if;

      -- Ato mais velho que o que a ficha segue: não volta a data.
      if v_current.id is not null
         and (v_current.movement_date, v_current.created_at, v_current.id)
             > (m.movement_date, m.created_at, m.id) then
        return;
      end if;

      -- Data posta por uma pessoa num dia posterior ao do ato: quem conferiu
      -- nos autos sabe mais que o texto atrasado. Mesmo dia passa — e a ficha
      -- volta a "a confirmar", que é o aviso certo.
      select max(c.changed_at) into v_manual_at
        from public.hearing_date_changes c
       where c.hearing_id = v_hearing.id
         and c.changed_by is not null;
      if v_manual_at is not null
         and (v_manual_at at time zone 'America/Sao_Paulo')::date > v_act_day then
        return;
      end if;

      if m.hearing_at is null then
        -- Designação sem data de uma audiência que já tem: só é notícia se o
        -- ato for de um DIA posterior ao que a ficha segue. Na base real, o
        -- mesmo ato chega duas vezes no mesmo dia — por extenso, com data, e
        -- no formato TPU, sem — e não pode tirar a confirmação da primeira.
        v_floor_day := coalesce(
          greatest(
            (v_current.movement_date at time zone 'UTC')::date,
            (v_manual_at at time zone 'America/Sao_Paulo')::date
          ),
          (v_hearing.created_at at time zone 'America/Sao_Paulo')::date
        );

        if v_hearing.status = 'designada' and v_act_day > v_floor_day then
          update public.hearings
             set movement_id = m.id,
                 date_confirmed_at = null,
                 date_confirmed_by = null
           where id = v_hearing.id;
        elsif v_hearing.status = 'a_designar' then
          update public.hearings set movement_id = m.id where id = v_hearing.id;
        end if;
        return;
      end if;
    end if;
  end if;

  -- Daqui em diante o ato traz data.
  if m.hearing_at is null then
    return;
  end if;

  if v_hearing.event_id is null then
    v_type := public.hearing_event_type();
    select * into v_links from public.hearing_process_links(m.legal_process_id);

    -- `events.assigned_to` e `created_by` são NOT NULL e não existe usuário
    -- "sistema". Sem tipo ou sem ninguém, a ficha fica sem data — e a
    -- pendência avisa, em vez de a audiência sumir.
    if v_type is null or v_links.o_assignee_id is null then
      return;
    end if;

    perform set_config('advtool.hearing_sync', 'on', true);

    insert into public.events (
      title, type, start_at, end_at, all_day,
      legal_process_id, crm_item_id, client_id,
      assigned_to, created_by, movement_id
    )
    values (
      public.hearing_event_title(v_kind), v_type,
      m.hearing_at, m.hearing_at + public.hearing_default_duration(v_kind), false,
      m.legal_process_id, v_links.o_crm_item_id, v_links.o_client_id,
      v_links.o_assignee_id, v_links.o_assignee_id, m.id
    )
    returning id into v_event_id;

    insert into public.event_assignees (event_id, profile_id)
    values (v_event_id, v_links.o_assignee_id)
    on conflict do nothing;

    perform set_config('advtool.hearing_sync', '', true);

    update public.hearings
       set event_id = v_event_id,
           status = 'designada',
           movement_id = m.id,
           date_confirmed_at = null,
           date_confirmed_by = null
     where id = v_hearing.id;

    insert into public.hearing_date_changes (hearing_id, from_start_at, to_start_at, movement_id)
    values (v_hearing.id, null, m.hearing_at, m.id);
    return;
  end if;

  select start_at, end_at, all_day
    into v_old_start, v_old_end, v_old_allday
    from public.events
   where id = v_hearing.event_id;

  if v_old_start = m.hearing_at then
    -- Mesma data: o ato confirma o que já está na pauta.
    update public.hearings
       set movement_id = m.id
     where id = v_hearing.id
       and movement_id is distinct from m.id;
    return;
  end if;

  -- Remarcação: move, não duplica. Mantém a duração que o evento tem — se
  -- alguém a ajustou na Agenda, o andamento não desfaz.
  v_duration := case
    when v_old_allday or v_old_end <= v_old_start then public.hearing_default_duration(v_kind)
    else v_old_end - v_old_start
  end;

  select * into v_links from public.hearing_process_links(m.legal_process_id);

  perform set_config('advtool.hearing_sync', 'on', true);

  -- Título e descrição NÃO são tocados (defeito 3). Card e cliente com
  -- `coalesce`, como a 75: preenchem o que faltava sem desfazer a tela.
  update public.events
     set start_at    = m.hearing_at,
         end_at      = m.hearing_at + v_duration,
         all_day     = false,
         movement_id = m.id,
         crm_item_id = coalesce(crm_item_id, v_links.o_crm_item_id),
         client_id   = coalesce(client_id, v_links.o_client_id)
   where id = v_hearing.event_id;

  perform set_config('advtool.hearing_sync', '', true);

  update public.hearings
     set movement_id = m.id,
         date_confirmed_at = null,
         date_confirmed_by = null
   where id = v_hearing.id;

  insert into public.hearing_date_changes (hearing_id, from_start_at, to_start_at, movement_id)
  values (v_hearing.id, v_old_start, m.hearing_at, m.id);
end $$;

revoke all on function public.apply_movement_hearing(public.legal_process_movements)
  from public, anon, authenticated;

-- O gatilho da 74 continua o mesmo (mesma lista de colunas, pela razão escrita
-- lá); só a função que ele chama muda.
create or replace function public.sync_movement_hearing_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_movement_hearing(new);
  return null;
end $$;

drop function if exists public.apply_movement_hearing_event(public.legal_process_movements);


-- ── 6. Evento → ficha ───────────────────────────────────────────────────────
--
-- Quem mexe na audiência pela Agenda (criar, arrastar, editar) não passa pelo
-- módulo, e a ficha tem de acompanhar todos os caminhos — o argumento da 71.

create or replace function public.sync_event_hearing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hearing_id uuid;
  v_kind       text;
begin
  if coalesce(current_setting('advtool.hearing_sync', true), '') = 'on' then
    return null;
  end if;

  select id into v_hearing_id from public.hearings where event_id = new.id;

  if v_hearing_id is null then
    -- Evento do tipo Audiência criado (ou convertido) na Agenda ganha ficha.
    -- Ocorrência de série não: audiência não se repete, e uma ficha por
    -- ocorrência encheria a pauta de cópias.
    if new.type <> 'hearing' or new.recurrence_series_id is not null then
      return null;
    end if;
    if tg_op = 'UPDATE' and old.type is not distinct from new.type then
      return null;
    end if;

    v_kind := public.resolve_hearing_kind(public.hearing_kind_from_text(new.title));
    if v_kind is null then
      return null;
    end if;

    -- Quem cadastra à mão leu a data em algum lugar: nasce conferida.
    insert into public.hearings (
      event_id, legal_process_id, kind_id, status, source,
      date_confirmed_at, date_confirmed_by, created_by
    )
    values (
      new.id, new.legal_process_id, v_kind, 'designada', 'manual',
      now(), new.created_by, new.created_by
    )
    returning id into v_hearing_id;

    insert into public.hearing_date_changes (hearing_id, from_start_at, to_start_at, changed_by)
    values (v_hearing_id, null, new.start_at, coalesce(auth.uid(), new.created_by));
    return null;
  end if;

  if tg_op = 'UPDATE' then
    if new.legal_process_id is distinct from old.legal_process_id then
      update public.hearings
         set legal_process_id = new.legal_process_id
       where id = v_hearing_id;
    end if;

    if new.start_at is distinct from old.start_at then
      insert into public.hearing_date_changes (hearing_id, from_start_at, to_start_at, changed_by)
      values (v_hearing_id, old.start_at, new.start_at, auth.uid());

      -- Quem move a audiência na Agenda sabe a data: vale como conferida.
      if auth.uid() is not null then
        update public.hearings
           set date_confirmed_at = now(),
               date_confirmed_by = auth.uid()
         where id = v_hearing_id;
      end if;
    end if;
  end if;

  return null;
end $$;

revoke all on function public.sync_event_hearing() from public, anon, authenticated;

drop trigger if exists sync_event_hearing on public.events;
create trigger sync_event_hearing
  after insert or update of type, start_at, legal_process_id
  on public.events
  for each row execute function public.sync_event_hearing();


-- ── 7. Ações da tela ────────────────────────────────────────────────────────

/** Informa ou altera a data. Sem evento, cria o compromisso; com evento, move.
 *
 * `security definer` porque precisa de `hearing_process_links`, que lê o card
 * de qualquer processo — por isso confere a permissão à mão antes de tudo. */
create or replace function public.schedule_hearing(
  p_hearing_id uuid,
  p_start_at   timestamptz,
  p_end_at     timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_hearing  public.hearings;
  v_type     text;
  v_links    record;
  v_event_id uuid;
begin
  if v_uid is null or not public.can('agenda', 'update') then
    raise exception 'Sem permissão para alterar audiências' using errcode = '42501';
  end if;
  if p_start_at is null or p_end_at is null or p_end_at < p_start_at then
    raise exception 'Horário inválido' using errcode = '22023';
  end if;

  select * into v_hearing from public.hearings where id = p_hearing_id for update;
  if not found then
    raise exception 'Audiência não encontrada' using errcode = 'P0002';
  end if;
  if v_hearing.status not in ('a_designar', 'designada') then
    raise exception 'Audiência encerrada não pode ser reagendada' using errcode = '22023';
  end if;

  if v_hearing.event_id is not null then
    -- O gatilho de `events` grava o histórico quando o início muda.
    update public.events
       set start_at = p_start_at,
           end_at   = p_end_at,
           all_day  = false
     where id = v_hearing.event_id;

    update public.hearings
       set date_confirmed_at = now(),
           date_confirmed_by = v_uid
     where id = v_hearing.id;
    return v_hearing.event_id;
  end if;

  if not public.can('agenda', 'create') then
    raise exception 'Sem permissão para criar compromissos' using errcode = '42501';
  end if;

  v_type := public.hearing_event_type();
  if v_type is null then
    raise exception 'Nenhum tipo de evento cadastrado' using errcode = '22023';
  end if;

  select * into v_links from public.hearing_process_links(v_hearing.legal_process_id, v_uid);

  perform set_config('advtool.hearing_sync', 'on', true);

  insert into public.events (
    title, type, start_at, end_at, all_day,
    legal_process_id, crm_item_id, client_id, assigned_to, created_by
  )
  values (
    public.hearing_event_title(v_hearing.kind_id), v_type, p_start_at, p_end_at, false,
    v_hearing.legal_process_id, v_links.o_crm_item_id, v_links.o_client_id,
    v_links.o_assignee_id, v_uid
  )
  returning id into v_event_id;

  insert into public.event_assignees (event_id, profile_id)
  values (v_event_id, v_links.o_assignee_id)
  on conflict do nothing;

  perform set_config('advtool.hearing_sync', '', true);

  update public.hearings
     set event_id = v_event_id,
         status = 'designada',
         date_confirmed_at = now(),
         date_confirmed_by = v_uid
   where id = v_hearing.id;

  insert into public.hearing_date_changes (hearing_id, from_start_at, to_start_at, changed_by)
  values (v_hearing.id, null, p_start_at, v_uid);

  return v_event_id;
end $$;

revoke all on function public.schedule_hearing(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.schedule_hearing(uuid, timestamptz, timestamptz) to authenticated;


/** Cancela (ou reativa) a audiência. Cancelada sai da Agenda e fica no
 * módulo: o evento é escondido, não apagado. Para a ficha sem data, cancelar
 * é descartá-la — o ato que a criou continua ligado a ela e não a recria.
 *
 * `security invoker`: as duas escritas passam pela RLS de quem clicou. */
create or replace function public.set_hearing_cancelled(
  p_hearing_id uuid,
  p_cancelled  boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_hearing public.hearings;
  v_rows    integer;
begin
  select * into v_hearing from public.hearings where id = p_hearing_id for update;
  if not found then
    raise exception 'Audiência não encontrada' using errcode = 'P0002';
  end if;

  if p_cancelled then
    if v_hearing.status not in ('a_designar', 'designada') then
      raise exception 'Só audiência em aberto pode ser cancelada' using errcode = '22023';
    end if;
    update public.hearings
       set status = 'cancelada', closed_at = now()
     where id = v_hearing.id;
  else
    if v_hearing.status <> 'cancelada' then
      raise exception 'A audiência não está cancelada' using errcode = '22023';
    end if;
    update public.hearings
       set status = case when event_id is null then 'a_designar' else 'designada' end,
           closed_at = null
     where id = v_hearing.id;
  end if;

  -- A RLS nega em silêncio (zero linhas), não com erro.
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Sem permissão para alterar audiências' using errcode = '42501';
  end if;

  if v_hearing.event_id is not null then
    update public.events
       set show_in_agenda = not p_cancelled
     where id = v_hearing.event_id;
  end if;
end $$;

revoke all on function public.set_hearing_cancelled(uuid, boolean) from public, anon;
grant execute on function public.set_hearing_cancelled(uuid, boolean) to authenticated;


-- ── 8. Backfill ─────────────────────────────────────────────────────────────

do $$
declare
  v_from_events   int;
  v_changes       int;
  v_without_date  int;
  v_titles        int;
  r public.legal_process_movements;
begin
  -- Os gatilhos de `events` ficam de fora: tudo aqui é reconstrução.
  perform set_config('advtool.hearing_sync', 'on', true);

  -- a) Uma ficha para cada compromisso de audiência que já existe. Os da 74
  --    seguem o andamento e esperam conferência; os da Agenda nasceram de
  --    cadastro, então já contam como conferidos.
  insert into public.hearings (
    event_id, legal_process_id, kind_id, status, source, movement_id,
    date_confirmed_at, date_confirmed_by, created_by, created_at
  )
  select e.id,
         e.legal_process_id,
         public.resolve_hearing_kind(coalesce(e.hearing_slot, public.hearing_kind_from_text(e.title))),
         'designada',
         case when e.movement_id is not null then 'movimentacao' else 'manual' end,
         e.movement_id,
         case when e.movement_id is null then e.created_at end,
         case when e.movement_id is null then e.created_by end,
         case when e.movement_id is null then e.created_by end,
         e.created_at
    from public.events e
   where (e.type = 'hearing' or e.hearing_slot is not null)
     and e.recurrence_series_id is null
     and not exists (select 1 from public.hearings h where h.event_id = e.id);
  get diagnostics v_from_events = row_count;

  -- b) Histórico. Manual: a data do cadastro.
  insert into public.hearing_date_changes (hearing_id, from_start_at, to_start_at, changed_by, changed_at)
  select h.id, null, e.start_at, e.created_by, e.created_at
    from public.hearings h
    join public.events e on e.id = h.event_id
   where h.source = 'manual'
     and not exists (select 1 from public.hearing_date_changes c where c.hearing_id = h.id);

  --    Da 74: a cadeia dos atos datados do mesmo (processo, slot) até o ato que
  --    a ficha segue — é o que transforma "designada para 13/10" seguida de
  --    "redesignada para 12/11" numa ficha com as duas datas.
  --
  --    ⚠️ O microssegundo por posição não é enfeite. Na base real os dois atos
  --    da Una têm o MESMO `created_at` (chegaram na mesma carga do sync), e
  --    sem desempate o histórico não teria ordem.
  insert into public.hearing_date_changes (hearing_id, from_start_at, to_start_at, movement_id, changed_at)
  select h.id, chain.prev_at, chain.hearing_at, chain.id,
         chain.created_at + chain.position * interval '1 microsecond'
    from public.hearings h
    join public.events e on e.id = h.event_id
    join public.legal_process_movements cur on cur.id = h.movement_id
    cross join lateral (
      select m.id, m.hearing_at, m.created_at,
             lag(m.hearing_at) over w as prev_at,
             row_number() over w as position
        from public.legal_process_movements m
       where m.legal_process_id = h.legal_process_id
         and m.hearing_slot = e.hearing_slot
         and m.hearing_at is not null
         and (m.movement_date, m.created_at, m.id) <= (cur.movement_date, cur.created_at, cur.id)
      window w as (order by m.movement_date, m.created_at, m.id)
    ) chain
   where h.source = 'movimentacao'
     and chain.prev_at is distinct from chain.hearing_at
     and not exists (
       select 1 from public.hearing_date_changes c
        where c.hearing_id = h.id and c.movement_id = chain.id
     );

  --    O ato que a ficha segue traz a data que o andamento conhece. Se o
  --    compromisso está em outra (alguém o arrastou depois), a data atual
  --    entra como a mudança mais recente, sem autor conhecido. Comparar com o
  --    ato, e não com "a última linha do histórico", é o que não depende de
  --    desempate entre linhas.
  insert into public.hearing_date_changes (hearing_id, from_start_at, to_start_at, changed_at)
  select h.id, cur.hearing_at, e.start_at, greatest(e.updated_at, cur.created_at + interval '1 second')
    from public.hearings h
    join public.events e on e.id = h.event_id
    left join public.legal_process_movements cur on cur.id = h.movement_id
   where h.source = 'movimentacao'
     and cur.hearing_at is distinct from e.start_at;

  select count(*) into v_changes from public.hearing_date_changes;

  -- c) O "(a confirmar)" sai do título: agora é a ficha que diz. A descrição
  --    gerada pela 74 sai também, mas só se ninguém a editou.
  update public.events e
     set title = regexp_replace(e.title, '\s*\(a confirmar\)\s*$', '')
   where e.movement_id is not null
     and e.title ~ '\(a confirmar\)\s*$';
  get diagnostics v_titles = row_count;

  update public.events e
     set description = null
   where e.movement_id is not null
     and e.description like 'Data lida automaticamente do andamento de %'
     and e.description like '%Confira nos autos antes de se comprometer.';

  -- d) A duração padrão do tipo para os compromissos que nasceram sem nenhuma.
  update public.events e
     set end_at = e.start_at + public.hearing_default_duration(h.kind_id)
    from public.hearings h
   where h.event_id = e.id
     and h.source = 'movimentacao'
     and not e.all_day
     and e.end_at = e.start_at;

  -- e) Os atos sem compromisso, pela função de verdade: os datados já estão
  --    na cadeia acima e saem sem efeito; os sem data viram ficha sem data
  --    quando não há audiência ativa do tipo, ou são ignorados quando são o
  --    mesmo ato de um dia já seguido (o caso do processo 319c1e2e).
  for r in
    select *
      from public.legal_process_movements
     where hearing_slot is not null
     order by movement_date, created_at, id
  loop
    perform public.apply_movement_hearing(r);
  end loop;

  perform set_config('advtool.hearing_sync', '', true);

  select count(*) into v_without_date from public.hearings where status = 'a_designar';

  raise notice '── Audiências ──';
  raise notice 'fichas a partir de compromissos ..... %', v_from_events;
  raise notice 'fichas sem data ..................... %', v_without_date;
  raise notice 'mudanças de data no histórico ....... %', v_changes;
  raise notice 'títulos sem "(a confirmar)" ......... %', v_titles;
end $$;


-- ── 9. O que a ficha substitui ──────────────────────────────────────────────
--
-- A chave (processo, slot) no evento era a causa do defeito 1. `movement_id`
-- fica: é o que diz que o compromisso nasceu do andamento.

drop index if exists public.uq_events_hearing;
alter table public.events drop column if exists hearing_slot;

comment on column public.events.movement_id is
  'Movimentação que criou ou moveu este compromisso. Desde a migration 76 o '
  '"a confirmar" mora na ficha (hearings.date_confirmed_at), não aqui.';
