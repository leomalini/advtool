import { createClient } from '@/lib/supabase/client'
import { recordActivity } from '@/lib/activities'
import {
  daysBetween,
  expandOccurrences,
  isSameRule,
  recurrenceColumns,
  shiftDateKey,
  type RecurrenceRule,
  type SeriesScope,
} from '@/lib/recurrence'
import type { CalendarEvent } from '@/types/event.types'
import type { EventFormInput, UpdateEventInput } from '@/schemas/event.schema'
import { recurrenceFormValuesFrom, toRecurrenceRule } from '@/schemas/recurrence.schema'
import { toInstant, toLocalDateInput, toLocalTimeInput, localDayKey } from '../utils/datetime'

const supabase = createClient()

// Combina data + hora do formulário no instante correspondente.
// Ver utils/datetime.ts: a versão anterior montava a string sem fuso e o
// Postgres a lia como UTC, deslocando todo horário em 3 horas.
const toTimestamp = toInstant

/**
 * Instante de uma ponta do evento.
 *
 * Dia inteiro é gravado à meia-noite local, e o término é a meia-noite do
 * ÚLTIMO dia (inclusivo) — é essa a convenção que `utils/daySpan.ts` lê para
 * saber quais dias o evento cobre. Antes o service usava a hora que estivesse
 * no campo desabilitado, e um evento de dia inteiro podia nascer às 09:00.
 */
function edgeInstant(allDay: boolean, date: string, time?: string): string {
  return allDay ? toTimestamp(date) : toTimestamp(date, time)
}

// Mapeia EventFormInput → payload do banco. Sem `created_by` (só vai no
// insert) e sem as colunas de série (ver `seriesColumns`).
function toDbPayload(input: EventFormInput) {
  const startAt = edgeInstant(input.all_day, input.start_date, input.start_time)

  let endAt = startAt
  if (input.inform_end && input.end_date) {
    endAt = edgeInstant(input.all_day, input.end_date, input.end_time)
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
    is_retroactive: input.is_retroactive,
    retroactive_completed_at: input.is_retroactive ? (input.retroactive_completed_at ?? null) : null,
  }
}

/**
 * O que uma edição "esta e as seguintes" / "todas" copia para as outras
 * ocorrências: tudo, menos o que é próprio de cada uma — datas (o horário vai
 * por `retime_event_series`), prazo fatal e conclusão retroativa.
 */
function sharedSeriesPatch(input: EventFormInput) {
  const payload = toDbPayload(input)
  return {
    title: payload.title,
    type: payload.type,
    client_id: payload.client_id,
    legal_process_id: payload.legal_process_id,
    crm_item_id: payload.crm_item_id,
    assigned_to: payload.assigned_to,
    all_day: payload.all_day,
    show_in_agenda: payload.show_in_agenda,
    inform_end: payload.inform_end,
    location: payload.location,
    description: payload.description,
    is_important: payload.is_important,
    is_urgent: payload.is_urgent,
    is_future: payload.is_future,
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
  set('is_retroactive', 'is_retroactive')

  const allDay = input.all_day === true
  const movesStart = input.start_date !== undefined
  if (movesStart) {
    patch.start_at = edgeInstant(allDay, input.start_date!, input.start_time)
  }

  // The events table enforces `end_at >= start_at`. So whenever the start moves
  // and no explicit end is given, end has to follow it — leaving a stale end
  // behind would violate the constraint at runtime.
  if (input.inform_end && input.end_date) {
    patch.end_at = edgeInstant(allDay, input.end_date, input.end_time)
  } else if (movesStart) {
    patch.end_at = patch.start_at
  }
  if (input.fatal_deadline_date !== undefined) {
    patch.fatal_deadline = input.fatal_deadline_date
      ? toTimestamp(input.fatal_deadline_date, input.fatal_deadline_time)
      : null
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

// ── Série ───────────────────────────────────────────────────────────────────

/** Colunas de série de um evento: as `recurrence_*` e o `is_recurring`, que
 * desde a migration 52 é derivado de haver série. */
function seriesColumns(rule: RecurrenceRule | null, seriesId: string | null) {
  const columns = recurrenceColumns(rule, seriesId)
  return { ...columns, is_recurring: columns.recurrence_series_id !== null }
}

/** O formulário com todas as datas deslocadas `days` dias — é assim que cada
 * ocorrência nasce: mesmo relógio, mesma duração, outro dia. */
function shiftFormDates(input: EventFormInput, days: number): EventFormInput {
  if (days === 0) return input
  return {
    ...input,
    start_date: shiftDateKey(input.start_date, days),
    end_date: input.end_date ? shiftDateKey(input.end_date, days) : input.end_date,
    fatal_deadline_date: input.fatal_deadline_date
      ? shiftDateKey(input.fatal_deadline_date, days)
      : input.fatal_deadline_date,
  }
}

/** Uma linha por data, todas da mesma série. */
function occurrenceRows(
  input: EventFormInput,
  dates: string[],
  rule: RecurrenceRule | null,
  seriesId: string | null,
  userId: string
) {
  return dates.map((date) => ({
    ...toDbPayload(shiftFormDates(input, daysBetween(input.start_date, date))),
    // Evento avulso não manda as colunas `recurrence_*` — só existem com a
    // série (null seria o default de qualquer jeito).
    ...(seriesId ? seriesColumns(rule, seriesId) : { is_recurring: false }),
    created_by: userId,
  }))
}

/** Filtros de URL (`in.(…)`) com centenas de uuids passam do limite do
 * gateway; séries grandes vão em lotes. */
const ID_CHUNK = 100

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += ID_CHUNK) out.push(list.slice(i, i + ID_CHUNK))
  return out
}

function assigneeRows(eventIds: string[], assigneeIds: string[]) {
  return eventIds.flatMap((eventId) =>
    assigneeIds.map((profileId) => ({ event_id: eventId, profile_id: profileId }))
  )
}

/**
 * Troca os responsáveis: primeiro garante os novos, só depois tira os que
 * saíram. A versão anterior apagava todos antes de reinserir — se o insert
 * falhasse, o evento ficava sem responsável nenhum.
 */
async function replaceAssignees(eventIds: string[], assigneeIds: string[]): Promise<void> {
  if (eventIds.length === 0 || assigneeIds.length === 0) return

  const { error: upsertError } = await supabase
    .from('event_assignees')
    .upsert(assigneeRows(eventIds, assigneeIds), {
      onConflict: 'event_id,profile_id',
      ignoreDuplicates: true,
    })
  if (upsertError) throw upsertError

  for (const ids of chunks(eventIds)) {
    const { error: pruneError } = await supabase
      .from('event_assignees')
      .delete()
      .in('event_id', ids)
      .not('profile_id', 'in', `(${assigneeIds.join(',')})`)
    if (pruneError) throw pruneError
  }
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
  // Local, não `slice`: a string vem em UTC, e fatiá-la mostraria a hora
  // deslocada assim que o valor gravado passou a ser o instante real.
  const startDate = toLocalDateInput(event.start_at)
  const startTime = toLocalTimeInput(event.start_at)
  const endDate = toLocalDateInput(event.end_at)
  const endTime = toLocalTimeInput(event.end_at)

  return {
    title: event.title,
    type: event.type,
    client_id: event.client_id ?? '',
    legal_process_id: event.legal_process_id ?? '',
    crm_item_id: event.crm_item_id ?? '',
    assignee_ids: event.assignees?.map(a => a.id) ?? [event.assigned_to],
    start_date: startDate,
    start_time: startTime,
    fatal_deadline_date: event.fatal_deadline ? toLocalDateInput(event.fatal_deadline) : '',
    fatal_deadline_time: event.fatal_deadline ? toLocalTimeInput(event.fatal_deadline) : '',
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
    is_retroactive: event.is_retroactive,
    retroactive_completed_at: event.retroactive_completed_at ?? '',
    ...recurrenceFormValuesFrom(event),
  }
}

// Sem embed de anexos: `event_attachments` foi absorvida por `documents` na
// migration 23. Os arquivos de um evento saem de
// getDocumentsForEntity({ eventId }), que é o que a aba Documentos usa.
const EVENT_SELECT = `
  *,
  assignee:profiles!events_assigned_to_fkey(id, full_name, avatar_url, role, created_at),
  assignees:event_assignees(profile:profiles(id, full_name, avatar_url, role, created_at))
`

/** O que `syncNextDeadline` precisa ler de volta depois de gravar. */
const DEADLINE_SELECT = 'type, start_at, fatal_deadline, crm_item_id, legal_process_id'

/**
 * Eventos da Agenda que tocam o período `[from, to]`.
 *
 * Sobreposição, não "começa dentro": filtrar só `start_at` deixava de fora o
 * evento de vários dias que começou antes do período e ainda está em curso.
 *
 * Só os marcados para aparecer na agenda — o `show_in_agenda` do formulário
 * era gravado e ignorado aqui, enquanto o dashboard já o respeitava.
 */
export async function getEvents(from?: string, to?: string): Promise<CalendarEvent[]> {
  let query = supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('show_in_agenda', true)
    .order('start_at')

  if (to) query = query.lte('start_at', to)
  if (from) query = query.gte('end_at', from)

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
  /** Eventos do cliente — os criados direto dele, sem processo nem card. */
  clientId?: string | null
}): Promise<CalendarEvent[]> {
  const { legalProcessId, crmItemIds = [], clientId } = params

  const terms: string[] = []
  if (legalProcessId) terms.push(`legal_process_id.eq.${legalProcessId}`)
  // Guard: `crm_item_id.in.()` is invalid syntax, and an orphaned processo has
  // no linked items at all.
  if (crmItemIds.length > 0) terms.push(`crm_item_id.in.(${crmItemIds.join(',')})`)
  if (clientId) terms.push(`client_id.eq.${clientId}`)
  if (terms.length === 0) return []

  const query = supabase.from('events').select(EVENT_SELECT).order('start_at', { ascending: false })

  const { data, error } = await query.or(terms.join(','))

  if (error) throw error
  return (data ?? []).map(normalizeEventRow)
}

/**
 * Cria o evento — ou, com "Repetir", a série inteira de uma vez.
 *
 * Um insert só para todas as ocorrências (uma instrução = tudo ou nada). Os
 * responsáveis vão num segundo insert; se ele falhar, as ocorrências são
 * desfeitas, para o "Erro ao criar" da tela corresponder ao banco.
 */
export async function createEvent(input: EventFormInput, userId: string): Promise<CalendarEvent> {
  const rule = toRecurrenceRule(input)
  const dates = rule ? expandOccurrences(input.start_date, rule).dates : [input.start_date]
  const seriesId = rule ? crypto.randomUUID() : null

  const { data, error } = await supabase
    .from('events')
    .insert(occurrenceRows(input, dates, rule, seriesId, userId))
    .select(EVENT_SELECT)

  if (error) throw error
  const created = [...(data ?? [])].sort((a, b) => a.start_at.localeCompare(b.start_at))
  const first = created[0]
  const createdIds = created.map((row) => row.id as string)

  const { error: assigneesError } = input.assignee_ids.length > 0
    ? await supabase.from('event_assignees').insert(assigneeRows(createdIds, input.assignee_ids))
    : { error: null }
  if (assigneesError) {
    for (const ids of chunks(createdIds)) {
      await supabase.from('events').delete().in('id', ids)
    }
    throw assigneesError
  }

  // Uma entrada no feed por série, não uma por ocorrência.
  await recordActivity({
    type: 'event_created',
    entity_type: 'event',
    entity_id: first.id,
    entity_title: first.title,
    actor_id: userId,
  })

  // A mais próxima basta: o card só guarda o prazo mais próximo.
  await syncNextDeadline(first)

  return normalizeEventRow(first)
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

  // Dia local: o prazo do card é uma data, e o dia UTC de um evento das 21h
  // já seria o seguinte.
  const deadline = localDayKey(event.fatal_deadline ?? event.start_at)

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

export interface EventWriteOptions {
  /** A ocorrência como está gravada — o que diz se há série e onde ela está. */
  current?: CalendarEvent
  /** Alcance numa série. Ignorado para evento avulso. */
  scope?: SeriesScope
}

/** O patch é o formulário inteiro? Só com ele dá para operar sobre a série
 * (gerar ocorrências precisa de todas as colunas). */
function asFullForm(input: Partial<EventFormInput>): EventFormInput | null {
  const full =
    input.title !== undefined &&
    input.type !== undefined &&
    input.start_date !== undefined &&
    input.assignee_ids !== undefined &&
    input.all_day !== undefined
  return full ? (input as EventFormInput) : null
}

export async function updateEvent(
  input: UpdateEventInput,
  userId: string,
  options: EventWriteOptions = {}
): Promise<void> {
  const { id, ...rest } = input
  const { current, scope = 'this' } = options
  const form = asFullForm(rest)
  const seriesId = current?.recurrence_series_id ?? null
  const rule = form && rest.recurrence_type !== undefined ? toRecurrenceRule(form) : null

  // Evento avulso que passou a se repetir: vira a 1ª ocorrência de uma série.
  if (!seriesId) {
    if (form && rule) {
      await regenerateSeries({ id, form, rule, anchor: form.start_date, userId })
      return
    }
    await updateSingleEvent(id, rest)
    return
  }

  // "Somente esta": a ocorrência muda sozinha e continua na série.
  if (scope === 'this' || !form || !current) {
    await updateSingleEvent(id, rest)
    return
  }

  const currentDate = toLocalDateInput(current.start_at)
  const from = scope === 'following' ? current.start_at : null

  // Mudou a regra ou a data: as ocorrências no alcance são refeitas a partir
  // da nova âncora. Só campos e horário: cada uma é atualizada no lugar.
  const rebuild = !rule || !isSameRule(rule, current) || form.start_date !== currentDate
  if (!rebuild) {
    await updateSeriesInPlace({ id, form, seriesId, from })
    return
  }

  let anchor = form.start_date
  if (scope === 'all') {
    // "Todas" recomeça da primeira ocorrência, deslocada o mesmo tanto que a
    // data desta foi movida.
    const { data: firstRow, error } = await supabase
      .from('events')
      .select('start_at')
      .eq('recurrence_series_id', seriesId)
      .order('start_at')
      .limit(1)
      .single()
    if (error) throw error
    anchor = shiftDateKey(
      toLocalDateInput(firstRow.start_at as string),
      daysBetween(currentDate, form.start_date)
    )
  }

  await regenerateSeries({ id, form, rule, anchor, userId, oldSeriesId: seriesId, from })
}

/** Update de uma linha só — o comportamento de sempre. */
async function updateSingleEvent(id: string, rest: Partial<EventFormInput>): Promise<void> {
  const { data: updated, error } = await supabase
    .from('events')
    .update(toDbPatch(rest))
    .eq('id', id)
    .select(DEADLINE_SELECT)
    .single()
  if (error) throw error

  if (rest.assignee_ids) await replaceAssignees([id], rest.assignee_ids)

  // Moving a deadline earlier should reach the card's summary too.
  await syncNextDeadline(updated)
}

/**
 * "Esta e as seguintes" / "Todas" sem mudar regra nem data: os campos
 * compartilhados vão para todas as ocorrências no alcance, e o horário é
 * reaplicado em cada uma mantendo a data dela.
 */
async function updateSeriesInPlace(params: {
  id: string
  form: EventFormInput
  seriesId: string
  from: string | null
}): Promise<void> {
  const { id, form, seriesId, from } = params

  let shared = supabase.from('events').update(sharedSeriesPatch(form)).eq('recurrence_series_id', seriesId)
  if (from) shared = shared.gte('start_at', from)
  const { error: sharedError } = await shared
  if (sharedError) throw sharedError

  const payload = toDbPayload(form)
  const durationSeconds = Math.max(0, (Date.parse(payload.end_at) - Date.parse(payload.start_at)) / 1000)
  const { error: retimeError } = await supabase.rpc('retime_event_series', {
    p_series_id: seriesId,
    p_from: from ?? '-infinity',
    p_start_time: form.all_day ? '00:00' : form.start_time || '00:00',
    p_duration: `${durationSeconds} seconds`,
    // A do navegador — a mesma regra de utils/datetime.ts.
    p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
  if (retimeError) throw retimeError

  // Esta ocorrência recebe também o que é só dela (prazo fatal, retroativa).
  const { data: updated, error: currentError } = await supabase
    .from('events')
    .update(toDbPayload(form))
    .eq('id', id)
    .select(DEADLINE_SELECT)
    .single()
  if (currentError) throw currentError

  let idsQuery = supabase.from('events').select('id').eq('recurrence_series_id', seriesId)
  if (from) idsQuery = idsQuery.gte('start_at', from)
  const { data: rows, error: idsError } = await idsQuery
  if (idsError) throw idsError
  await replaceAssignees((rows ?? []).map((row) => row.id as string), form.assignee_ids)

  await syncNextDeadline(updated)
}

/**
 * Refaz as ocorrências no alcance a partir de `anchor`.
 *
 * A linha editada é reaproveitada como primeira ocorrência (ou como evento
 * avulso, se a regra saiu): assim ela mantém os documentos anexados. As demais
 * no alcance são apagadas e recriadas com um id de série novo — "esta e as
 * seguintes" divide a série, e o trecho anterior passa a terminar na véspera.
 */
async function regenerateSeries(params: {
  id: string
  form: EventFormInput
  rule: RecurrenceRule | null
  anchor: string
  userId: string
  oldSeriesId?: string
  from?: string | null
}): Promise<void> {
  const { id, form, rule, anchor, userId, oldSeriesId, from } = params

  if (oldSeriesId) {
    let removal = supabase
      .from('events')
      .delete()
      .eq('recurrence_series_id', oldSeriesId)
      .neq('id', id)
    if (from) removal = removal.gte('start_at', from)
    const { error: removalError } = await removal
    if (removalError) throw removalError

    if (from) {
      await supabase
        .from('events')
        .update({ recurrence_until: shiftDateKey(toLocalDateInput(from), -1), recurrence_count: null })
        .eq('recurrence_series_id', oldSeriesId)
        .lt('start_at', from)
    }
  }

  const dates = rule ? expandOccurrences(anchor, rule).dates : [form.start_date]
  const newSeriesId = rule ? crypto.randomUUID() : null
  const firstForm = shiftFormDates(form, daysBetween(form.start_date, dates[0]))

  const { data: updated, error: updateError } = await supabase
    .from('events')
    .update({ ...toDbPayload(firstForm), ...seriesColumns(rule, newSeriesId) })
    .eq('id', id)
    .select(DEADLINE_SELECT)
    .single()
  if (updateError) throw updateError
  await replaceAssignees([id], form.assignee_ids)

  if (rule && dates.length > 1) {
    const { data: inserted, error: insertError } = await supabase
      .from('events')
      .insert(occurrenceRows(form, dates.slice(1), rule, newSeriesId, userId))
      .select('id')
    if (insertError) throw insertError

    const insertedIds = (inserted ?? []).map((row) => row.id as string)
    const { error: assigneesError } = await supabase
      .from('event_assignees')
      .insert(assigneeRows(insertedIds, form.assignee_ids))
    if (assigneesError) {
      await supabase.from('events').delete().eq('recurrence_series_id', newSeriesId!).neq('id', id)
      throw assigneesError
    }
  }

  await syncNextDeadline(updated)
}

/**
 * Exclui a ocorrência — ou, numa série, ela e as seguintes / a série inteira.
 *
 * ⚠️ Documento anexado só ao evento bloqueia a exclusão: `documents.event_id`
 * é `on delete set null` e o CHECK exige um vínculo (migration 23).
 */
export async function deleteEvent(id: string, options: EventWriteOptions = {}): Promise<void> {
  const { current, scope = 'this' } = options
  const seriesId = current?.recurrence_series_id

  if (!seriesId || scope === 'this') {
    const { error: deleteError } = await supabase.from('events').delete().eq('id', id)
    if (deleteError) throw deleteError
    return
  }

  let removal = supabase.from('events').delete().eq('recurrence_series_id', seriesId)
  if (scope === 'following') removal = removal.gte('start_at', current.start_at)
  const { error: removalError } = await removal
  if (removalError) throw removalError

  if (scope === 'following') {
    // O que sobrou da série termina na véspera.
    await supabase
      .from('events')
      .update({
        recurrence_until: shiftDateKey(toLocalDateInput(current.start_at), -1),
        recurrence_count: null,
      })
      .eq('recurrence_series_id', seriesId)
  }
}
