import type { Profile } from './common.types'

export type ActivityType =
  | 'lead_created'
  | 'lead_moved'
  | 'lead_comment'
  | 'client_created'
  | 'client_updated'
  | 'task_created'
  | 'task_done'
  | 'task_comment'
  | 'event_created'
  | 'attachment_uploaded'

export type EntityType = 'lead' | 'client' | 'task' | 'event'

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  lead_created: 'criou o lead',
  lead_moved: 'moveu o lead',
  lead_comment: 'comentou no lead',
  client_created: 'cadastrou o cliente',
  client_updated: 'atualizou o cliente',
  task_created: 'criou a tarefa',
  task_done: 'concluiu a tarefa',
  task_comment: 'comentou na tarefa',
  event_created: 'agendou evento',
  attachment_uploaded: 'enviou anexo para',
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
  active_leads: number
  weekly_meetings: number
  pending_tasks: number
  active_clients: number
}
