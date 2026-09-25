import { z } from 'zod'
import {
  MANUAL_FIELD_FORMATS,
  TEMPLATE_CATEGORIES,
  type TemplateFieldSetting,
  type TemplateFieldSettings,
} from '@/types/documentTemplate.types'

export const templateCategorySchema = z.enum(TEMPLATE_CATEGORIES)

export const manualFieldFormatSchema = z.enum(MANUAL_FIELD_FORMATS)

/** Limites do campo de opções — os mesmos que a tela de definição impõe. */
export const MAX_CHOICE_OPTIONS = 50
export const MAX_CHOICE_LABEL = 120
export const MAX_CHOICE_TEXT = 5000

const choiceOptionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(MAX_CHOICE_LABEL),
  text: z.string().max(MAX_CHOICE_TEXT),
})

export const templateFieldSettingSchema: z.ZodType<TemplateFieldSetting> = z.discriminatedUnion(
  'kind',
  [
    z.object({
      kind: z.literal('manual'),
      label: z.string().trim().max(80),
      format: manualFieldFormatSchema,
    }),
    z.object({
      kind: z.literal('choice'),
      label: z.string().trim().max(80),
      options: z.array(choiceOptionSchema).max(MAX_CHOICE_OPTIONS),
      multiple: z.boolean(),
      joinWith: z.enum(['list', 'paragraphs']),
    }),
    z.object({
      kind: z.literal('ai'),
      label: z.string().trim().max(80),
      instruction: z.string().trim().max(1000),
    }),
  ],
)

/**
 * `field_settings` como veio do banco. Entrada que não bate com o schema é
 * descartada, não lançada: o campo cai no padrão inferido pelo nome, e a tela
 * continua abrindo — uma definição corrompida não pode travar a geração.
 */
export function parseFieldSettings(raw: unknown): TemplateFieldSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const settings: TemplateFieldSettings = {}
  for (const [name, value] of Object.entries(raw)) {
    const parsed = templateFieldSettingSchema.safeParse(value)
    if (parsed.success) settings[name] = parsed.data
  }
  return settings
}
