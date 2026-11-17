/**
 * Provedores e modelos que o painel de Configurações oferece — a lista curada
 * da decisão D8 (`docs/ia-configuracoes.md`).
 *
 * Sem dependência de servidor: a tela também lê daqui. Modelo novo só entra
 * com preço em `../usage/pricing.ts` (senão o custo e o teto ficam cegos) e
 * depois de conferido que as opções de `../model.ts` (raciocínio adaptativo,
 * esforço, `drop_block`, fallback) valem para ele.
 */

export const AI_PROVIDERS = ['anthropic', 'google'] as const

export type AssistantProvider = (typeof AI_PROVIDERS)[number]

export interface AiModelOption {
  id: string
  label: string
  description: string
}

export const AI_PROVIDER_LABELS: Record<AssistantProvider, string> = {
  anthropic: 'Claude (Anthropic)',
  google: 'Gemini (Google)',
}

export const AI_MODEL_OPTIONS = {
  anthropic: [
    {
      id: 'claude-opus-5-5',
      label: 'Claude Opus 5.5',
      description: 'O modelo validado em todas as funções do AdvTool. US$ 4 / 20 por milhão de tokens.',
    },
    {
      id: 'claude-sonnet-5-5',
      label: 'Claude Sonnet 5.5',
      description: 'Metade do preço do Opus (US$ 2 / 10). Ainda não validado nas funções do AdvTool.',
    },
  ],
  // Sem preço em `pricing.ts`: o consumo do Gemini aparece sem custo estimado.
  google: [
    {
      id: 'gemini-3.8-flash',
      label: 'Gemini 3.8 Flash',
      description: 'Sem custo estimado no AdvTool. Não roda a triagem nem o resumo automático.',
    },
  ],
} as const satisfies Record<AssistantProvider, readonly AiModelOption[]>

export const DEFAULT_MODELS: Record<AssistantProvider, string> = {
  anthropic: 'claude-opus-5-5',
  google: 'gemini-3.8-flash',
}

export function isCuratedModel(provider: AssistantProvider, modelId: string): boolean {
  return AI_MODEL_OPTIONS[provider].some((option) => option.id === modelId)
}

export function isAssistantProvider(value: string): value is AssistantProvider {
  return (AI_PROVIDERS as readonly string[]).includes(value)
}
