import { z } from 'zod'

export const financialTypeSchema = z.enum(['receita', 'despesa'])
export const financialCategorySchema = z.enum(['honorario', 'exito', 'custas', 'pericia', 'outros'])
export const financialStatusSchema = z.enum(['pendente', 'pago'])
export const financialSettlementKindSchema = z.enum(['scheduled', 'conditional'])

/** Campo opcional vindo de um controle de formulário: '' é o valor de um
 * select/input intocado, e Postgres rejeita isso em coluna uuid/date. */
const optionalUuid = z.string().uuid().optional().nullable().or(z.literal(''))

/** An optional number from a form control: '' and NaN (an empty
 * `valueAsNumber`) mean "not filled", which the database stores as null. */
const optionalNumber = z.preprocess(
  (value) => (value === '' || (typeof value === 'number' && Number.isNaN(value)) ? null : value),
  z.number().nullable().optional()
)

export const financialEntrySchema = z
  .object({
    type: financialTypeSchema,
    category: financialCategorySchema,
    description: z.string().min(1, 'Descrição é obrigatória').max(300),
    // Zero only while a percentage is to be assessed — see the superRefine.
    amount: z.coerce
      .number({ error: 'Informe um valor' })
      .min(0, 'O valor não pode ser negativo'),
    status: financialStatusSchema,

    settlement_kind: financialSettlementKindSchema,
    /** Vencimento ('scheduled') ou previsão ('conditional'). A obrigatoriedade
     * depende do kind — ver o superRefine abaixo. */
    due_date: z.string().optional().nullable(),
    condition_description: z.string().max(300).optional().nullable(),

    paid_at: z.string().optional().nullable(),

    // Percentage of a base (migration 89). No percent = a fixed amount.
    percent: optionalNumber,
    base_description: z.string().max(300).optional().nullable(),
    base_amount: optionalNumber,
    estimated_base_amount: optionalNumber,

    client_id: optionalUuid,
    crm_item_id: optionalUuid,
    legal_process_id: optionalUuid,
    contract_id: optionalUuid,
  })
  // As mesmas regras dos CHECKs das migrations 40 e 89. Existem nos dois
  // lugares de propósito: o banco garante a integridade, o zod dá a mensagem
  // no campo certo antes do round-trip.
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

    const percent = data.percent ?? null
    if (percent !== null) {
      if (!(percent > 0 && percent <= 100)) {
        ctx.addIssue({
          code: 'custom',
          path: ['percent'],
          message: 'Percentual entre 0 e 100',
        })
      }
      if (!data.base_description?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['base_description'],
          message: 'Diga sobre o que incide o percentual',
        })
      }
    }

    // To assess: no base yet, so nothing to charge, no payment, no date. The
    // form sets these itself; the issues only show if something slipped.
    const toAssess = percent !== null && (data.base_amount ?? null) === null
    if (toAssess) {
      if (data.settlement_kind !== 'conditional') {
        ctx.addIssue({
          code: 'custom',
          path: ['settlement_kind'],
          message: 'A apurar fica em condição especial até o valor da base',
        })
      }
      if (data.status !== 'pendente') {
        ctx.addIssue({
          code: 'custom',
          path: ['status'],
          message: 'Informe o valor da base antes da baixa',
        })
      }
    } else if (!(data.amount > 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'O valor deve ser maior que zero',
      })
    }
  })

export type FinancialEntryInput = z.infer<typeof financialEntrySchema>
export type UpdateFinancialEntryInput = Partial<FinancialEntryInput> & { id: string }
