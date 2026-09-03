import { z } from 'zod'

/** Os quatro perfis. Espelha o CHECK de `profiles.role` (migration 34) e o
 * `AppRole` de `@/types/permission.types` — o enum aqui é a barreira que impede
 * um valor inesperado de chegar ao banco pela rota de administração. */
export const appRoleSchema = z.enum(['admin', 'attorney', 'paralegal', 'finance'])

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  full_name: z.string().trim().min(2, 'Informe o nome completo').max(120),
  role: appRoleSchema,
  /** Só faz sentido para advogado, mas não é obrigatório nem lá — o cadastro
   * segue a regra do produto de nunca bloquear por campo faltando. */
  oab_number: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : null)),
  /** UF da inscrição, duas letras. Sem ela a consulta de publicações não
   * consegue montar o parâmetro UF:NÚMERO e a pessoa fica de fora da busca. */
  oab_state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a sigla do estado, com duas letras')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
})

export type InviteUserInput = z.input<typeof inviteUserSchema>

/** Atualização parcial: trocar o perfil, ativar/desativar, ou ambos. */
export const updateUserSchema = z
  .object({
    role: appRoleSchema.optional(),
    is_active: z.boolean().optional(),
    oab_number: z
      .string()
      .trim()
      .max(40)
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v || null)),
    oab_state: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'Use a sigla do estado, com duas letras')
      .nullable()
      .optional()
      .or(z.literal(''))
      .transform((v) => (v === undefined ? undefined : v || null)),
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: 'Nada a atualizar',
  })

/** Tipo de ENTRADA: quem chama a rota manda só o que quer mudar, e o
 * `z.infer` (saída) transformaria cada campo opcional em chave obrigatória. */
export type UpdateUserInput = z.input<typeof updateUserSchema>
