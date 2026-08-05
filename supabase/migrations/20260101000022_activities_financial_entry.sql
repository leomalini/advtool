-- ============================================================
-- 22 — activities.entity_type aceita 'financial_entry'
--
-- O CHECK de entity_type é uma lista fechada (migration 15). Sem isto, o
-- recordActivity do módulo Financeiro seria rejeitado pelo banco — e como
-- esses inserts são best-effort (logam, não lançam), o lançamento seria criado
-- normalmente e a atividade sumiria em silêncio. Foi exatamente assim que o
-- bug do 'case' passou meses despercebido.
--
-- `activities.type` continua text livre, então 'financial_entry_created' não
-- precisa de alteração no banco.
-- ============================================================

alter table public.activities
  drop constraint if exists activities_entity_type_check;

alter table public.activities
  add constraint activities_entity_type_check
  check (entity_type in (
    'lead', 'client', 'task', 'event', 'crm_item', 'legal_process', 'financial_entry'
  ));
