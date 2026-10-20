-- ============================================================
-- 74 — AUDIÊNCIA DESIGNADA VIRA COMPROMISSO NA AGENDA
--
-- A migration 72 classifica o ato e a 73 ajustou os padrões, então já sabemos
-- quando uma movimentação é audiência. Faltava o passo seguinte: audiência
-- marcada tem de aparecer na Agenda, e hoje para no chip de categoria.
--
-- ── Por que trigger, e não código de aplicação ──────────────────────────────
--
-- `src/features/agenda/services/events.service.ts` instancia o client de
-- BROWSER no escopo do módulo, e `createEvent` exige `userId` vindo de
-- `useAuth()`. Não serve para o webhook, que chega sem sessão.
--
-- E há o precedente da migration 71, com a razão escrita no cabeçalho dela:
-- "Trigger, e não o app, porque o contrato muda por mais de um caminho (tela,
-- Assistente) e o compromisso tem de acompanhar todos." Movimentação chega por
-- três caminhos — `sync.ts`, `webhook.ts` e `addLegalProcessMovement` — e o
-- mesmo argumento vale. Esta migration copia a estrutura da 71: uma função que
-- recebe a linha, um gatilho fino que a chama, e backfill idempotente.
--
-- ── O que os dados reais limitam ────────────────────────────────────────────
--
-- A DATA DA AUDIÊNCIA NÃO ESTÁ EM COLUNA NENHUMA. Ela está dentro do texto:
--
--   "Audiência Una designada para 13/10/2026 14:00 Cariacica - ..."
--   "Audiência de conciliação designada conduzida por ... em/para 06/10/2026 14:00"
--
-- Medido em 20/10/2026 sobre as 171 movimentações da base: das 10 de audiência,
-- 3 trazem data e hora, 5 são fragmento TPU sem data nenhuma
-- ("de Conciliação — designada: 9") e 2 não são designação ("Juntada de Termo
-- de Audiência").
--
-- Daí as duas colunas derivadas:
--
--   hearing_slot  — QUAL audiência é esta, no processo. Preenchida em toda
--                   designação, com ou sem data.
--   hearing_at    — QUANDO, só quando data E hora saem do texto.
--
-- Sem `hearing_at` não há evento a criar — não há data para inventar. Essas
-- linhas viram pendência no app (`hearing_without_date` em
-- `getLegalProcessesPendencies`), para que audiência marcada sem data não suma
-- em silêncio.
--
-- ⚠️ LACUNA CONHECIDA. `hearing_slot` exige a PALAVRA "designada"/"designo" no
-- texto. Duas linhas da base chegaram com o complemento reduzido ao código —
-- "de Conciliação — 9", "de Conciliação — 188 | 13" — e nelas não dá para
-- afirmar o que aconteceu: 9 aparece pareado com "designada" em linhas irmãs,
-- mas concluir dali que 9 SIGNIFICA designada seria montar a tabela de
-- complementos da TPU a partir de duas observações. Essas linhas seguem
-- classificadas como audiência (o chip aparece) e não geram evento nem
-- pendência. É o mesmo truncamento da origem descrito no apêndice
-- BuscaProcessos do ROADMAP, e se resolve lá, não com um mapa de códigos aqui.
--
-- ── Por que `hearing_slot`, e não um evento por movimentação ────────────────
--
-- Nos dados reais o mesmo processo tem:
--
--   "Audiência Una designada   para 13/10/2026 14:00"
--   "Audiência Una redesignada para 12/11/2026 14:20"
--
-- São duas movimentações e UMA audiência, que mudou de data. Chavear o evento
-- pela movimentação daria dois compromissos, e o de 13/10 não vai acontecer.
-- Chavear só pelo processo colapsaria conciliação e instrução, que são duas
-- audiências de verdade. Por isso a chave é (processo, slot): remarcação do
-- mesmo slot MOVE o evento; slot diferente cria outro.
--
-- ⚠️ `events.type = 'hearing'` é slug de `event_types.id`. NÃO confundir com
-- `legal_process_movements.category = 'audiencia'`: são duas tabelas e dois
-- vocabulários.
-- ============================================================

-- ── Colunas derivadas na movimentação ────────────────────────────────────────

alter table public.legal_process_movements
  add column if not exists hearing_at   timestamptz,
  add column if not exists hearing_slot text
    check (hearing_slot is null
           or hearing_slot in ('una', 'conciliacao', 'instrucao', 'outra'));

comment on column public.legal_process_movements.hearing_at is
  'Instante da audiência, lido do texto do ato por '
  'public.movement_hearing_at(). Nulo quando o texto não traz data e hora — '
  'que é o caso dos atos no formato codificado da TPU.';

comment on column public.legal_process_movements.hearing_slot is
  'Qual audiência do processo este ato designa. Chave de identidade do '
  'compromisso na Agenda junto com legal_process_id: remarcação do mesmo slot '
  'move o evento em vez de duplicar. Nulo quando o ato não designa audiência.';


-- ── Derivação ────────────────────────────────────────────────────────────────

create or replace function public.movement_hearing_slot(
  p_title       text,
  p_description text,
  p_category    text
)
returns text
language sql
immutable
as $$
  with t as (
    select coalesce(p_title, '') || ' ' || coalesce(p_description, '') as txt
  )
  select case
    -- Só ato de audiência, e só quando ele DESIGNA. "realizada", "cancelada" e
    -- "Juntada de Termo de Audiência" são audiência, mas não marcam nada.
    when p_category <> 'audiencia' then null
    when (select txt from t) ~* '(realizad|cancelad|encerrad)' then null
    when (select txt from t) !~* '(designad|designo)' then null

    -- Finalidade antes de formato: "Una" é como a audiência é conduzida,
    -- conciliação e instrução são o que ela decide.
    when (select txt from t) ~* 'concilia' then 'conciliacao'
    when (select txt from t) ~* 'instru[çc][ãa]o' then 'instrucao'
    when (select txt from t) ~* 'audi[êe]ncia una' then 'una'
    else 'outra'
  end
$$;

comment on function public.movement_hearing_slot(text, text, text) is
  'Qual audiência do processo o ato designa, ou null quando ele não designa. '
  'Ver o cabeçalho da migration 74 para a razão da chave por slot.';


create or replace function public.movement_hearing_at(
  p_title       text,
  p_description text
)
returns timestamptz
language plpgsql
immutable
as $$
declare
  m text[];
  v_day   int;
  v_month int;
  v_year  int;
  v_hour  int;
  v_min   int;
begin
  -- 'dd/MM/yyyy HH:mm', com 'às' e 'h' opcionais no meio. É a forma observada
  -- nos três atos que trazem data; redação de outro tribunal não vai casar, e
  -- o caminho dela é a pendência, não um palpite.
  m := regexp_match(
    coalesce(p_title, '') || ' ' || coalesce(p_description, ''),
    '(\d{2})/(\d{2})/(\d{4})\s*(?:[àa]s\s*)?(\d{2})[:h](\d{2})'
  );
  if m is null then
    return null;
  end if;

  v_day   := m[1]::int;
  v_month := m[2]::int;
  v_year  := m[3]::int;
  v_hour  := m[4]::int;
  v_min   := m[5]::int;

  -- Valida antes de montar: `make_timestamp` com mês 13 ESTOURA, e um erro aqui
  -- derrubaria a gravação da movimentação inteira — perder o ato é pior que
  -- não ter a data dele.
  if v_month < 1 or v_month > 12
     or v_day < 1 or v_day > 31
     or v_hour > 23 or v_min > 59
     or v_year < 2000 or v_year > 2100 then
    return null;
  end if;

  -- Relógio de parede de Brasília: "14:00" no texto é 14h para quem lê, e a
  -- Agenda grava instante e lê local (features/agenda/utils/datetime.ts). A
  -- migration 71 usa exatamente esta conversão no caso sem navegador.
  --
  -- ⚠️ `movement_date` NÃO serve de base: ela é quando a audiência foi
  -- designada, e a 72 registra que ela desvia da convenção da Agenda.
  return make_timestamp(v_year, v_month, v_day, v_hour, v_min, 0)
           at time zone 'America/Sao_Paulo';
exception
  when others then
    -- Data impossível que passou pela validação (31/02, por exemplo).
    return null;
end $$;

comment on function public.movement_hearing_at(text, text) is
  'Instante da audiência lido do texto do ato, no fuso de Brasília. Null '
  'quando o texto não traz data e hora, ou quando a data é impossível.';


-- O trigger da 72 ganha as duas colunas. `category` é calculada primeiro
-- porque `hearing_slot` depende dela.
--
-- ⚠️ Correção manual de `category` não recalcula o slot: o gatilho observa
-- title/description/raw_data, não category.
create or replace function public.set_movement_classification()
returns trigger
language plpgsql
as $$
begin
  new.category := public.classify_movement(new.title, new.description, new.raw_data);
  new.requires_action := public.movement_requires_action(new.title, new.description);
  new.hearing_slot := public.movement_hearing_slot(new.title, new.description, new.category);
  new.hearing_at := case
    when new.hearing_slot is null then null
    else public.movement_hearing_at(new.title, new.description)
  end;
  return new;
end $$;


-- ── Colunas de ligação no evento ─────────────────────────────────────────────

alter table public.events
  add column if not exists movement_id uuid
    references public.legal_process_movements(id) on delete set null,
  add column if not exists hearing_slot text;

comment on column public.events.movement_id is
  'Movimentação que criou ou moveu este compromisso. Preenchida = a data saiu '
  'de leitura de texto, não de cadastro conferido — é o que a tela mostra como '
  '"a confirmar". `events` não tem coluna `source`; esta faz o papel.';

comment on column public.events.hearing_slot is
  'Qual audiência do processo este compromisso representa. Com '
  'legal_process_id, é a chave que o trigger procura para MOVER em vez de '
  'duplicar na remarcação.';

-- Uma audiência por processo e por tipo: é o que o trigger procura.
create unique index if not exists uq_events_hearing
  on public.events(legal_process_id, hearing_slot)
  where hearing_slot is not null;

create index if not exists idx_events_movement_id
  on public.events(movement_id)
  where movement_id is not null;


-- ── O compromisso ────────────────────────────────────────────────────────────

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
  -- Sem slot não é designação; sem data não há onde pôr na agenda. A linha sem
  -- data vira pendência no app, não evento.
  if m.hearing_slot is null or m.hearing_at is null then
    return;
  end if;

  -- 'hearing' (Audiência) é tipo do sistema, mas o escritório pode apagá-lo
  -- (migration 32): cai no primeiro da lista, como a 71 faz. Sem tipo nenhum,
  -- não há como gravar evento — e a movimentação não pode travar por isso.
  select id into v_type
    from public.event_types
   order by (id = 'hearing') desc, position, id
   limit 1;
  if v_type is null then
    return;
  end if;

  -- O dono do compromisso é quem responde pelo processo. O card do workflow de
  -- processos primeiro, como `pickMasterCrmItem`.
  select ci.assigned_to, ci.client_id, ci.id
    into v_assignee, v_client, v_crm_item
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
  -- usuário "sistema". Sem ninguém a quem atribuir, não grava: um compromisso
  -- com dono inventado é pior que nenhum.
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
    -- `assigned_to` e `created_by` não são tocados: se alguém reatribuiu o
    -- compromisso na tela, a remarcação não desfaz isso.
    update public.events
       set title       = v_title,
           description = v_body,
           start_at    = m.hearing_at,
           end_at      = m.hearing_at,
           all_day     = false,
           movement_id = m.id
     where id = v_event_id;
  end if;

  insert into public.event_assignees (event_id, profile_id)
  values (v_event_id, v_assignee)
  on conflict do nothing;
end $$;

-- Não pode virar RPC: ela escreve em `events` ignorando a RLS (security
-- definer), como a `apply_contract_event` da 71.
revoke all on function public.apply_movement_hearing_event(public.legal_process_movements)
  from public, anon, authenticated;


create or replace function public.sync_movement_hearing_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_movement_hearing_event(new);
  return null;
end $$;

revoke all on function public.sync_movement_hearing_event()
  from public, anon, authenticated;

-- ⚠️ A LISTA DE COLUNAS TEM DE INCLUIR title/description/raw_data, e não só as
-- duas de audiência. `update of <coluna>` dispara pela lista do SET da
-- instrução, NÃO pelo que um gatilho BEFORE alterou: um `update ... set
-- description = ...` recalcula `hearing_at` no BEFORE da 72, mas um AFTER que
-- observasse apenas `hearing_at` não rodaria, e o compromisso não andaria.
drop trigger if exists sync_movement_hearing_event on public.legal_process_movements;
create trigger sync_movement_hearing_event
  after insert or update of
    title, description, raw_data, legal_process_id, hearing_at, hearing_slot
  on public.legal_process_movements
  for each row execute function public.sync_movement_hearing_event();


-- ── Backfill ─────────────────────────────────────────────────────────────────
--
-- As colunas direto pelas funções, e os compromissos chamando
-- `apply_movement_hearing_event` linha a linha — é a razão de ela receber a
-- linha por parâmetro em vez de viver dentro do gatilho.

do $$
declare
  v_slots  int;
  v_dated  int;
  v_before int;
  v_after  int;
  r public.legal_process_movements;
begin
  update public.legal_process_movements
     set hearing_slot = public.movement_hearing_slot(title, description, category),
         hearing_at = case
           when public.movement_hearing_slot(title, description, category) is null then null
           else public.movement_hearing_at(title, description)
         end;

  select count(*) filter (where hearing_slot is not null),
         count(*) filter (where hearing_at is not null)
    into v_slots, v_dated
    from public.legal_process_movements;

  select count(*) into v_before from public.events;

  for r in
    select *
      from public.legal_process_movements
     where hearing_slot is not null
       and hearing_at is not null
     -- Mais antigo primeiro: dentro do mesmo slot, a designação mais recente
     -- tem de ser a última a gravar, para o evento ficar na data vigente.
     order by movement_date, created_at
  loop
    perform public.apply_movement_hearing_event(r);
  end loop;

  select count(*) into v_after from public.events;

  raise notice '── Audiências ──';
  raise notice 'atos que designam audiência ....... %', v_slots;
  raise notice '  com data e hora no texto ........ %', v_dated;
  raise notice '  sem data (viram pendência) ...... %', v_slots - v_dated;
  raise notice 'compromissos criados na Agenda .... %', v_after - v_before;
end $$;
