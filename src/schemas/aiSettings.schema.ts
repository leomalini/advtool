import { z } from 'zod'
import { AI_FEATURES, AI_PROVIDERS } from '@/features/ia/config/models'

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

export const aiFeatureSchema = z.enum(AI_FEATURES)

export const saveAiFeatureSchema = z.object({
  feature: aiFeatureSchema,
  enabled: z.boolean(),
})

/** Teto em US$, com centavos. */
export const aiBudgetUsdSchema = z
  .number({ error: 'Informe o teto em US$.' })
  .positive('O teto precisa ser maior que zero.')
  .max(100_000, 'Teto alto demais.')
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
    'Use no máximo duas casas decimais.',
  )

export const saveAiBudgetSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('env') }),
  z.object({ source: z.literal('panel'), usd: aiBudgetUsdSchema.nullable() }),
])
