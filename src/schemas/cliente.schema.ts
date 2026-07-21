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

const contactSchema = z.object({
  type: z.enum(['phone', 'email']),
  value: z.string().min(1, 'Valor obrigatório'),
  label: z.string().max(50).optional(),
  is_primary: z.boolean(),
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

export const createIndividualClientSchema = addressSchema.extend({
  type: z.literal('individual'),
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(150),
  cpf: z
    .string()
    .regex(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, 'CPF inválido')
    .optional()
    .or(z.literal('')),
  legal_area: z.enum(LEGAL_AREAS).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
  assigned_to: z.string().uuid().optional(),
  contacts: z.array(contactSchema).optional(),
})

export const createCompanyClientSchema = addressSchema.extend({
  type: z.literal('company'),
  company_name: z.string().min(2, 'Razão Social deve ter ao menos 2 caracteres').max(200),
  trade_name: z.string().max(200).optional(),
  cnpj: z
    .string()
    .regex(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, 'CNPJ inválido')
    .optional()
    .or(z.literal('')),
  contact_person: z.string().max(150).optional(),
  legal_area: z.enum(LEGAL_AREAS).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
  assigned_to: z.string().uuid().optional(),
  contacts: z.array(contactSchema).optional(),
})

export const createClientSchema = z.discriminatedUnion('type', [
  createIndividualClientSchema,
  createCompanyClientSchema,
])

export type ContactInput = z.infer<typeof contactSchema>
export type CreateIndividualClientInput = z.infer<typeof createIndividualClientSchema>
export type CreateCompanyClientInput = z.infer<typeof createCompanyClientSchema>
export type CreateClientInput = z.infer<typeof createClientSchema>
