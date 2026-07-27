import { z } from 'zod'

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

const addressSchema = z.object({
  address_street: z.string().max(200).optional(),
  address_number: z.string().max(20).optional(),
  address_complement: z.string().max(100).optional(),
  address_neighborhood: z.string().max(100).optional(),
  address_city: z.string().max(100).optional(),
  address_state: z.string().length(2, 'UF deve ter 2 caracteres').optional().or(z.literal('')),
  address_zip: z
    .string()
    .regex(/^\d{5}-?\d{3}$/, 'CEP inválido')
    .optional()
    .or(z.literal('')),
})

const CPF_REGEX = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/
const CNPJ_REGEX = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/

/** Empty is fine (phone is optional overall — see the per-schema "at least one contact" refine below), but if filled it must be a valid 10/11-digit BR phone. */
const optionalPhoneField = z
  .string()
  .max(30)
  .optional()
  .or(z.literal(''))
  .refine((v) => !v || PHONE_DIGITS_REGEX.test(v.replace(/\D/g, '')), 'Telefone inválido')

export const createIndividualClientSchema = addressSchema
  .extend({
    type: z.literal('individual'),
    name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(150),
    cpf: z.string().regex(CPF_REGEX, 'CPF inválido (formato: 000.000.000-00)'),
    legal_area: z.enum(LEGAL_AREAS, { message: 'Selecione a área jurídica' }),
    phone: optionalPhoneField,
    email: z.string().email('E-mail inválido').optional().or(z.literal('')),
    notes: z.string().max(2000).optional(),
    assigned_to: z.string().uuid().optional(),
    contacts: z.array(contactSchema).optional(),
  })
  .refine((data) => !!data.phone || !!data.email, {
    message: 'Informe ao menos um telefone ou e-mail de contato',
    path: ['phone'],
  })

export const createCompanyClientSchema = addressSchema
  .extend({
    type: z.literal('company'),
    company_name: z.string().min(2, 'Razão Social deve ter ao menos 2 caracteres').max(200),
    trade_name: z.string().max(200).optional(),
    cnpj: z.string().regex(CNPJ_REGEX, 'CNPJ inválido (formato: 00.000.000/0001-00)'),
    contact_person: z.string().max(150).optional(),
    legal_area: z.enum(LEGAL_AREAS, { message: 'Selecione a área jurídica' }),
    phone: optionalPhoneField,
    email: z.string().email('E-mail inválido').optional().or(z.literal('')),
    notes: z.string().max(2000).optional(),
    assigned_to: z.string().uuid().optional(),
    contacts: z.array(contactSchema).optional(),
  })
  .refine((data) => !!data.phone || !!data.email, {
    message: 'Informe ao menos um telefone ou e-mail de contato',
    path: ['phone'],
  })

export type ContactInput = z.infer<typeof contactSchema>
export type CreateIndividualClientInput = z.infer<typeof createIndividualClientSchema>
export type CreateCompanyClientInput = z.infer<typeof createCompanyClientSchema>
export type CreateClientInput = CreateIndividualClientInput | CreateCompanyClientInput
