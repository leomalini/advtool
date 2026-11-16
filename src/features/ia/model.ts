import { createAnthropic, type AnthropicLanguageModelOptions } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import type { LanguageModel, streamText } from 'ai'
import type { AssistantProvider } from './config/models'
import {
  API_KEY_ENV,
  getAiRuntimeConfig,
  type AiRuntimeConfig,
  type ProviderCredentials,
} from './config/runtimeConfig'
import { withUsageRecording, type UsageScope } from './usage/recordUsage'

type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]['providerOptions']>
type AnthropicEffort = NonNullable<AnthropicLanguageModelOptions['effort']>

export type { AssistantProvider }

/**
 * Cada lugar que chama a IA e o esforço que ele usa no Claude — o painel de
 * custo do plano (`docs/assistente-claude.md`, D2 e "Efeito do esforço"). O
 * MODELO é um só para todas as rotas e vem das Configurações
 * (`docs/ia-configuracoes.md`, D3); o esforço continua aqui, por rota. O
 * consumo de cada uma aparece em `ai_usage`, separado por `route`.
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
  chat: { effort: 'medium' },
  portal: { effort: 'low' },
  contract_reader: { effort: 'medium' },
  drafting: { effort: 'medium' },
  process_summary: { effort: 'medium' },
  triage: { effort: 'low' },
  briefing: { effort: 'low' },
} as const satisfies Record<string, { effort: AnthropicEffort }>

export type AiRoute = keyof typeof AI_ROUTE_SETTINGS

export type AssistantModelResult =
  | { ok: true; provider: AssistantProvider; model: LanguageModel; providerOptions: ProviderOptions }
  | { ok: false; reason: string }

/**
 * O provedor da Anthropic com as credenciais em vigor, para as chamadas na
 * hora e para o lote (fase 5).
 *
 * Chave pessoal ou de service account criada para VÁRIOS workspaces não diz à
 * API onde o pedido roda: sem o cabeçalho, todo pedido volta 400. Chave criada
 * dentro de um workspace dispensa — daí o workspace ser opcional.
 */
export function createAnthropicProvider(credentials: ProviderCredentials) {
  return createAnthropic({
    apiKey: credentials.apiKey,
    ...(credentials.workspaceId
      ? { headers: { 'anthropic-workspace-id': credentials.workspaceId } }
      : {}),
  })
}

/**
 * O que o lote precisa: a chave do Claude e o modelo do Claude, qualquer que
 * seja o provedor ativo — com o Gemini no chat, triagem e resumo automático
 * continuam no Claude (`docs/ia-configuracoes.md`, D7). `null` sem chave.
 */
export function anthropicBatchSetup(
  config: AiRuntimeConfig,
): { credentials: ProviderCredentials; modelId: string } | null {
  const credentials = config.credentials.anthropic
  return credentials ? { credentials, modelId: config.models.anthropic } : null
}

/**
 * O modelo de uma rota, conforme a configuração em vigor: o painel de
 * Configurações e, no que ele não define, o ambiente (`AI_ASSISTANT_PROVIDER`,
 * padrão `anthropic`; chaves em `ANTHROPIC_API_KEY` /
 * `GOOGLE_GENERATIVE_AI_API_KEY`). Ver `config/runtimeConfig.ts`.
 *
 * Toda chamada feita com o modelo devolvido é gravada em `ai_usage` com a rota
 * e o `scope` (quem pediu). A configuração é relida a cada 30 s: trocar o
 * painel ou o `.env` vale sem reiniciar o servidor.
 */
export async function createAssistantModel(
  route: AiRoute,
  scope: UsageScope = {},
): Promise<AssistantModelResult> {
  const config = await getAiRuntimeConfig()
  const provider = config.activeProvider
  if (!provider) {
    return { ok: false, reason: 'AI_ASSISTANT_PROVIDER inválido (use anthropic ou google).' }
  }
  const credentials = config.credentials[provider]
  if (!credentials) {
    const where = `Configurações › Assistente IA ou ${API_KEY_ENV[provider]}`
    return { ok: false, reason: `sem chave do provedor ${provider} (${where}).` }
  }

  if (provider === 'google') {
    return {
      ok: true,
      provider,
      // Sem `thinkingConfig`: o modelo decide quanto raciocinar.
      model: withUsageRecording(
        createGoogle({ apiKey: credentials.apiKey })(config.models.google),
        { route, provider, scope },
      ),
      providerOptions: {},
    }
  }

  const anthropic = createAnthropicProvider(credentials)
  const settings = AI_ROUTE_SETTINGS[route]

  return {
    ok: true,
    provider,
    model: withUsageRecording(anthropic(config.models.anthropic), { route, provider, scope }),
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
