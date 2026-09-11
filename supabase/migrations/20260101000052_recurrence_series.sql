-- ============================================================
-- 52 — Recorrência de verdade: séries de eventos e de tarefas
--
-- Desde a migration 07 o evento tinha `is_recurring` + `recurrence_type`, mas
-- eram só rótulo: gravados, exibidos como badge, e nenhuma ocorrência criada.
--
-- A recorrência passa a ser MATERIALIZADA: cada ocorrência é uma linha real,
-- criada de uma vez até a data final (ou o número de ocorrências) que o
-- usuário informa. Assim cada ocorrência de tarefa tem status, checklist e
-- comentários próprios, e dashboard, pendências, RLS e abas de Processo/
-- Cliente continuam lendo linhas comuns, sem expandir regra nenhuma.
--
-- A regra fica DENORMALIZADA em cada linha, sem tabela de séries: uma tabela
-- compartilhada por eventos e tarefas precisaria de uma permissão que ora é
-- `agenda:*`, ora `tarefas:*`. Aqui cada tabela segue com o RBAC que já tem.
--
--   recurrence_series_id  agrupa as ocorrências. "Este e os seguintes" divide a
--                         série: o trecho a partir dali ganha um id novo.
--   recurrence_type       periodicidade (ganha 'weekdays': seg–sex sem feriado
--                         nacional)
--   recurrence_until      última data permitida, OU
--   recurrence_count      quantas ocorrências a série teve ao ser criada
--
-- `events.is_recurring` fica como está e passa a ser derivado pela aplicação
-- (`recurrence_series_id is not null`). Linhas antigas com a flag e sem série
-- não são tocadas: não há como saber até quando elas iriam.
-- ============================================================


-- ── Events ──────────────────────────────────────────────────────────────────

alter table public.events
  add column if not exists recurrence_series_id uuid,
  add column if not exists recurrence_until     date,
  add column if not exists recurrence_count     integer;

-- O CHECK de coluna criado na migration 07 recebeu o nome padrão do Postgres.
alter table public.events
  drop constraint if exists events_recurrence_type_check;
alter table public.events
  add constraint events_recurrence_type_check
  check (recurrence_type in ('daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'));

create index if not exists idx_events_recurrence_series_id
  on public.events(recurrence_series_id);


-- ── Tasks ───────────────────────────────────────────────────────────────────

alter table public.tasks
  add column if not exists recurrence_type      text,
  add column if not exists recurrence_series_id uuid,
  add column if not exists recurrence_until     date,
  add column if not exists recurrence_count     integer;

alter table public.tasks
  drop constraint if exists tasks_recurrence_type_check;
alter table public.tasks
  add constraint tasks_recurrence_type_check
  check (recurrence_type in ('daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'));

create index if not exists idx_tasks_recurrence_series_id
  on public.tasks(recurrence_series_id);


-- ── Mudar o horário de uma série de eventos ─────────────────────────────────
--
-- "Este e os seguintes" / "Todos" com outro horário: cada ocorrência mantém a
-- SUA data e ganha o novo relógio de parede. Feito aqui porque é uma conta por
-- linha (a data local de cada uma + a hora nova), e numa só instrução — a
-- alternativa eram centenas de updates pelo PostgREST, sem atomicidade.
--
-- SECURITY INVOKER: roda com as permissões de quem chama, então a RLS de
-- `events` (agenda:update) continua valendo linha a linha.
--
-- p_timezone é a do navegador — a mesma regra de utils/datetime.ts ("grava
-- instante, lê local"), sem supor o fuso do servidor.

create or replace function public.retime_event_series(
  p_series_id  uuid,
  p_from       timestamptz,
  p_start_time time,
  p_duration   interval,
  p_timezone   text
)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.events
  set
    start_at = ((start_at at time zone p_timezone)::date + p_start_time) at time zone p_timezone,
    end_at   = (((start_at at time zone p_timezone)::date + p_start_time) at time zone p_timezone)
               + p_duration
  where recurrence_series_id = p_series_id
    and start_at >= p_from;
$$;

grant execute on function public.retime_event_series(uuid, timestamptz, time, interval, text)
  to authenticated;
