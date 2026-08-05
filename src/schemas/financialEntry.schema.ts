import { z } from 'zod'

export const financialTypeSchema = z.enum(['receita', 'despesa'])
export const financialCategorySchema = z.enum(['honorario', 'custas', 'pericia', 'outros'])
export const financialStatusSchema = z.enum(['pendente', 'pago'])

/** Campo opcional vindo de um controle de formulário: '' é o valor de um
 * select/input intocado, e Postgres rejeita isso em coluna uuid/date. */
const optionalUuid = z.string().uuid().optional().nullable().or(z.literal(''))

export const financialEntrySchema = z.object({
  type: financialTypeSchema,
  category: financialCategorySchema,
  description: z.string().min(1, 'Descrição é obrigatória').max(300),
  amount: z.coerce
    .number({ error: 'Informe um valor' })
    .positive('O valor deve ser maior que zero'),
  status: financialStatusSchema,
  due_date: z.string().min(1, 'Vencimento é obrigatório'),
  paid_at: z.string().optional().nullable(),

  client_id: optionalUuid,
  crm_item_id: optionalUuid,
  legal_process_id: optionalUuid,
})

export type FinancialEntryInput = z.infer<typeof financialEntrySchema>
export type UpdateFinancialEntryInput = Partial<FinancialEntryInput> & { id: string }
