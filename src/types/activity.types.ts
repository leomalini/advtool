import type { Profile } from './common.types'

export type ActivityType =
  | 'case_created'
  | 'case_moved'
  | 'case_comment'
  | 'legal_process_created'
  | 'client_created'
  | 'client_updated'
  | 'task_created'
  | 'task_done'
  | 'task_comment'
  | 'event_created'
  | 'attachment_uploaded'
  | 'financial_entry_created'
  // Legacy: written before leads became crm_items. Nothing produces these
  // anymore, but ~half the existing feed rows use them, so they still need
  // to render readably.
  | 'lead_created'
  | 'lead_moved'

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

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  case_created: 'criou o caso',
  case_moved: 'moveu o caso',
  case_comment: 'comentou no caso',
  legal_process_created: 'cadastrou o processo',
  client_created: 'cadastrou o cliente',
  client_updated: 'atualizou o cliente',
  task_created: 'criou a tarefa',
  task_done: 'concluiu a tarefa',
  task_comment: 'comentou na tarefa',
  event_created: 'agendou evento',
  attachment_uploaded: 'enviou anexo para',
  financial_entry_created: 'lançou',
  lead_created: 'criou o caso',
  lead_moved: 'moveu o caso',
}

export interface Activity {
  id: string
  type: ActivityType
  entity_type: EntityType
  entity_id: string
  entity_title: string
  actor_id: string
  metadata: Record<string, unknown>
  created_at: string
  actor?: Profile
}

export interface DashboardStats {
  /** Judicial processes (legal_processes), not generic CRM items. */
  legal_processes: number
  /** CRM items still in the negotiation pipeline. */
  negotiations: number
  pending_tasks: number
  active_clients: number
  /** Hearings scheduled for the current week — shown in the header line. */
  weekly_hearings: number
  /** Deadlines falling within the next 7 days (overdue ones included). */
  upcoming_deadlines: number
}
