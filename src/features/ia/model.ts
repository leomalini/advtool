import { createAnthropic, type AnthropicLanguageModelOptions } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import type { LanguageModel, streamText } from 'ai'
import { withUsageRecording, type UsageScope } from './usage/recordUsage'

type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]['providerOptions']>
type AnthropicEffort = NonNullable<AnthropicLanguageModelOptions['effort']>

export type AssistantProvider = 'google' | 'anthropic'

/**
 * Cada lugar que chama a IA e o que ele usa no Claude — o painel de custo do
 * plano (`docs/assistente-claude.md`, D2 e "Efeito do esforço"). Mudar modelo
 * ou esforço de uma rota é mudar aqui; o consumo de cada uma aparece em
 * `ai_usage`, separado por `route`.
 *
 * Esforço: no Opus 5.5 o raciocínio não desliga, e o esforço é o controle de
 * quanto ele pensa — o item mais caro, porque é cobrado como saída.
 * - `medium` (o padrão do modelo) no chat, na leitura, na redação e no resumo
 *   do processo. Segundo a Anthropic, o Opus 5.5 em `medium` supera o Opus 5
 *   em `high`; subir só com medida que mostre ganho. O resumo foi validado lado
 *   a lado nesta configuração (R$ 0,18 a 0,44 por processo).
 * - `low` no portal: resposta curta, sobre um recorte pequeno.
 * - `low` na triagem de publicações e no briefing diário (fase 5): leitura de
 *   um texto curto, sem conversa.
 *
 * Rota nova precisa entrar também no `check` de `ai_usage.route` (migrations
 * 81, 82 e 85).
 */
export const AI_ROUTE_SETTINGS = {
  chat: { anthropicModel: 'claude-opus-5-5', effort: 'medium' },
  portal: { anthropicModel: 'claude-opus-5-5', effort: 'low' },
  contract_reader: { anthropicModel: 'claude-opus-5-5', effort: 'medium' },
  drafting: { anthropicModel: 'claude-opus-5-5', effort: 'medium' },
  process_summary: { anthropicModel: 'claude-opus-5-5', effort: 'medium' },
  triage: { anthropicModel: 'claude-opus-5-5', effort: 'low' },
  briefing: { anthropicModel: 'claude-opus-5-5', effort: 'low' },
} as const satisfies Record<string, { anthropicModel: string; effort: AnthropicEffort }>

export type AiRoute = keyof typeof AI_ROUTE_SETTINGS

export type AssistantModelResult =
  | { ok: true; provider: AssistantProvider; model: LanguageModel; providerOptions: ProviderOptions }
  | { ok: false; reason: string }

/**
 * O provedor da Anthropic, para as chamadas na hora e para o lote (fase 5).
 *
 * Chave pessoal ou de service account criada para VÁRIOS workspaces não diz à
 * API onde o pedido roda: sem o cabeçalho, todo pedido volta 400. Chave criada
 * dentro de um workspace dispensa — daí a variável ser opcional.
 */
export function createAnthropicProvider() {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim()
  return createAnthropic(workspaceId ? { headers: { 'anthropic-workspace-id': workspaceId } } : {})
}

/** A chave que cada provedor lê do ambiente. */
const API_KEY_ENV: Record<AssistantProvider, string> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
}

function selectedProvider(): AssistantProvider | null {
  const value = (process.env.AI_ASSISTANT_PROVIDER ?? 'anthropic').trim().toLowerCase()
  return value === 'google' || value === 'anthropic' ? value : null
}

/**
 * O modelo de uma rota, conforme `AI_ASSISTANT_PROVIDER` (padrão: `anthropic`).
 *
 * O Claude é o provedor desde a fase 1 do plano. O Gemini continua atrás da
 * variável (`AI_ASSISTANT_PROVIDER=google`) até a fase 1 ser validada com
 * perguntas reais, e sai depois (D1).
 *
 * Toda chamada feita com o modelo devolvido é gravada em `ai_usage` com a rota
 * e o `scope` (quem pediu). Montado a cada pedido: trocar o `.env` vale sem
 * reiniciar o servidor.
 */
export function createAssistantModel(
  route: AiRoute,
  scope: UsageScope = {},
): AssistantModelResult {
  const provider = selectedProvider()
  if (!provider) {
    return { ok: false, reason: 'AI_ASSISTANT_PROVIDER inválido (use anthropic ou google).' }
  }
  if (!process.env[API_KEY_ENV[provider]]) {
    return { ok: false, reason: `falta ${API_KEY_ENV[provider]}.` }
  }

  if (provider === 'google') {
    return {
      ok: true,
      provider,
      // Sem `thinkingConfig`: o modelo decide quanto raciocinar.
      model: withUsageRecording(createGoogle()('gemini-3.8-flash'), { route, provider, scope }),
      providerOptions: {},
    }
  }

  const anthropic = createAnthropicProvider()
  const settings = AI_ROUTE_SETTINGS[route]

  return {
    ok: true,
    provider,
    model: withUsageRecording(anthropic(settings.anthropicModel), { route, provider, scope }),
    providerOptions: {
      anthropic: {
        thinking: {
          type: 'adaptive',
          // No Opus 5.5 o raciocínio de um turno fica preso ao começo exato da
          // conversa. O chat muda esse começo de propósito — reenvia anexos
          // antigos só como referência, tira turnos que falharam, e a data do
          // `system` vira à meia-noite. Em conta criada a partir de 31/08/2026
          // isso seria 400 no turno seguinte; com `drop_block`, a API descarta
          // o raciocínio antigo e responde. Texto e consultas ficam.
          blockBinding: { prefixMismatchBehavior: 'drop_block' },
        },
        effort: settings.effort,
        // Se os filtros do modelo recusarem o pedido, a própria API refaz a
        // chamada num modelo de fallback, em vez de o turno morrer vazio.
        fallbacks: 'default',
      } satisfies AnthropicLanguageModelOptions,
    },
  }
}
