import { createClient } from '@/lib/supabase/client'
import type { CalendarEvent } from '@/types/event.types'
import type { EventFormInput, UpdateEventInput } from '@/schemas/event.schema'
import { format, parseISO } from 'date-fns'

const supabase = createClient()

// Combina data + hora em timestamptz ISO
function toTimestamp(date: string, time?: string): string {
  const t = time && time.trim() ? time : '00:00'
  return `${date}T${t}:00`
}

// Mapeia EventFormInput → payload do banco
function toDbPayload(input: EventFormInput, userId: string) {
  const startAt = toTimestamp(input.start_date, input.start_time)

  let endAt = startAt
  if (input.inform_end && input.end_date) {
    endAt = toTimestamp(input.end_date, input.end_time)
  }

  const fatalDeadline =
    input.fatal_deadline_date
      ? toTimestamp(input.fatal_deadline_date, input.fatal_deadline_time)
      : null

  return {
    title: input.title,
    type: input.type,
    client_id: input.client_id || null,
    process_number: input.process_number || null,
    assigned_to: input.assignee_ids[0],
    start_at: startAt,
    end_at: endAt,
    all_day: input.all_day,
    fatal_deadline: fatalDeadline,
    show_in_agenda: input.show_in_agenda,
    inform_end: input.inform_end,
    location: input.location || null,
    description: input.description || null,
    is_important: input.is_important,
    is_urgent: input.is_urgent,
    is_future: input.is_future,
    is_recurring: input.is_recurring,
    recurrence_type: input.is_recurring ? (input.recurrence_type ?? null) : null,
    is_retroactive: input.is_retroactive,
    retroactive_completed_at: input.is_retroactive ? (input.retroactive_completed_at ?? null) : null,
    created_by: userId,
  }
}

// Mapeia CalendarEvent → EventFormInput (para pré-preencher form de edição)
export function eventToFormValues(event: CalendarEvent): Partial<EventFormInput> {
  const startDate = event.start_at.slice(0, 10)
  const startTime = event.start_at.slice(11, 16)
  const endDate = event.end_at.slice(0, 10)
  const endTime = event.end_at.slice(11, 16)

  return {
    title: event.title,
    type: event.type,
    client_id: event.client_id ?? '',
    process_number: event.process_number ?? '',
    assignee_ids: event.assignees?.map(a => a.id) ?? [event.assigned_to],
    start_date: startDate,
    start_time: startTime,
    fatal_deadline_date: event.fatal_deadline?.slice(0, 10) ?? '',
    fatal_deadline_time: event.fatal_deadline?.slice(11, 16) ?? '',
    show_in_agenda: event.show_in_agenda,
    all_day: event.all_day,
    inform_end: event.inform_end,
    end_date: endDate,
    end_time: endTime,
    location: event.location ?? '',
    description: event.description ?? '',
    is_important: event.is_important,
    is_urgent: event.is_urgent,
    is_future: event.is_future,
    is_recurring: event.is_recurring,
    recurrence_type: event.recurrence_type ?? undefined,
    is_retroactive: event.is_retroactive,
    retroactive_completed_at: event.retroactive_completed_at ?? '',
  }
}

const EVENT_SELECT = `
  *,
  assignee:profiles!events_assigned_to_fkey(id, full_name, avatar_url, role, created_at),
  assignees:event_assignees(profile:profiles(id, full_name, avatar_url, role, created_at)),
  attachments:event_attachments(*)
`

export async function getEvents(from?: string, to?: string): Promise<CalendarEvent[]> {
  let query = supabase
    .from('events')
    .select(EVENT_SELECT)
    .order('start_at')

  if (from) query = query.gte('start_at', from)
  if (to) query = query.lte('start_at', to)

  const { data, error } = await query
  if (error) throw error

  // Normaliza o join de assignees (Supabase retorna array de objetos com profile)
  return (data ?? []).map((e: unknown) => {
    const ev = e as Record<string, unknown>
    const rawAssignees = ev.assignees as { profile: unknown }[] | null
    return {
      ...ev,
      assignees: rawAssignees?.map(a => a.profile) ?? [],
    } as CalendarEvent
  })
}

export async function createEvent(input: EventFormInput, userId: string): Promise<CalendarEvent> {
  const payload = toDbPayload(input, userId)

  const { data, error } = await supabase
    .from('events')
    .insert(payload)
    .select(EVENT_SELECT)
    .single()

  if (error) throw error

  // Insere todos os responsáveis na junction table
  if (input.assignee_ids.length > 0) {
    await supabase.from('event_assignees').insert(
      input.assignee_ids.map(profileId => ({
        event_id: data.id,
        profile_id: profileId,
      }))
    )
  }

  await supabase.from('activities').insert({
    type: 'event_created',
    entity_type: 'event',
    entity_id: data.id,
    entity_title: data.title,
    actor_id: userId,
  })

  return data as CalendarEvent
}

export async function updateEvent(input: UpdateEventInput, userId: string): Promise<void> {
  const { id, ...rest } = input
  const payload = toDbPayload(rest as EventFormInput, userId)
  const { created_by: _, ...updatePayload } = payload

  const { error } = await supabase.from('events').update(updatePayload).eq('id', id)
  if (error) throw error

  // Atualiza responsáveis: remove todos e reinsere
  if (rest.assignee_ids && rest.assignee_ids.length > 0) {
    await supabase.from('event_assignees').delete().eq('event_id', id)
    await supabase.from('event_assignees').insert(
      rest.assignee_ids.map(profileId => ({
        event_id: id,
        profile_id: profileId,
      }))
    )
  }
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
}

export async function uploadEventAttachment(
  eventId: string,
  file: File,
  userId: string
): Promise<void> {
  const filePath = `events/${eventId}/${Date.now()}-${file.name}`
  const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, file)
  if (uploadError) throw uploadError

  await supabase.from('event_attachments').insert({
    event_id: eventId,
    file_name: file.name,
    file_path: filePath,
    file_size: file.size,
    file_type: file.type,
    uploaded_by: userId,
  })
}
