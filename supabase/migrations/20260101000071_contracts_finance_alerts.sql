-- ============================================================
-- 71 — CONTRATOS: FINANCEIRO E AVISOS DE VENCIMENTO
--
-- Fase 4 do plano em docs/contratos.md.
--
--   · `financial_entries.contract_id` — os lançamentos que saem da prévia
--     oferecida ao assinar. `set null`: apagar o contrato não apaga dinheiro
--     lançado. Editar o contrato depois NÃO reescreve lançamentos (decisão do
--     plano): a tela compara e avisa.
--   · `events.contract_id` — o compromisso "Fim do contrato…" na Agenda,
--     mantido por trigger: nasce quando o contrato fica vigente com fim, anda
--     com as datas e sai quando o contrato deixa de ser vigente. Trigger, e
--     não o app, porque o contrato muda por mais de um caminho (tela,
--     Assistente) e o compromisso tem de acompanhar todos.
--   · `notify_contract_expirations()` — o primeiro job agendado do sistema
--     (`pg_cron`, todo dia às 8h de Brasília). Grava em `notifications` dois
--     avisos por contrato e data de fim: ao entrar no prazo de aviso
--     (`notice_days`) e no dia seguinte ao fim, se ele continuar vigente.
--     Renovação automática só muda o texto: nenhuma data anda sozinha.
--
-- O dia de referência é o de Brasília, não o do servidor (UTC): às 22h de um
-- dia 14 o servidor já está no dia 15.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Vínculos
-- ────────────────────────────────────────────────────────────────────────────

alter table public.financial_entries
  add column if not exists contract_id uuid
    references public.contracts(id) on delete set null;

create index if not exists idx_financial_entries_contract_id
  on public.financial_entries(contract_id)
  where contract_id is not null;

comment on column public.financial_entries.contract_id is
  'Contrato que originou o lançamento (prévia ao assinar). Editar o contrato '
  'não reescreve o lançamento.';

alter table public.events
  add column if not exists contract_id uuid
    references public.contracts(id) on delete cascade;

-- Um compromisso de vencimento por contrato: é o que o trigger procura.
create unique index if not exists uq_events_contract_id
  on public.events(contract_id)
  where contract_id is not null;

comment on column public.events.contract_id is
  'Compromisso de vencimento do contrato, mantido pelo trigger '
  'sync_contract_event. Não usar para outros eventos.';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Compromisso na Agenda
--
-- Regras:
--   · Só contrato `vigente` com `end_date` tem compromisso. Qualquer outro
--     status (encerrado, rescindido, de volta a rascunho) tira o compromisso.
--   · Data: `end_date − notice_days`, de dia inteiro. Se esse dia já passou (o
--     contrato foi registrado dentro do prazo de aviso), o compromisso fica
--     para hoje — no passado ninguém o veria.
--   · Contrato que já terminou não ganha compromisso: o aviso diário de
--     "vencido" cuida dele.
--   · Mudar só o nome, o responsável ou os vínculos NÃO mexe na data: a regra
--     do "hoje" acima faria o compromisso andar a cada edição.
--   · Responsável do contrato (ou quem o criou) é o responsável do evento.
--     Os demais responsáveis que alguém acrescentou na Agenda ficam, até o
--     responsável do contrato mudar.
--
-- Quem apaga o compromisso na Agenda o vê voltar se o contrato mudar de data
-- ou de dados — o contrato manda.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.apply_contract_event(
  c          public.contracts,
  keep_date  boolean,
  reassign   boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_event_id  uuid;
  v_type      text;
  v_assignee  uuid := coalesce(c.responsible_id, c.created_by);
  v_start     timestamptz;
  v_title     text;
  v_body      text;
begin
  select id into v_event_id from public.events where contract_id = c.id;

  if c.status <> 'vigente'
     or c.end_date is null
     or (c.end_date < v_today and not (keep_date and v_event_id is not null)) then
    if v_event_id is not null then
      delete from public.events where id = v_event_id;
    end if;
    return;
  end if;

  -- 'appointment' (Compromisso) é tipo do sistema, mas o escritório pode
  -- apagá-lo: cai no primeiro da lista. Sem tipo nenhum, não há como gravar
  -- evento — e o contrato não pode travar por isso.
  select id into v_type
    from public.event_types
   order by (id = 'appointment') desc, position, id
   limit 1;
  if v_type is null then
    return;
  end if;

  -- Meia-noite de Brasília: a convenção de dia inteiro da Agenda
  -- (features/agenda/services/events.service.ts → edgeInstant).
  v_start := (greatest(c.end_date - c.notice_days, v_today)::timestamp)
               at time zone 'America/Sao_Paulo';
  v_title := 'Fim do contrato em ' || to_char(c.end_date, 'DD/MM/YYYY') || ': ' || c.title;
  v_body  := 'O contrato "' || c.title || '" termina em '
             || to_char(c.end_date, 'DD/MM/YYYY') || '. '
             || case
                  when c.auto_renew
                    then 'Tem renovação automática: confira se ela segue valendo.'
                  else 'Decida se encerra ou renova.'
                end;

  if v_event_id is null then
    insert into public.events (
      title, description, type, start_at, end_at, all_day,
      client_id, legal_process_id, assigned_to, created_by, contract_id
    )
    values (
      v_title, v_body, v_type, v_start, v_start, true,
      c.client_id, c.legal_process_id, v_assignee, c.created_by, c.id
    )
    returning id into v_event_id;
    reassign := true;
  else
    update public.events
       set title            = v_title,
           description      = v_body,
           client_id        = c.client_id,
           legal_process_id = c.legal_process_id,
           start_at         = case when keep_date then start_at else v_start end,
           end_at           = case when keep_date then end_at else v_start end,
           all_day          = case when keep_date then all_day else true end,
           assigned_to      = case when reassign then v_assignee else assigned_to end
     where id = v_event_id;
  end if;

  if reassign then
    delete from public.event_assignees
     where event_id = v_event_id and profile_id <> v_assignee;
  end if;
  insert into public.event_assignees (event_id, profile_id)
  values (v_event_id, v_assignee)
  on conflict do nothing;
end;
$$;

create or replace function public.sync_contract_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_contract_event(
    new,
    -- Data mantida quando nada que a define mudou.
    tg_op = 'UPDATE'
      and old.status = new.status
      and old.end_date is not distinct from new.end_date
      and old.notice_days = new.notice_days,
    tg_op = 'INSERT'
      or old.responsible_id is distinct from new.responsible_id
  );
  return new;
end;
$$;

drop trigger if exists sync_contract_event on public.contracts;
create trigger sync_contract_event
  after insert or update of
    status, end_date, notice_days, auto_renew, responsible_id, title,
    client_id, legal_process_id
  on public.contracts
  for each row execute function public.sync_contract_event();

-- Contratos que já estavam vigentes antes desta migration.
do $$
begin
  perform public.apply_contract_event(c, false, true)
     from public.contracts c
    where c.status = 'vigente';
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Avisos diários
--
-- `notifications` é uma fila do escritório (migration 47): o aviso aparece a
-- quem pode ver `contratos`, não só ao responsável.
--
-- Um aviso por contrato e data de fim, sem coluna nova: o aviso de "vencendo"
-- conta como dado se houver um criado desde o início do prazo de aviso; o de
-- "vencido", se houver um criado depois do fim. Prorrogar o fim abre um prazo
-- novo — e um aviso novo.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.notify_contract_expirations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_total  integer := 0;
  v_rows   integer;
begin
  insert into public.notifications
    (kind, resource, title, body, link, entity_type, entity_id, source)
  select
    'contrato_vencendo',
    'contratos',
    case
      when c.end_date = v_today then 'Contrato vence hoje'
      when c.end_date = v_today + 1 then 'Contrato vence amanhã'
      else 'Contrato vence em ' || (c.end_date - v_today) || ' dias'
    end,
    c.title || ' — termina em ' || to_char(c.end_date, 'DD/MM/YYYY') || '. '
      || case
           when c.auto_renew then 'Tem renovação automática: confira se ela segue valendo.'
           else 'Encerrar ou renovar?'
         end,
    '/contratos/' || c.id,
    'contract',
    c.id,
    'rotina'
  from public.contracts c
  where c.status = 'vigente'
    and c.end_date is not null
    and c.end_date >= v_today
    and c.end_date - c.notice_days <= v_today
    and not exists (
      select 1
        from public.notifications n
       where n.kind = 'contrato_vencendo'
         and n.entity_id = c.id
         and n.created_at >= ((c.end_date - c.notice_days)::timestamp
                                at time zone 'America/Sao_Paulo')
    );
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into public.notifications
    (kind, resource, title, body, link, entity_type, entity_id, source)
  select
    'contrato_vencido',
    'contratos',
    'Contrato terminou e segue vigente',
    c.title || ' terminou em ' || to_char(c.end_date, 'DD/MM/YYYY') || '. '
      || case
           when c.auto_renew then 'Tem renovação automática: atualize o fim do contrato.'
           else 'Encerre o contrato ou atualize o fim.'
         end,
    '/contratos/' || c.id,
    'contract',
    c.id,
    'rotina'
  from public.contracts c
  where c.status = 'vigente'
    and c.end_date is not null
    and c.end_date < v_today
    and not exists (
      select 1
        from public.notifications n
       where n.kind = 'contrato_vencido'
         and n.entity_id = c.id
         and n.created_at >= ((c.end_date + 1)::timestamp
                                at time zone 'America/Sao_Paulo')
    );
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  return v_total;
end;
$$;

-- Funções `security definer` no schema public viram RPC no PostgREST. Só o
-- banco (trigger e job) as chama: ninguém de fora gera aviso nem compromisso.
revoke all on function public.apply_contract_event(public.contracts, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.sync_contract_event() from public, anon, authenticated;
revoke all on function public.notify_contract_expirations() from public, anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. O job
--
-- Como a documentação do Supabase (guides/cron/install) habilita a extensão.
-- O pg_cron do Supabase roda em UTC: 11h UTC = 8h em Brasília. `schedule` com
-- um nome que já existe substitui o job — reaplicar não duplica.
-- ────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'contratos-avisos-de-vencimento',
  '0 11 * * *',
  'select public.notify_contract_expirations()'
);
