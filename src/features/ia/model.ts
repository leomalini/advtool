import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import type { LanguageModel, streamText } from 'ai'

type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]['providerOptions']>

export type AssistantProvider = 'google' | 'anthropic'

export type AssistantModelResult =
  | { ok: true; provider: AssistantProvider; model: LanguageModel; providerOptions: ProviderOptions }
  | { ok: false; reason: string }

/** A chave que cada provedor lê do ambiente. */
const API_KEY_ENV: Record<AssistantProvider, string> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
}

function selectedProvider(): AssistantProvider | null {
  const value = (process.env.AI_ASSISTANT_PROVIDER ?? 'google').trim().toLowerCase()
  return value === 'google' || value === 'anthropic' ? value : null
}

/**
 * O modelo do Assistente, conforme `AI_ASSISTANT_PROVIDER` (padrão: `google`).
 *
 * Gemini é o padrão porque a API tem plano gratuito. O Claude continua
 * disponível — era o provedor original, e a rota já foi validada com ele até a
 * cobrança — trocando só a variável.
 *
 * Montado a cada pedido: trocar o `.env` vale sem reiniciar o servidor.
 */
export function createAssistantModel(): AssistantModelResult {
  const provider = selectedProvider()
  if (!provider) {
    return { ok: false, reason: 'AI_ASSISTANT_PROVIDER inválido (use google ou anthropic).' }
  }
  if (!process.env[API_KEY_ENV[provider]]) {
    return { ok: false, reason: `falta ${API_KEY_ENV[provider]}.` }
  }

  if (provider === 'google') {
    return {
      ok: true,
      provider,
      // Flash estável mais recente com plano gratuito (ai.google.dev, 2026-09).
      // Sem `thinkingConfig`: o modelo decide quanto raciocinar.
      model: createGoogle()('gemini-3.8-flash'),
      providerOptions: {},
    }
  }

  // Chave pessoal ou de service account criada para VÁRIOS workspaces não diz
  // à API onde o pedido roda: sem o cabeçalho, todo pedido volta 400. Chave
  // criada dentro de um workspace dispensa — daí a variável ser opcional.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim()
  const anthropic = createAnthropic(
    workspaceId ? { headers: { 'anthropic-workspace-id': workspaceId } } : {},
  )

  return {
    ok: true,
    provider,
    model: anthropic('claude-opus-5'),
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive' },
        effort: 'medium',
        // Se o modelo recusar o pedido por política, a própria API refaz a
        // chamada num modelo de fallback, em vez de o turno morrer vazio.
        fallbacks: 'default',
      },
    },
  }
}
