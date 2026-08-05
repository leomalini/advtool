import { createClient } from '@/lib/supabase/client'
import { recordActivity } from '@/lib/activities'
import type { CalendarEvent } from '@/types/event.types'
import type { EventFormInput, UpdateEventInput } from '@/schemas/event.schema'

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
    legal_process_id: input.legal_process_id || null,
    crm_item_id: input.crm_item_id || null,
    // process_number deliberately absent: the free-text field was dropped in
    // favour of the real legal_process_id link. Leaving it out of the payload
    // preserves whatever legacy rows already carry instead of nulling it.
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

/**
 * Partial version of toDbPayload, for updates.
 *
 * Reusing toDbPayload here was a live bug: it always emits every column, so a
 * patch missing `crm_item_id`/`legal_process_id` silently wiped both links.
 * Filtering `undefined` out of its result doesn't fix it either — derived
 * columns don't survive a missing source (`start_at` becomes the string
 * "undefinedT00:00:00", and `assigned_to` throws on `assignee_ids[0]`).
 *
 * So each column is decided from its own source key: absent key = untouched,
 * empty string = explicit clear.
 */
function toDbPatch(input: Partial<EventFormInput>) {
  const patch: Record<string, unknown> = {}
  const set = <K extends keyof EventFormInput>(key: K, column: string, map?: (v: NonNullable<EventFormInput[K]>) => unknown) => {
    const value = input[key]
    if (value === undefined) return
    patch[column] = map ? map(value as NonNullable<EventFormInput[K]>) : value
  }

  set('title', 'title')
  set('type', 'type')
  set('client_id', 'client_id', (v) => v || null)
  set('legal_process_id', 'legal_process_id', (v) => v || null)
  set('crm_item_id', 'crm_item_id', (v) => v || null)
  set('all_day', 'all_day')
  set('show_in_agenda', 'show_in_agenda')
  set('inform_end', 'inform_end')
  set('location', 'location', (v) => v || null)
  set('description', 'description', (v) => v || null)
  set('is_important', 'is_important')
  set('is_urgent', 'is_urgent')
  set('is_future', 'is_future')
  set('is_recurring', 'is_recurring')
  set('is_retroactive', 'is_retroactive')

  const movesStart = input.start_date !== undefined
  if (movesStart) {
    patch.start_at = toTimestamp(input.start_date!, input.start_time)
  }

  // The events table enforces `end_at >= start_at`. So whenever the start moves
  // and no explicit end is given, end has to follow it — leaving a stale end
  // behind would violate the constraint at runtime.
  if (input.inform_end && input.end_date) {
    patch.end_at = toTimestamp(input.end_date, input.end_time)
  } else if (movesStart) {
    patch.end_at = patch.start_at
  }
  if (input.fatal_deadline_date !== undefined) {
    patch.fatal_deadline = input.fatal_deadline_date
      ? toTimestamp(input.fatal_deadline_date, input.fatal_deadline_time)
      : null
  }
  if (input.is_recurring !== undefined || input.recurrence_type !== undefined) {
    patch.recurrence_type = input.is_recurring ? (input.recurrence_type ?? null) : null
  }
  if (input.is_retroactive !== undefined || input.retroactive_completed_at !== undefined) {
    patch.retroactive_completed_at = input.is_retroactive
      ? (input.retroactive_completed_at || null)
      : null
  }
  if (input.assignee_ids !== undefined && input.assignee_ids.length > 0) {
    patch.assigned_to = input.assignee_ids[0]
  }

  return patch
}

/** PostgREST nests the assignees join as `[{ profile }]`; flatten it so every
 * caller sees the same shape. getEvents did this inline while createEvent
 * returned the raw form. */
function normalizeEventRow(row: unknown): CalendarEvent {
  const ev = row as Record<string, unknown>
  const rawAssignees = ev.assignees as { profile: unknown }[] | null
  return {
    ...ev,
    assignees: rawAssignees?.map((a) => a.profile) ?? [],
  } as CalendarEvent
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
    legal_process_id: event.legal_process_id ?? '',
    crm_item_id: event.crm_item_id ?? '',
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

  return (data ?? []).map(normalizeEventRow)
}

/**
 * Every event belonging to an entity.
 *
 * An event reaches a processo two ways: linked straight to it
 * (`legal_process_id`, how the agenda form does it) or through one of its CRM
 * cards (`crm_item_id`, how the CasoModal does it). Querying only the first
 * would silently hide the second — so both are matched.
 */
export async function getEventsForEntity(params: {
  legalProcessId?: string | null
  crmItemIds?: string[]
}): Promise<CalendarEvent[]> {
  const { legalProcessId, crmItemIds = [] } = params

  const terms: string[] = []
  if (legalProcessId) terms.push(`legal_process_id.eq.${legalProcessId}`)
  // Guard: `crm_item_id.in.()` is invalid syntax, and an orphaned processo has
  // no linked items at all.
  if (crmItemIds.length > 0) terms.push(`crm_item_id.in.(${crmItemIds.join(',')})`)
  if (terms.length === 0) return []

  const query = supabase.from('events').select(EVENT_SELECT).order('start_at', { ascending: false })

  // A single term doesn't need `.or()` — keep the simpler filter.
  const { data, error } =
    terms.length === 1
      ? await (legalProcessId && crmItemIds.length === 0
          ? query.eq('legal_process_id', legalProcessId)
          : query.in('crm_item_id', crmItemIds))
      : await query.or(terms.join(','))

  if (error) throw error
  return (data ?? []).map(normalizeEventRow)
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

  await recordActivity({
    type: 'event_created',
    entity_type: 'event',
    entity_id: data.id,
    entity_title: data.title,
    actor_id: userId,
  })

  await syncNextDeadline(data)

  return normalizeEventRow(data)
}

/**
 * Mirrors a deadline event onto the linked card's `next_deadline`.
 *
 * The Resumo chip and the dashboard's Prazos card read `crm_items.next_deadline`,
 * which nothing in the agenda used to touch — so creating a "Prazo" event left
 * both showing the old date, and the user would reasonably report it as a bug.
 *
 * Only moves the date closer, never further away: a hearing scheduled for next
 * year shouldn't push out a deadline due next week. Best-effort — the event is
 * already saved, and failing to mirror it must not surface as a failed save.
 */
async function syncNextDeadline(event: {
  type: string
  start_at: string
  fatal_deadline: string | null
  crm_item_id: string | null
  legal_process_id: string | null
}): Promise<void> {
  const isDeadline = event.type === 'deadline' || !!event.fatal_deadline
  if (!isDeadline) return

  const deadline = (event.fatal_deadline ?? event.start_at).slice(0, 10)

  // Prefer the direct card; otherwise fall back to the processo's master card,
  // which is where the Processos module reads its summary from.
  let crmItemId = event.crm_item_id
  if (!crmItemId && event.legal_process_id) {
    const { data } = await supabase
      .from('crm_items')
      .select('id')
      .eq('legal_process_id', event.legal_process_id)
      .eq('workflow_id', 'wf-processos')
      .limit(1)
      .maybeSingle()
    crmItemId = data?.id ?? null
  }
  if (!crmItemId) return

  const { data: item } = await supabase
    .from('crm_items')
    .select('next_deadline')
    .eq('id', crmItemId)
    .maybeSingle()
  if (!item) return

  if (item.next_deadline && item.next_deadline <= deadline) return

  const { error } = await supabase
    .from('crm_items')
    .update({ next_deadline: deadline })
    .eq('id', crmItemId)
  if (error) console.error('[next_deadline] sync failed:', error.message)
}

export async function updateEvent(input: UpdateEventInput): Promise<void> {
  const { id, ...rest } = input
  const updatePayload = toDbPatch(rest)

  const { data: updated, error } = await supabase
    .from('events')
    .update(updatePayload)
    .eq('id', id)
    .select('type, start_at, fatal_deadline, crm_item_id, legal_process_id')
    .single()
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

  // Moving a deadline earlier should reach the card's summary too.
  await syncNextDeadline(updated)
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
