-- ============================================================
-- 51 — Hora opcional na tarefa
--
-- Tarefas passam a aparecer na Agenda, ao lado dos eventos — o mesmo modelo do
-- Google Agenda, onde tarefa é um item de um dia com hora opcional. Sem hora,
-- ela fica na faixa "Dia todo"; com hora, entra na grade de horas.
--
-- `time` sem fuso, como `due_date` é `date` sem fuso: os dois juntos são o
-- relógio de parede do escritório, e é assim que a tela os lê. Nada aqui é
-- instante — ao contrário de `events.start_at`, que é `timestamptz` (ver a
-- confusão corrigida na migration 33).
--
-- Nullable e sem default: toda tarefa existente continua "sem hora".
-- ============================================================

alter table public.tasks
  add column if not exists due_time time;
