import { z } from 'zod'

export const taskStatusSchema = z.enum(['todo', 'in_progress', 'waiting', 'done'])
export const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200),
  description: z.string().max(2000).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigned_to: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  due_date: z.string().optional(),
})

export const taskChecklistItemSchema = z.object({
  title: z.string().min(1, 'Item não pode ser vazio').max(200),
})

export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type UpdateTaskInput = Partial<CreateTaskInput> & { id: string; position?: number }
export type TaskChecklistItemInput = z.infer<typeof taskChecklistItemSchema>
