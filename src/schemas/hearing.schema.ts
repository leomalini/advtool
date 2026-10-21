import { z } from 'zod'
import { HEARING_MODALITIES, LEGAL_AREAS } from '@/types/hearing.types'

const TIME = /^\d{2}:\d{2}$/

/** Só http(s): o link vira `href`, e `javascript:` ali seria XSS. O banco tem
 * o mesmo CHECK (migration 76); este existe para a mensagem sair no campo. */
export const meetingUrlSchema = z
  .string()
  .trim()
  .max(500, 'Link longo demais')
  .refine((value) => value === '' || /^https?:\/\/\S+$/i.test(value), {
    message: 'Informe o link completo, começando com https://',
  })

export const hearingDetailsSchema = z.object({
  kind_id: z.string().min(1, 'Selecione o tipo'),
  modality: z.enum(HEARING_MODALITIES).nullable(),
  meeting_url: meetingUrlSchema,
})

export type HearingDetailsInput = z.infer<typeof hearingDetailsSchema>

/** Data e horário no relógio do escritório — a conversão para instante é
 * `toInstant`, a mesma da Agenda. */
export const hearingScheduleSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data'),
    start_time: z.string().regex(TIME, 'Informe a hora'),
    end_time: z.string().regex(TIME, 'Informe o término'),
  })
  .refine((value) => value.end_time >= value.start_time, {
    message: 'O término não pode ser antes do início',
    path: ['end_time'],
  })

export type HearingScheduleInput = z.infer<typeof hearingScheduleSchema>

/** Dias antes da audiência: vazio = sem prazo. O teto é o do CHECK da
 * migration 77. */
const offsetDaysSchema = z
  .number()
  .int('Use dias inteiros')
  .min(0, 'Não pode ser negativo')
  .max(365, 'No máximo 365 dias antes')
  .nullable()

export const checklistItemSchema = z.object({
  label: z.string().trim().min(1, 'Descreva o item').max(200, 'No máximo 200 caracteres'),
  offset_days: offsetDaysSchema,
})

export type ChecklistItemInput = z.infer<typeof checklistItemSchema>

export const checklistTemplateSchema = z.object({
  kind_id: z.string().min(1).nullable(),
  legal_area: z.enum(LEGAL_AREAS).nullable(),
  label: z.string().trim().min(1, 'Descreva o item').max(200, 'No máximo 200 caracteres'),
  offset_days: offsetDaysSchema,
  creates_task: z.boolean(),
  client_brings: z.boolean(),
})

export type ChecklistTemplateInput = z.infer<typeof checklistTemplateSchema>

export const hearingKindSchema = z.object({
  label: z.string().trim().min(1, 'Dê um nome ao tipo').max(60, 'No máximo 60 caracteres'),
  /** Vazio = "Audiência — <nome>". */
  event_title: z.string().trim().max(120, 'No máximo 120 caracteres'),
  default_duration_minutes: z
    .number()
    .int('Use minutos inteiros')
    .min(5, 'No mínimo 5 minutos')
    .max(1440, 'No máximo 24 horas'),
})

export type HearingKindInput = z.infer<typeof hearingKindSchema>
