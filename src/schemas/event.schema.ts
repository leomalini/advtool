import { z } from 'zod'

export const eventTypeSchema = z.enum(['meeting', 'hearing', 'deadline', 'appointment'])
export const recurrenceTypeSchema = z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'yearly'])

export const eventFormSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200),
  type: eventTypeSchema,

  // Processo/Cliente
  client_id: z.string().uuid().optional().or(z.literal('')),
  process_number: z.string().max(50).optional(),

  // Responsáveis
  assignee_ids: z.array(z.string().uuid()).min(1, 'Selecione ao menos um responsável'),

  // Data e hora (campos separados para melhor UX)
  start_date: z.string().min(1, 'Data é obrigatória'),
  start_time: z.string().optional(),

  // Prazo fatal
  fatal_deadline_date: z.string().optional(),
  fatal_deadline_time: z.string().optional(),

  // Opções de tempo
  show_in_agenda: z.boolean(),
  all_day: z.boolean(),
  inform_end: z.boolean(),
  end_date: z.string().optional(),
  end_time: z.string().optional(),

  // Detalhes
  location: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),

  // Flags
  is_important: z.boolean(),
  is_urgent: z.boolean(),
  is_future: z.boolean(),
  is_recurring: z.boolean(),
  recurrence_type: recurrenceTypeSchema.optional(),
  is_retroactive: z.boolean(),
  retroactive_completed_at: z.string().optional(),
})

export type EventFormInput = z.infer<typeof eventFormSchema>

// Schema legado — mantido para compatibilidade interna do serviço
export const createEventSchema = eventFormSchema
export type CreateEventInput = EventFormInput
export type UpdateEventInput = Partial<EventFormInput> & { id: string }
