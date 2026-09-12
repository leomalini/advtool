import { z } from 'zod'
import { crmTagSchema } from './crmItem.schema'

export const LEGAL_AREAS = [
  'trabalhista',
  'civel',
  'familia',
  'tributario',
  'criminal',
  'previdenciario',
  'consumidor',
] as const

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PHONE_DIGITS_REGEX = /^\d{10,11}$/

const contactSchema = z
  .object({
    type: z.enum(['phone', 'email']),
    value: z.string().min(1, 'Valor obrigatório'),
    label: z.string().max(50).optional(),
    is_primary: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'email' && !EMAIL_REGEX.test(data.value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'E-mail inválido', path: ['value'] })
    }
    if (data.type === 'phone' && !PHONE_DIGITS_REGEX.test(data.value.replace(/\D/g, ''))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Telefone inválido', path: ['value'] })
    }
  })

export const ADDRESS_KINDS = ['residencial', 'comercial', 'correspondencia', 'outro'] as const

/** Um endereço da lista. Nada é obrigatório: o cadastro costuma começar só com
 * a cidade, e a qualificação omite o que faltar em vez de exigir. */
const addressSchema = z.object({
  kind: z.enum(ADDRESS_KINDS),
  street: z.string().max(200).optional(),
  number: z.string().max(20).optional(),
  complement: z.string().max(100).optional(),
  neighborhood: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  state: z.string().length(2, 'UF deve ter 2 caracteres').optional().or(z.literal('')),
  zip: z
    .string()
    .regex(/^\d{5}-?\d{3}$/, 'CEP inválido')
    .optional()
    .or(z.literal('')),
  is_primary: z.boolean(),
})

/** A lista de endereços do cliente.
 *
 * Exatamente um principal quando há algum: é ele que entra na petição, e o
 * banco recusa dois pelo índice único parcial da migration 54. Nenhum marcado
 * é erro de formulário, não de dado — o serviço não tem como escolher por
 * conta própria qual dos dois é o de casa. */
const addressListSchema = z
  .array(addressSchema)
  .optional()
  .superRefine((addresses, ctx) => {
    if (!addresses || addresses.length === 0) return

    const primaries = addresses.reduce((total, a) => total + (a.is_primary ? 1 : 0), 0)
    if (primaries === 1) return

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        primaries === 0
          ? 'Marque qual endereço é o principal — é o que entra na qualificação.'
          : 'Só um endereço pode ser o principal.',
    })
  })

const CPF_REGEX = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/
const CNPJ_REGEX = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/

/** Empty is fine — phone and email are both fully optional — but if filled it must be a valid 10/11-digit BR phone. */
const optionalPhoneField = z
  .string()
  .max(30)
  .optional()
  .or(z.literal(''))
  .refine((v) => !v || PHONE_DIGITS_REGEX.test(v.replace(/\D/g, '')), 'Telefone inválido')

export const SEXES = ['masculino', 'feminino', 'outro'] as const
export const MARITAL_STATUSES = [
  'solteiro',
  'casado',
  'divorciado',
  'viuvo',
  'uniao_estavel',
  'separado',
] as const

/** Campos da qualificação — todos opcionais, porque a maioria dos clientes é
 * cadastrada só com nome e documento e o gerador omite o que faltar. */
const qualificationSchema = z.object({
  birth_date: z.string().optional().or(z.literal('')),
  sex: z.enum(SEXES).optional().nullable(),
  nationality: z.string().max(60).optional(),
  marital_status: z.enum(MARITAL_STATUSES).optional().nullable(),
  profession: z.string().max(120).optional(),
  rg: z.string().max(30).optional(),
  rg_issuer: z.string().max(30).optional(),
})

export const createIndividualClientSchema = qualificationSchema
  .extend({
    addresses: addressListSchema,
    type: z.literal('individual'),
    tags: z.array(crmTagSchema).optional(),
    name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(150),
    cpf: z.string().regex(CPF_REGEX, 'CPF inválido (formato: 000.000.000-00)'),
    // Lista, e não valor único: um mesmo cliente tem processos em várias áreas,
    // então a área nunca foi uma propriedade fixa do cadastro. Vazia é válido.
    legal_areas: z.array(z.enum(LEGAL_AREAS)).optional(),
    phone: optionalPhoneField,
    email: z.string().email('E-mail inválido').optional().or(z.literal('')),
    notes: z.string().max(2000).optional(),
    assigned_to: z.string().uuid().optional(),
    contacts: z.array(contactSchema).optional(),
  })

export const createCompanyClientSchema = z
  .object({
    addresses: addressListSchema,
    type: z.literal('company'),
    tags: z.array(crmTagSchema).optional(),
    company_name: z.string().min(2, 'Razão Social deve ter ao menos 2 caracteres').max(200),
    trade_name: z.string().max(200).optional(),
    cnpj: z.string().regex(CNPJ_REGEX, 'CNPJ inválido (formato: 00.000.000/0001-00)'),
    contact_person: z.string().max(150).optional(),
    legal_areas: z.array(z.enum(LEGAL_AREAS)).optional(),
    phone: optionalPhoneField,
    email: z.string().email('E-mail inválido').optional().or(z.literal('')),
    notes: z.string().max(2000).optional(),
    assigned_to: z.string().uuid().optional(),
    contacts: z.array(contactSchema).optional(),
  })

export type ContactInput = z.infer<typeof contactSchema>
export type AddressInput = z.infer<typeof addressSchema>
export type CreateIndividualClientInput = z.infer<typeof createIndividualClientSchema>
export type CreateCompanyClientInput = z.infer<typeof createCompanyClientSchema>
export type CreateClientInput = CreateIndividualClientInput | CreateCompanyClientInput
