import { z } from 'zod'
import { recurrenceFormFields, recurrenceIssue } from './recurrence.schema'

/** Slug de `event_types.id`. Deixou de ser enum na migration 32 — os tipos são
 * cadastrados pelo escritório, e a integridade é garantida pela FK, não aqui. */
export const eventTypeSchema = z.string().min(1, 'Selecione um tipo')

export const eventFormSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200),
  type: eventTypeSchema,

  // Processo/Cliente
  client_id: z.string().uuid().optional().or(z.literal('')),
  /** The processo this event belongs to — what the agenda form lets you pick. */
  legal_process_id: z.string().uuid().optional().nullable().or(z.literal('')),
  /** Set automatically when an event is created from inside a CRM item (the
   * Agenda tab of CasoModal); not exposed in the agenda form, where linking to
   * a processo is the meaningful choice. */
  crm_item_id: z.string().uuid().optional().nullable().or(z.literal('')),

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
  is_retroactive: z.boolean(),
  retroactive_completed_at: z.string().optional(),

  // Repetir — virou série de verdade na migration 52. A antiga flag
  // "Recorrente" só gravava um rótulo; `is_recurring` agora é derivado.
  ...recurrenceFormFields,
}).superRefine((data, ctx) => {
  const recurrence = recurrenceIssue(data, data.start_date)
  if (recurrence) {
    ctx.addIssue({ code: 'custom', message: recurrence.message, path: [recurrence.path] })
  }

  if (!data.inform_end || !data.end_date) return
  // Dia inteiro compara só as datas: o término é o último dia, inclusivo.
  // Strings yyyy-MM-dd / HH:mm ordenam como as datas que representam.
  const endsBeforeStart = data.all_day
    ? data.end_date < data.start_date
    : `${data.end_date}T${data.end_time || '00:00'}` < `${data.start_date}T${data.start_time || '00:00'}`
  if (endsBeforeStart) {
    // Antes só o CHECK do banco pegava isso, e a tela mostrava um "Erro ao
    // criar evento" sem dizer o motivo.
    ctx.addIssue({
      code: 'custom',
      message: 'O término não pode ser antes do início',
      path: ['end_date'],
    })
  }
})

export type EventFormInput = z.infer<typeof eventFormSchema>

// Schema legado — mantido para compatibilidade interna do serviço
export const createEventSchema = eventFormSchema
export type CreateEventInput = EventFormInput
export type UpdateEventInput = Partial<EventFormInput> & { id: string }
