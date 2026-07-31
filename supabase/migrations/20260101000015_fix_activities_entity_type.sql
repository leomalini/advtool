-- ============================================================
-- 15 — FIX activities.entity_type CHECK (drift pós-rename)
-- O CHECK original (migration 06) só aceita 'lead'|'client'|'task'|'event' e
-- nunca foi atualizado depois de leads → cases → crm_items. O código insere
-- entity_type = 'case', que viola o CHECK; como esses inserts não checavam o
-- erro de retorno, a violação era engolida silenciosamente e criar um Caso ou
-- Processo nunca gerava linha no feed de atividades.
--
-- 'lead' é mantido por segurança histórica: a tabela leads é código morto hoje,
-- mas não há garantia de que não existam linhas antigas com esse valor na base.
-- ============================================================

alter table public.activities
  drop constraint if exists activities_entity_type_check;

alter table public.activities
  add constraint activities_entity_type_check
  check (entity_type in ('lead', 'client', 'task', 'event', 'crm_item', 'legal_process'));
