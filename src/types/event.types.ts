import type { BaseEntity, Profile } from './common.types'

export type EventType = 'meeting' | 'hearing' | 'deadline' | 'appointment'
export type RecurrenceType = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  meeting: 'Reunião',
  hearing: 'Audiência',
  deadline: 'Prazo',
  appointment: 'Compromisso',
}

export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  meeting: '#6366f1',
  hearing: '#ef4444',
  deadline: '#f59e0b',
  appointment: '#10b981',
}

export const RECURRENCE_TYPE_LABELS: Record<RecurrenceType, string> = {
  daily: 'Diária',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  yearly: 'Anual',
}

export interface EventAttachment {
  id: string
  event_id: string
  file_name: string
  file_path: string
  file_size: number
  file_type: string
  uploaded_by: string
  created_at: string
  uploader?: Profile
}

export interface CalendarEvent extends BaseEntity {
  title: string
  description: string | null
  type: EventType
  start_at: string
  end_at: string
  all_day: boolean
  // Relacionamentos
  client_id: string | null
  lead_id: string | null
  assigned_to: string
  created_by: string
  // Novos campos
  process_number: string | null
  location: string | null
  fatal_deadline: string | null
  show_in_agenda: boolean
  inform_end: boolean
  is_important: boolean
  is_urgent: boolean
  is_future: boolean
  is_recurring: boolean
  recurrence_type: RecurrenceType | null
  is_retroactive: boolean
  retroactive_completed_at: string | null
  // Joins
  assignee?: Profile
  assignees?: Profile[]
  attachments?: EventAttachment[]
}
