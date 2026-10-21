import { z } from 'zod'
import { HEARING_MODALITIES } from '@/types/hearing.types'

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
