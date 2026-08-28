import { z } from 'zod'

export const financialTypeSchema = z.enum(['receita', 'despesa'])
export const financialCategorySchema = z.enum(['honorario', 'custas', 'pericia', 'outros'])
export const financialStatusSchema = z.enum(['pendente', 'pago'])
export const financialSettlementKindSchema = z.enum(['scheduled', 'conditional'])

/** Campo opcional vindo de um controle de formulário: '' é o valor de um
 * select/input intocado, e Postgres rejeita isso em coluna uuid/date. */
const optionalUuid = z.string().uuid().optional().nullable().or(z.literal(''))

export const financialEntrySchema = z
  .object({
    type: financialTypeSchema,
    category: financialCategorySchema,
    description: z.string().min(1, 'Descrição é obrigatória').max(300),
    amount: z.coerce
      .number({ error: 'Informe um valor' })
      .positive('O valor deve ser maior que zero'),
    status: financialStatusSchema,

    settlement_kind: financialSettlementKindSchema,
    /** Vencimento ('scheduled') ou previsão ('conditional'). A obrigatoriedade
     * depende do kind — ver o superRefine abaixo. */
    due_date: z.string().optional().nullable(),
    condition_description: z.string().max(300).optional().nullable(),

    paid_at: z.string().optional().nullable(),

    client_id: optionalUuid,
    crm_item_id: optionalUuid,
    legal_process_id: optionalUuid,
  })
  // As mesmas duas regras dos CHECKs da migration 40. Existem nos dois lugares
  // de propósito: o banco garante a integridade, o zod dá a mensagem no campo
  // certo antes do round-trip.
  .superRefine((data, ctx) => {
    if (data.settlement_kind === 'scheduled' && !data.due_date) {
      ctx.addIssue({
        code: 'custom',
        // Sem `path` o erro não chega ao react-hook-form: ele casa issue com
        // campo pelo caminho, e um issue de raiz fica invisível no formulário.
        path: ['due_date'],
        message: 'Vencimento é obrigatório',
      })
    }

    if (
      data.settlement_kind === 'conditional' &&
      !data.condition_description?.trim()
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['condition_description'],
        message: 'Descreva a condição para o recebimento',
      })
    }
  })

export type FinancialEntryInput = z.infer<typeof financialEntrySchema>
export type UpdateFinancialEntryInput = Partial<FinancialEntryInput> & { id: string }
