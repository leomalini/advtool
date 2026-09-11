-- ============================================================
-- 50 — Índice em events.end_at
--
-- A Agenda passou a buscar por SOBREPOSIÇÃO com o período visível
-- (`start_at <= fim AND end_at >= início`) em vez de só `start_at` dentro dele.
-- Sem isso, um evento de vários dias que começou antes do mês visível — férias
-- de 28/08 a 05/09, vistas em setembro — nem chegava à tela.
--
-- `start_at` já tem índice (migration 04); este cobre a outra metade do filtro.
-- ============================================================

create index if not exists idx_events_end_at on public.events(end_at);
