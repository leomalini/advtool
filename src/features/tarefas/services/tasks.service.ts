import { createClient } from '@/lib/supabase/client'
import type { Task, TaskComment, TaskChecklistItem } from '@/types/task.types'
import type { CreateTaskInput, UpdateTaskInput } from '@/schemas/task.schema'

const supabase = createClient()

const TASK_SELECT = `
  *,
  assignee:profiles!tasks_assigned_to_fkey(id, full_name, avatar_url, role, created_at),
  checklist_items:task_checklist_items(*)
`

export async function getTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .order('position')

  if (error) throw error
  return data as Task[]
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
    .insert({ ...input, created_by: userId, position })
    .select(TASK_SELECT)
    .single()

  if (error) throw error

  await supabase.from('activities').insert({
    type: 'task_created',
    entity_type: 'task',
    entity_id: data.id,
    entity_title: data.title,
    actor_id: userId,
  })

  return data as Task
}

export async function updateTask(input: UpdateTaskInput): Promise<void> {
  const { id, ...rest } = input
  const { error } = await supabase.from('tasks').update(rest).eq('id', id)
  if (error) throw error
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
