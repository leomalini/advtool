import { z } from 'zod'

export const contractKindSchema = z.enum(['honorarios', 'cliente_terceiros', 'escritorio'])
export const contractStatusSchema = z.enum([
  'rascunho',
  'aguardando_assinatura',
  'vigente',
  'encerrado',
  'rescindido',
])
export const contractFileRoleSchema = z.enum(['minuta', 'assinado', 'anexo'])

/** Campo opcional vindo de um controle de formulário: '' é o valor de um
 * select/input intocado, e Postgres rejeita isso em coluna uuid/date. */
const optionalUuid = z.string().uuid().optional().nullable().or(z.literal(''))
const optionalDate = z.string().optional().nullable()

export const contractSchema = z
  .object({
    kind: contractKindSchema,
    title: z.string().trim().min(1, 'Dê um nome ao contrato').max(200),
    status: contractStatusSchema,

    client_id: optionalUuid,
    legal_process_id: optionalUuid,
    responsible_id: optionalUuid,

    // Números chegam já como number (ou null) dos controles: `CurrencyInput`
    // e os `setValueAs` do formulário. Sem `coerce`, que faria de um campo
    // vazio um zero.
    total_amount: z.number().nonnegative('O valor não pode ser negativo').nullable(),
    installments: z
      .number({ error: 'Informe um número' })
      .int('Número inteiro de parcelas')
      .min(1, 'Ao menos 1 parcela')
      .max(360, 'No máximo 360 parcelas')
      .nullable(),
    first_due_date: optionalDate,
    success_fee_percent: z
      .number({ error: 'Informe um número' })
      .min(0, 'Entre 0 e 100')
      .max(100, 'Entre 0 e 100')
      .nullable(),

    start_date: optionalDate,
    end_date: optionalDate,
    notice_days: z
      .number({ error: 'Informe os dias de aviso' })
      .int()
      .min(0, 'Entre 0 e 365 dias')
      .max(365, 'Entre 0 e 365 dias'),
    auto_renew: z.boolean(),
    adjustment_index: z.string().trim().max(40).optional().nullable(),

    signed_at: optionalDate,
    notes: z.string().max(4000).optional().nullable(),
  })
  // As regras que o banco não guarda, ou guarda sem mensagem boa (migration
  // 69). Sem `path` o erro não chega ao react-hook-form.
  .superRefine((data, ctx) => {
    if (data.kind === 'honorarios' && !data.client_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['client_id'],
        message: 'Contrato de honorários precisa do cliente',
      })
    }

    if (data.start_date && data.end_date && data.end_date < data.start_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'O fim não pode ser antes do início',
      })
    }
  })

export type ContractInput = z.infer<typeof contractSchema>
export type UpdateContractInput = Partial<ContractInput> & { id: string }
