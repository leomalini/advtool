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
import type { Task, TaskComment, TaskChecklistItem } from '@/types/task.types'
import type { CreateTaskInput, UpdateTaskInput } from '@/schemas/task.schema'
import { toRecurrenceRule, type RecurrenceFormValues } from '@/schemas/recurrence.schema'

const supabase = createClient()

const TASK_SELECT = `
  *,
  assignee:profiles!tasks_assigned_to_fkey(id, full_name, avatar_url, role, created_at),
  checklist_items:task_checklist_items(*)
`

/** Form controls yield '' for an untouched field, and Postgres rejects that for
 * uuid/date columns — creating a task with no due date failed outright. Turn
 * every empty string into null before it reaches the database. */
function nullifyEmpty<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    out[key] = value === '' ? null : value
  }
  return out as T
}

/** Hora sem data não tem onde aparecer na Agenda nem o que significar: quando a
 * data some, a hora vai junto. Só age se o patch mexe na data — um update só
 * de status não pode apagar a hora. */
function dropOrphanTime<T extends { due_date?: string | null; due_time?: string | null }>(input: T): T {
  if (!('due_date' in input) || input.due_date) return input
  return { ...input, due_time: null }
}

/**
 * Tarefas com data dentro de `[fromDay, toDay]` (yyyy-MM-dd), para a Agenda.
 *
 * Comparação de `date` com string de data: sem instante, sem fuso — o dia
 * gravado é o dia mostrado.
 */
export async function getTasksInRange(fromDay: string, toDay: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .gte('due_date', fromDay)
    .lte('due_date', toDay)
    .order('due_date')
    .order('due_time', { nullsFirst: true })

  if (error) throw error
  return (data ?? []) as Task[]
}

/** Atividades criadas a partir de uma publicação. */
export async function getTasksForPublication(publicationId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('publication_id', publicationId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Task[]
}

export async function getTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .order('position')

  if (error) throw error
  return data as Task[]
}

/**
 * Every task belonging to an entity — same two-way link as events: straight to
 * the processo (`legal_process_id`) or through one of its CRM cards
 * (`crm_item_id`). See getEventsForEntity for the reasoning.
 */
export async function getTasksForEntity(params: {
  legalProcessId?: string | null
  crmItemIds?: string[]
  /** Tarefas do cliente — as criadas direto dele, sem processo nem card. */
  clientId?: string | null
}): Promise<Task[]> {
  const { legalProcessId, crmItemIds = [], clientId } = params

  const terms: string[] = []
  if (legalProcessId) terms.push(`legal_process_id.eq.${legalProcessId}`)
  if (crmItemIds.length > 0) terms.push(`crm_item_id.in.(${crmItemIds.join(',')})`)
  if (clientId) terms.push(`client_id.eq.${clientId}`)
  if (terms.length === 0) return []

  const query = supabase.from('tasks').select(TASK_SELECT).order('position')

  const { data, error } = await query.or(terms.join(','))

  if (error) throw error
  return (data ?? []) as Task[]
}

/**
 * Os campos de "Repetir" são do formulário — o banco não tem essas colunas.
 * Separa a regra do resto, que vai para o insert/update como sempre.
 */
function splitRecurrence<T extends RecurrenceFormValues>(input: T) {
  const { recurrence_type, recurrence_ends, recurrence_until, recurrence_count, ...row } = input
  return {
    rule: toRecurrenceRule({ recurrence_type, recurrence_ends, recurrence_until, recurrence_count }),
    /** O formulário falou de recorrência (mesmo que "não se repete"). */
    touchesRecurrence: recurrence_type !== undefined,
    row,
  }
}

/** Próxima posição no fim da coluna do status. */
async function nextPosition(status: string): Promise<number> {
  const { data: statusTasks } = await supabase
    .from('tasks')
    .select('position')
    .eq('status', status)
    .order('position', { ascending: false })
    .limit(1)

  return statusTasks?.[0]?.position != null ? statusTasks[0].position + 1 : 0
}

/**
 * Cria a tarefa — ou, com "Repetir", uma tarefa por ocorrência, todas num
 * insert só (uma instrução = tudo ou nada). Cada ocorrência é uma tarefa
 * inteira: status, checklist e comentários próprios.
 */
export async function createTask(
  input: CreateTaskInput,
  userId: string
): Promise<Task> {
  const { rule, row } = splitRecurrence(input)
  const base = dropOrphanTime(nullifyEmpty(row))
  const position = await nextPosition(base.status ?? 'todo')

  // Sem data não há de onde repetir — o schema já barra, isto é só a garantia.
  const dates = rule && base.due_date ? expandOccurrences(base.due_date, rule).dates : null
  const seriesId = dates ? crypto.randomUUID() : null

  const rows = dates
    ? dates.map((date, index) => ({
        ...base,
        due_date: date,
        ...recurrenceColumns(rule, seriesId),
        created_by: userId,
        position: position + index,
      }))
    : [{ ...base, created_by: userId, position }]

  const { data, error } = await supabase.from('tasks').insert(rows).select(TASK_SELECT)
  if (error) throw error

  const created = [...((data ?? []) as Task[])].sort((a, b) =>
    (a.due_date ?? '').localeCompare(b.due_date ?? '')
  )
  const first = created[0]

  // Uma entrada no feed por série, não uma por ocorrência.
  await recordActivity({
    type: 'task_created',
    entity_type: 'task',
    entity_id: first.id,
    entity_title: first.title,
    actor_id: userId,
  })

  return first
}

export interface TaskWriteOptions {
  /** A tarefa como está gravada — o que diz se há série e onde ela está. */
  current?: Task
  /** Alcance numa série. Ignorado para tarefa avulsa. */
  scope?: SeriesScope
}

/** Colunas que "esta e as seguintes" / "todas" copiam para as outras
 * ocorrências. Status, posição e data são de cada uma. */
const SHARED_SERIES_COLUMNS = [
  'title',
  'description',
  'priority',
  'assigned_to',
  'client_id',
  'crm_item_id',
  'legal_process_id',
  'publication_id',
  'due_time',
] as const

function sharedSeriesPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const shared: Record<string, unknown> = {}
  for (const column of SHARED_SERIES_COLUMNS) {
    if (column in patch) shared[column] = patch[column]
  }
  return shared
}

export async function updateTask(
  input: UpdateTaskInput,
  userId?: string,
  options: TaskWriteOptions = {}
): Promise<void> {
  const { id, ...rest } = input
  const { current, scope = 'this' } = options
  const { rule, touchesRecurrence, row } = splitRecurrence(rest)
  const patch = dropOrphanTime(nullifyEmpty(row))
  const seriesId = current?.recurrence_series_id ?? null

  // Read the current status first so the feed only records the ≠done → done
  // transition. Emitting on every save would post a new "concluiu a tarefa"
  // every time an already-finished task is edited.
  let justCompleted: { title: string } | null = null
  if (userId && rest.status === 'done') {
    const { data: stored } = await supabase
      .from('tasks')
      .select('status, title')
      .eq('id', id)
      .maybeSingle()
    if (stored && stored.status !== 'done') {
      justCompleted = { title: stored.title as string }
    }
  }

  const newDate = 'due_date' in patch ? (patch.due_date ?? null) : (current?.due_date ?? null)

  if (current && touchesRecurrence && !seriesId && rule && newDate) {
    // Tarefa avulsa que passou a se repetir: vira a 1ª ocorrência de uma série.
    await regenerateSeries({ current, patch, rule, anchor: newDate, userId })
  } else if (!current || !seriesId || scope === 'this' || !touchesRecurrence) {
    // "Somente esta" (ou patch parcial, como o arraste do quadro).
    const { error } = await supabase.from('tasks').update(patch).eq('id', id)
    if (error) throw error
  } else {
    const rebuild = !rule || !isSameRule(rule, current) || newDate !== current.due_date
    const fromDate = scope === 'following' ? current.due_date : null

    if (!rebuild) {
      await updateSeriesInPlace({ id, seriesId, patch, fromDate })
    } else {
      let anchor = newDate
      if (scope === 'all' && current.due_date && newDate) {
        // "Todas" recomeça da primeira pendente, deslocada o mesmo tanto que a
        // data desta foi movida. As concluídas ficam como estão.
        const { data: firstPending, error } = await supabase
          .from('tasks')
          .select('due_date')
          .eq('recurrence_series_id', seriesId)
          .neq('status', 'done')
          .order('due_date')
          .limit(1)
          .maybeSingle()
        if (error) throw error
        const firstDate = (firstPending?.due_date as string | null) ?? current.due_date
        anchor = shiftDateKey(firstDate, daysBetween(current.due_date, newDate))
      }
      await regenerateSeries({ current, patch, rule, anchor, userId, oldSeriesId: seriesId, fromDate })
    }
  }

  if (justCompleted && userId) {
    await recordActivity({
      type: 'task_done',
      entity_type: 'task',
      entity_id: id,
      entity_title: justCompleted.title,
      actor_id: userId,
    })
  }
}

/**
 * "Esta e as seguintes" / "Todas" sem mudar regra nem data: os campos
 * compartilhados vão para as ocorrências PENDENTES no alcance; a editada
 * recebe o patch inteiro. Concluída não muda — é registro do que foi feito.
 */
async function updateSeriesInPlace(params: {
  id: string
  seriesId: string
  patch: Record<string, unknown>
  fromDate: string | null
}): Promise<void> {
  const { id, seriesId, patch, fromDate } = params

  const shared = sharedSeriesPatch(patch)
  if (Object.keys(shared).length > 0) {
    let bulk = supabase
      .from('tasks')
      .update(shared)
      .eq('recurrence_series_id', seriesId)
      .neq('status', 'done')
      .neq('id', id)
    if (fromDate) bulk = bulk.gte('due_date', fromDate)
    const { error } = await bulk
    if (error) throw error
  }

  const { error } = await supabase.from('tasks').update(patch).eq('id', id)
  if (error) throw error
}

/**
 * Refaz as ocorrências pendentes no alcance a partir de `anchor`.
 *
 * A tarefa editada é reaproveitada como primeira ocorrência (mantém checklist
 * e comentários); as demais pendentes no alcance são apagadas e recriadas com
 * um id de série novo. "Esta e as seguintes" divide a série, e o trecho
 * anterior passa a terminar na véspera. Concluídas nunca são apagadas.
 */
async function regenerateSeries(params: {
  current: Task
  patch: Record<string, unknown>
  rule: RecurrenceRule | null
  anchor: string | null
  userId?: string
  oldSeriesId?: string
  fromDate?: string | null
}): Promise<void> {
  const { current, patch, rule, anchor, userId, oldSeriesId, fromDate } = params

  if (oldSeriesId) {
    let removal = supabase
      .from('tasks')
      .delete()
      .eq('recurrence_series_id', oldSeriesId)
      .neq('status', 'done')
      .neq('id', current.id)
    if (fromDate) removal = removal.gte('due_date', fromDate)
    const { error: removalError } = await removal
    if (removalError) throw removalError

    if (fromDate) {
      await supabase
        .from('tasks')
        .update({ recurrence_until: shiftDateKey(fromDate, -1), recurrence_count: null })
        .eq('recurrence_series_id', oldSeriesId)
        .lt('due_date', fromDate)
    }
  }

  // Saiu a regra ("não se repete"): a editada fica avulsa.
  if (!rule || !anchor) {
    const { error } = await supabase
      .from('tasks')
      .update({ ...patch, ...recurrenceColumns(null, null) })
      .eq('id', current.id)
    if (error) throw error
    return
  }

  const dates = expandOccurrences(anchor, rule).dates
  const seriesId = crypto.randomUUID()
  const columns = recurrenceColumns(rule, seriesId)

  const { error: updateError } = await supabase
    .from('tasks')
    .update({ ...patch, due_date: dates[0], ...columns })
    .eq('id', current.id)
  if (updateError) throw updateError

  if (dates.length === 1) return

  // As novas nascem do que a editada passa a ser: gravado + patch.
  const merged = { ...current, ...patch }
  const position = await nextPosition('todo')
  const rows = dates.slice(1).map((date, index) => ({
    title: merged.title,
    description: merged.description,
    status: 'todo' as const,
    priority: merged.priority,
    assigned_to: merged.assigned_to,
    client_id: merged.client_id,
    crm_item_id: merged.crm_item_id,
    legal_process_id: merged.legal_process_id,
    publication_id: merged.publication_id,
    due_time: merged.due_time,
    due_date: date,
    ...columns,
    created_by: userId ?? current.created_by,
    position: position + index,
  }))

  const { error: insertError } = await supabase.from('tasks').insert(rows)
  if (insertError) throw insertError
}

/**
 * Exclui a tarefa — ou, numa série, ela e as seguintes / a série inteira. Das
 * outras ocorrências só saem as pendentes: concluída é histórico.
 */
export async function deleteTask(id: string, options: TaskWriteOptions = {}): Promise<void> {
  const { current, scope = 'this' } = options
  const seriesId = current?.recurrence_series_id

  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
  if (!seriesId || scope === 'this' || !current) return

  let removal = supabase
    .from('tasks')
    .delete()
    .eq('recurrence_series_id', seriesId)
    .neq('status', 'done')
  if (scope === 'following' && current.due_date) removal = removal.gte('due_date', current.due_date)
  const { error: removalError } = await removal
  if (removalError) throw removalError

  if (scope === 'following' && current.due_date) {
    // O que sobrou da série termina na véspera.
    await supabase
      .from('tasks')
      .update({ recurrence_until: shiftDateKey(current.due_date, -1), recurrence_count: null })
      .eq('recurrence_series_id', seriesId)
  }
}

export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const { data, error } = await supabase
    .from('task_comments')
    .select(`
      *,
      author:profiles!task_comments_author_id_fkey(id, full_name, avatar_url, role, created_at)
    `)
    .eq('task_id', taskId)
    .order('created_at')

  if (error) throw error
  return data as TaskComment[]
}

export async function addTaskComment(
  taskId: string,
  content: string,
  userId: string
): Promise<TaskComment> {
  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, author_id: userId, content })
    .select(`
      *,
      author:profiles!task_comments_author_id_fkey(id, full_name, avatar_url, role, created_at)
    `)
    .single()

  if (error) throw error
  return data as TaskComment
}

export async function addChecklistItem(
  taskId: string,
  title: string
): Promise<TaskChecklistItem> {
  const { data: existing } = await supabase
    .from('task_checklist_items')
    .select('position')
    .eq('task_id', taskId)
    .order('position', { ascending: false })
    .limit(1)

  const position = existing?.[0]?.position != null ? existing[0].position + 1 : 0

  const { data, error } = await supabase
    .from('task_checklist_items')
    .insert({ task_id: taskId, title, position })
    .select()
    .single()

  if (error) throw error
  return data as TaskChecklistItem
}

export async function toggleChecklistItem(id: string, isDone: boolean): Promise<void> {
  const { error } = await supabase
    .from('task_checklist_items')
    .update({ is_done: isDone })
    .eq('id', id)
  if (error) throw error
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const { error } = await supabase.from('task_checklist_items').delete().eq('id', id)
  if (error) throw error
}
