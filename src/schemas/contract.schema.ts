import { z } from 'zod'
import type { ContractTemplateValues } from '@/types/contract.types'

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
    /** Modelo da minuta — os papéis dele guiam as partes (migration 70). */
    template_id: optionalUuid,

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

// ── Partes (migration 70) ────────────────────────────────────────────────────

export const contractPartySourceSchema = z.enum(['cliente', 'escritorio', 'documentos', 'manual'])

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable()

export const partyAddressSchema = z.object({
  street: optionalText(200),
  number: optionalText(20),
  complement: optionalText(100),
  neighborhood: optionalText(100),
  city: optionalText(100),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-Z]{2})?$/, 'UF com duas letras')
    .optional()
    .nullable(),
  zip: optionalText(10),
})

export const contractPartySchema = z.object({
  role_key: z
    .string()
    .min(1, 'Escolha o papel')
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, 'Papel inválido'),
  role_label: z.string().trim().min(1, 'Escolha o papel').max(60),
  person_type: z.enum(['individual', 'company']),
  name: z.string().trim().min(1, 'Informe o nome').max(200),
  document: z
    .string()
    .max(30)
    .optional()
    .nullable()
    // Mesma regra das partes do processo: vazio é legítimo, pela metade não.
    .refine(
      (value) => !value || [11, 14].includes(value.replace(/\D/g, '').length),
      'Informe um CPF ou CNPJ completo'
    ),
  rg: optionalText(30),
  rg_issuer: optionalText(30),
  sex: z.enum(['masculino', 'feminino', 'outro']).optional().nullable(),
  birth_date: z.string().optional().nullable(),
  nationality: optionalText(60),
  marital_status: z
    .enum(['solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel', 'separado'])
    .optional()
    .nullable(),
  profession: optionalText(100),
  address: partyAddressSchema,
  email: z.string().trim().max(200).email('E-mail inválido').optional().nullable().or(z.literal('')),
  phone: optionalText(30),
  representative: optionalText(200),
})

export type ContractPartyInput = z.infer<typeof contractPartySchema>

// ── Minuta guardada ──────────────────────────────────────────────────────────

const stringRecord = z.record(z.string(), z.string())

export const contractTemplateValuesSchema = z.object({
  templateId: z.string().uuid().optional(),
  manual: stringRecord.optional(),
  choices: z.record(z.string(), z.array(z.string())).optional(),
  ai: stringRecord.optional(),
  overrides: stringRecord.optional(),
  lawyerIds: z.array(z.string().uuid()).optional(),
  manualSources: stringRecord.optional(),
})

/** `contracts.template_values` como veio do banco. Inválido vira vazio: a
 * tela de geração abre sem o que foi preenchido, mas abre. */
export function parseContractTemplateValues(raw: unknown): ContractTemplateValues {
  const parsed = contractTemplateValuesSchema.safeParse(raw)
  return parsed.success ? parsed.data : {}
}
