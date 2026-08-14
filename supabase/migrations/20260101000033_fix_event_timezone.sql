-- ============================================================
-- 33 — Corrige o fuso dos eventos já gravados
--
-- A aplicação montava o timestamp como texto sem fuso ("2026-08-13T09:00:00") e
-- gravava numa coluna `timestamptz`. O Postgres interpreta isso na timezone da
-- sessão — UTC —, então "9h" virava 09:00Z, que é 06:00 em Brasília. A grade da
-- agenda mostrava o horário 3 horas atrasado.
--
-- Todas as linhas existentes passaram por esse mesmo caminho, então a correção
-- é uniforme: o valor guardado É o relógio de parede desejado, apenas rotulado
-- como UTC.
--
--   start_at AT TIME ZONE 'UTC'                  → timestamp ingênuo (o 09:00)
--   ... AT TIME ZONE 'America/Sao_Paulo'         → instante correto (12:00Z)
--
-- Escrito assim, e não como "+ interval '3 hours'", porque a conversão respeita
-- o horário de verão vigente na data de cada linha — irrelevante para datas
-- atuais (o Brasil o extinguiu em 2019), mas correto para eventos antigos.
--
-- ⚠️ NÃO É IDEMPOTENTE. Rodar duas vezes desloca os eventos de novo. O guard
-- abaixo registra a execução e impede a repetição.
-- ============================================================

create table if not exists public.schema_fixes (
  id         text primary key,
  applied_at timestamptz not null default now()
);

do $$
begin
  if exists (select 1 from public.schema_fixes where id = 'events_timezone_2026') then
    raise notice 'Correção de fuso dos eventos já aplicada — nada a fazer.';
    return;
  end if;

  update public.events
  set
    start_at = (start_at at time zone 'UTC') at time zone 'America/Sao_Paulo',
    end_at   = (end_at   at time zone 'UTC') at time zone 'America/Sao_Paulo',
    fatal_deadline = case
      when fatal_deadline is null then null
      else (fatal_deadline at time zone 'UTC') at time zone 'America/Sao_Paulo'
    end;

  insert into public.schema_fixes (id) values ('events_timezone_2026');
end $$;

alter table public.schema_fixes enable row level security;
drop policy if exists "auth_read" on public.schema_fixes;
create policy "auth_read" on public.schema_fixes
  for select using (auth.role() = 'authenticated');
