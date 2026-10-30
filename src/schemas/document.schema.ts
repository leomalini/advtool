import { z } from 'zod'
import { contractFileRoleSchema } from './contract.schema'

export const documentCategorySchema = z.enum([
  'peticao',
  'contrato',
  'procuracao',
  'decisao',
  'identificacao',
  'certidao',
  'comprovante_residencia',
  'comprovante',
  'nota_fiscal',
  'boleto',
  'outros',
])

export const documentOriginSchema = z.enum(['upload', 'modelo', 'assinatura', 'ia'])

/** Campo opcional vindo de um controle de formulário: '' é o valor de um
 * select intocado, e Postgres rejeita isso em coluna uuid. */
const optionalUuid = z.string().uuid().optional().nullable().or(z.literal(''))

export const documentUploadSchema = z.object({
  category: documentCategorySchema,
  client_id: optionalUuid,
  crm_item_id: optionalUuid,
  legal_process_id: optionalUuid,
  event_id: optionalUuid,
  task_id: optionalUuid,
  /** Exclusivo: anexo de lançamento não leva os outros vínculos (migration 63). */
  financial_entry_id: optionalUuid,
  /** Exclusivo, como o de lançamento, e sempre com o papel (migration 69). */
  contract_id: optionalUuid,
  contract_file_role: contractFileRoleSchema.optional().nullable(),
  /** Sem ela, 'upload' — o default da coluna (migration 87). */
  origin: documentOriginSchema.optional(),
})

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>

/** Limite por arquivo. O bucket é privado e o plano não é ilimitado — recusar
 * cedo é melhor que falhar no meio do upload. */
export const MAX_FILE_SIZE = 25 * 1024 * 1024
