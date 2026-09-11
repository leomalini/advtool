import { createClient } from '@/lib/supabase/client'
import { recordActivity } from '@/lib/activities'
import type { Task, TaskComment, TaskChecklistItem } from '@/types/task.types'
import type { CreateTaskInput, UpdateTaskInput } from '@/schemas/task.schema'

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

export async function createTask(
  input: CreateTaskInput,
  userId: string
): Promise<Task> {
  const { data: statusTasks } = await supabase
    .from('tasks')
    .select('position')
    .eq('status', input.status ?? 'todo')
    .order('position', { ascending: false })
    .limit(1)

  const position = statusTasks?.[0]?.position != null ? statusTasks[0].position + 1 : 0

  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...dropOrphanTime(nullifyEmpty(input)), created_by: userId, position })
    .select(TASK_SELECT)
    .single()

  if (error) throw error

  await recordActivity({
    type: 'task_created',
    entity_type: 'task',
    entity_id: data.id,
    entity_title: data.title,
    actor_id: userId,
  })

  return data as Task
}

export async function updateTask(input: UpdateTaskInput, userId?: string): Promise<void> {
  const { id, ...rest } = input

  // Read the current status first so the feed only records the ≠done → done
  // transition. Emitting on every save would post a new "concluiu a tarefa"
  // every time an already-finished task is edited.
  let justCompleted: { title: string } | null = null
  if (userId && rest.status === 'done') {
    const { data: current } = await supabase
      .from('tasks')
      .select('status, title')
      .eq('id', id)
      .maybeSingle()
    if (current && current.status !== 'done') {
      justCompleted = { title: current.title as string }
    }
  }

  const { error } = await supabase
    .from('tasks')
    .update(dropOrphanTime(nullifyEmpty(rest)))
    .eq('id', id)
  if (error) throw error

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

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
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
