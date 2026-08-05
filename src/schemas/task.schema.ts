import { z } from 'zod'

export const taskStatusSchema = z.enum(['todo', 'in_progress', 'waiting', 'done'])
export const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])

/** Optional field coming from a form control: an untouched `<input>`/`<Select>`
 * yields '', which Postgres rejects for uuid/date columns. Accept it here and
 * let the service turn it into null (see `nullifyEmpty` in tasks.service.ts). */
const optionalUuid = z.string().uuid().optional().nullable().or(z.literal(''))

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200),
  description: z.string().max(2000).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigned_to: optionalUuid,
  client_id: optionalUuid,
  crm_item_id: optionalUuid,
  legal_process_id: optionalUuid,
  due_date: z.string().optional().nullable(),
})

export const taskChecklistItemSchema = z.object({
  title: z.string().min(1, 'Item não pode ser vazio').max(200),
})

export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type UpdateTaskInput = Partial<CreateTaskInput> & { id: string; position?: number }
export type TaskChecklistItemInput = z.infer<typeof taskChecklistItemSchema>
