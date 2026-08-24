-- ============================================================
-- 39 — activities.entity_type aceita 'user'
--
-- Fase 5 do `docs/PLANEJAMENTO-MULTIUSUARIO.md`: as ações de administração de
-- acesso (convidar, trocar perfil, desativar, reativar) passam a aparecer no
-- feed. É o registro de auditoria de quem mexeu no acesso de quem — a coisa
-- mais sensível que o sistema faz agora que perfil significa alguma coisa.
--
-- Quarta vez que este CHECK fechado precisa crescer junto com um módulo (15,
-- 22, 24 e agora 39). E, como sempre, esquecer não quebra nada visivelmente: o
-- `recordActivity` é best-effort, então o convite funcionaria e a auditoria
-- sumiria em silêncio — exatamente o bug que a migration 15 conserta.
--
-- `activities.type` continua text livre, então os valores novos
-- ('user_invited', 'user_role_changed', 'user_deactivated', 'user_reactivated')
-- não precisam de alteração no banco.
--
-- `activities` é append-only pela migration 37 (sem policy de update nem de
-- delete), o que é o que torna essas linhas utilizáveis como auditoria.
-- ============================================================

alter table public.activities
  drop constraint if exists activities_entity_type_check;

alter table public.activities
  add constraint activities_entity_type_check
  check (entity_type in (
    'lead', 'client', 'task', 'event', 'crm_item', 'legal_process',
    'financial_entry', 'document', 'user'
  ));
