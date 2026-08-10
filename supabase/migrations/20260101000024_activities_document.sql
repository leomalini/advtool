-- ============================================================
-- 24 — activities.entity_type aceita 'document'
--
-- Terceira vez que o CHECK fechado de entity_type precisa crescer junto com um
-- módulo novo (antes: 'crm_item'/'legal_process' na 15, 'financial_entry' na
-- 22). Como o recordActivity é best-effort — loga e segue —, esquecer isto não
-- quebra nada visivelmente: o upload funciona e a atividade some em silêncio.
--
-- Fica o registro: qualquer entidade nova que grave atividade precisa passar
-- por aqui antes.
-- ============================================================

alter table public.activities
  drop constraint if exists activities_entity_type_check;

alter table public.activities
  add constraint activities_entity_type_check
  check (entity_type in (
    'lead', 'client', 'task', 'event', 'crm_item', 'legal_process',
    'financial_entry', 'document'
  ));
