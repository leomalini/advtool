import type { BaseEntity, Profile } from './common.types'

/**
 * Slug do tipo, referenciando `event_types.id`.
 *
 * Deixou de ser uma união fechada na migration 32: o escritório cadastra os
 * seus próprios tipos, então rótulo e cor vêm do banco, não de um mapa no
 * código. Use `useEventTypeMap()` para resolver.
 */
export type EventType = string

export type RecurrenceType = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'

export interface EventTypeRecord {
  id: string
  label: string
  color: string
  position: number
  /** Um dos quatro originais. Não impede exclusão — só explica a origem. */
  is_system: boolean
  created_at: string
}

/** Usada quando o tipo do evento não está (mais) na lista — evita a tela
 * quebrar por causa de um dado que sumiu. */
export const UNKNOWN_EVENT_TYPE: Pick<EventTypeRecord, 'label' | 'color'> = {
  label: 'Sem tipo',
  color: '#94a3b8',
}

export function resolveEventType(
  types: Map<string, EventTypeRecord> | undefined,
  id: string | null | undefined
): Pick<EventTypeRecord, 'label' | 'color'> {
  if (!id) return UNKNOWN_EVENT_TYPE
  return types?.get(id) ?? UNKNOWN_EVENT_TYPE
}

export const RECURRENCE_TYPE_LABELS: Record<RecurrenceType, string> = {
  daily: 'Diária',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  yearly: 'Anual',
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
  legal_process_id: string | null
  crm_item_id: string | null
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
}
