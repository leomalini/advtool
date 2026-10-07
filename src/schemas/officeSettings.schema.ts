import { z } from 'zod'

/** Texto opcional de formulário: '' é "não informado" e vira null ao gravar. */
const text = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres`)

export const officeSettingsSchema = z.object({
  name: text(200),
  cnpj: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || value.replace(/\D/g, '').length === 14,
      'CNPJ com 14 dígitos',
    ),
  oab_registration: text(60),
  zip: text(9),
  state: z
    .string()
    .trim()
    .refine((value) => value === '' || /^[A-Za-z]{2}$/.test(value), 'UF com 2 letras'),
  city: text(120),
  street: text(200),
  number: text(20),
  complement: text(120),
  neighborhood: text(120),
  phone: text(30),
  email: z.string().trim().email('E-mail inválido').or(z.literal('')),
})

export type OfficeSettingsFormValues = z.infer<typeof officeSettingsSchema>

/**
 * A InfiniteTag como o app da InfinitePay mostra (`$escritorio`) ou já sem o
 * `$` — a API quer sem. '' é "nenhuma conta", e vira null ao gravar.
 *
 * Só recusa o que certamente não é uma tag: o formato exato não está
 * documentado, e o CHECK da migration 67 segue a mesma regra.
 */
export const infinitePayHandleSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^\$+/, ''))
  .pipe(
    z
      .string()
      .max(60, 'Máximo de 60 caracteres')
      .regex(/^[^\s$]*$/, 'A InfiniteTag não tem espaços nem "$" no meio.'),
  )
