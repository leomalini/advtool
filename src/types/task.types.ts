import type { BaseEntity, Profile } from './common.types'

export type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'A Fazer',
  in_progress: 'Em Andamento',
  waiting: 'Aguardando',
  done: 'Concluído',
}

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
}

export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'text-green-600',
  medium: 'text-yellow-600',
  high: 'text-orange-600',
  urgent: 'text-red-600',
}

export interface Task extends BaseEntity {
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assigned_to: string | null
  client_id: string | null
  lead_id: string | null
  due_date: string | null
  position: number
  created_by: string
  assignee?: Profile | null
  checklist_items?: TaskChecklistItem[]
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string
  content: string
  created_at: string
  author?: Profile
}

export interface TaskChecklistItem {
  id: string
  task_id: string
  title: string
  is_done: boolean
  position: number
  created_at: string
}
