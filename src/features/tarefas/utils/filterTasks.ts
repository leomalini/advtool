import type { Task, TaskPriority } from '@/types/task.types'
import { isBefore, parseISO } from 'date-fns'

export interface TaskFilters {
  search: string
  priority: TaskPriority | null
  assignedTo: string | null
  /** Only tasks past their due date and not done. */
  overdueOnly: boolean
}

export const emptyTaskFilters: TaskFilters = {
  search: '',
  priority: null,
  assignedTo: null,
  overdueOnly: false,
}

export function hasActiveTaskFilters(f: TaskFilters): boolean {
  return (
    f.search.trim() !== '' ||
    f.priority !== null ||
    f.assignedTo !== null ||
    f.overdueOnly
  )
}

export function countActiveTaskFilters(f: TaskFilters): number {
  let n = 0
  if (f.search.trim() !== '') n++
  if (f.priority !== null) n++
  if (f.assignedTo !== null) n++
  if (f.overdueOnly) n++
  return n
}

export function isTaskOverdue(task: Task): boolean {
  return (
    !!task.due_date &&
    task.status !== 'done' &&
    isBefore(parseISO(task.due_date), new Date())
  )
}

/** Applies the task filters (texto + prioridade + responsável + atrasadas). */
export function filterTasks(tasks: Task[], f: TaskFilters): Task[] {
  const q = f.search.trim().toLowerCase()

  return tasks.filter((t) => {
    if (f.priority && t.priority !== f.priority) return false
    if (f.assignedTo && t.assigned_to !== f.assignedTo) return false
    if (f.overdueOnly && !isTaskOverdue(t)) return false

    if (q) {
      const haystack = [t.title, t.description, t.assignee?.full_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }

    return true
  })
}
