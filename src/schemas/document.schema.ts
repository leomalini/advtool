import { z } from 'zod'

export const documentCategorySchema = z.enum([
  'peticao',
  'contrato',
  'procuracao',
  'decisao',
  'outros',
])

/** Campo opcional vindo de um controle de formulário: '' é o valor de um
 * select intocado, e Postgres rejeita isso em coluna uuid. */
const optionalUuid = z.string().uuid().optional().nullable().or(z.literal(''))

export const documentUploadSchema = z.object({
  category: documentCategorySchema,
  client_id: optionalUuid,
  crm_item_id: optionalUuid,
  legal_process_id: optionalUuid,
  event_id: optionalUuid,
})

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>

/** Limite por arquivo. O bucket é privado e o plano não é ilimitado — recusar
 * cedo é melhor que falhar no meio do upload. */
export const MAX_FILE_SIZE = 25 * 1024 * 1024
