import { z } from 'zod'
import { AI_PROVIDERS } from '@/features/ia/config/models'

export const aiProviderSchema = z.enum(AI_PROVIDERS)

/** A chave colada no diálogo. Espaço no meio é sinal de cópia errada. */
export const aiApiKeySchema = z
  .string()
  .trim()
  .min(20, 'A chave parece incompleta.')
  .max(400, 'A chave parece longa demais.')
  .regex(/^\S+$/, 'A chave não pode ter espaços.')

/** ID do workspace da Anthropic. Opcional; vazio vira `null`. */
export const aiWorkspaceIdSchema = z
  .string()
  .trim()
  .max(100, 'ID do workspace longo demais.')
  .regex(/^\S*$/, 'O ID do workspace não pode ter espaços.')
  .transform((value) => value || null)

export const saveAiKeySchema = z.object({
  provider: aiProviderSchema,
  apiKey: aiApiKeySchema,
  workspaceId: aiWorkspaceIdSchema.optional().transform((value) => value ?? null),
})

export const saveAiProviderSchema = z.object({
  provider: aiProviderSchema,
  model: z.string().trim().min(1).max(100),
})

export const aiProviderOnlySchema = z.object({ provider: aiProviderSchema })
