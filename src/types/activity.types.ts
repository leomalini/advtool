/**
 * What the services write to `activities` (src/lib/activities.ts). Nothing in
 * the app reads the table since the dashboard feed was removed — see
 * docs/dashboard.md, decision 7.
 */
export type ActivityType =
  | 'case_created'
  | 'case_moved'
  | 'case_comment'
  | 'legal_process_created'
  | 'client_created'
  | 'client_updated'
  | 'client_comment'
  | 'task_created'
  | 'task_done'
  | 'task_comment'
  | 'event_created'
  | 'attachment_uploaded'
  | 'financial_entry_created'
  // Administração de acesso (Fase 5 do planejamento multiusuário). Ficam na
  // mesma tabela dos demais de propósito: quem mexeu no acesso de quem é a
  // informação mais sensível que o sistema passa a registrar.
  | 'user_invited'
  | 'user_invite_resent'
  | 'user_role_changed'
  | 'user_deactivated'
  | 'user_reactivated'

/** Mirrors the CHECK constraint on activities.entity_type (migration 15).
 * 'lead' is legacy: the leads table is dead code, but old rows may exist. */
export type EntityType =
  | 'lead'
  | 'client'
  | 'task'
  | 'event'
  | 'crm_item'
  | 'legal_process'
  | 'financial_entry'
  | 'document'
  | 'user'
