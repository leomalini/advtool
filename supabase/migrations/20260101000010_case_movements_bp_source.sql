-- ============================================================
-- 10 — Migrate case_movements.source to BuscaProcessos
--      Removes 'cnj_api', ensures only 'manual' | 'busca_processos'
-- ============================================================

-- Rename any legacy 'cnj_api' entries (safety net for existing data)
update public.case_movements
  set source = 'busca_processos'
  where source = 'cnj_api';

alter table public.case_movements
  drop constraint if exists case_movements_source_check;

alter table public.case_movements
  add constraint case_movements_source_check
  check (source in ('manual', 'busca_processos'));
