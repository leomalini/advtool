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
})

export type InviteUserInput = z.input<typeof inviteUserSchema>

/** Atualização parcial: trocar o perfil, ativar/desativar, ou ambos. */
export const updateUserSchema = z
  .object({
    role: appRoleSchema.optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.is_active !== undefined, {
    message: 'Nada a atualizar',
  })

export type UpdateUserInput = z.infer<typeof updateUserSchema>
