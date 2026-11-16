// Só no servidor: recebe a chave em claro.
import { z } from 'zod'
import type { ProviderTestCode, ProviderTestResult } from '@/types/aiSettings.types'
import type { AssistantProvider } from './models'

/**
 * Teste de conexão SEM gastar tokens (D5 de `docs/ia-configuracoes.md`):
 * consulta o modelo escolhido na API de modelos do provedor. Isso confere a
 * chave, o workspace (Anthropic) e se o modelo está liberado na conta.
 *
 * Não detecta saldo zerado: consultar o modelo não cobra nada, então o 402 do
 * Gemini pré-pago só aparece na primeira chamada de verdade. A tela avisa.
 *
 * `fetch` direto, e não o SDK: o projeto fala com os modelos pelo AI SDK, que
 * não expõe a API de modelos, e uma consulta GET não justifica outra
 * dependência. Mesmo motivo das integrações D4Sign e InfinitePay.
 */

const TIMEOUT_MS = 10_000

const MESSAGES: Record<Exclude<ProviderTestCode, 'no_key'>, string> = {
  invalid_key: 'A chave foi recusada. Confira se foi copiada inteira e se não foi revogada.',
  forbidden: 'A chave não tem permissão para usar a API.',
  model_unavailable: 'O modelo escolhido não está liberado para esta chave.',
  workspace_required:
    'Esta chave vale para vários workspaces: informe o ID do workspace (wrkspc_…).',
  rate_limited: 'O provedor limitou as consultas agora. Tente de novo em alguns minutos.',
  provider_unavailable: 'Não foi possível falar com o provedor agora. Tente de novo.',
  unexpected: 'O provedor respondeu de um jeito inesperado.',
}

function failure(code: Exclude<ProviderTestCode, 'no_key'>, detail?: string): ProviderTestResult {
  return { ok: false, code, message: detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code] }
}

const anthropicErrorSchema = z.object({
  error: z.object({ type: z.string(), message: z.string() }),
})

const googleErrorSchema = z.object({
  error: z.object({
    code: z.number().optional(),
    message: z.string().optional(),
    status: z.string().optional(),
    details: z.array(z.object({ reason: z.string().optional() }).passthrough()).optional(),
  }),
})

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null)
}

async function testAnthropic(apiKey: string, workspaceId: string | null, modelId: string) {
  const headers: Record<string, string> = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  }
  if (workspaceId) headers['anthropic-workspace-id'] = workspaceId

  const response = await fetch(
    `https://api.anthropic.com/v1/models/${encodeURIComponent(modelId)}`,
    { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' },
  )
  if (response.ok) return { ok: true } as const

  const parsed = anthropicErrorSchema.safeParse(await readJson(response))
  const message = parsed.success ? parsed.data.error.message : ''
  const errorType = parsed.success ? parsed.data.error.type : ''
  console.warn('[ia-config] teste Anthropic:', response.status, errorType)

  if (response.status === 401) return failure('invalid_key')
  if (response.status === 403) return failure('forbidden')
  if (response.status === 404) return failure('model_unavailable', modelId)
  if (response.status === 429) return failure('rate_limited')
  if (response.status === 400 && /workspace/i.test(message)) return failure('workspace_required')
  if (response.status >= 500) return failure('provider_unavailable')
  return failure('unexpected', `HTTP ${response.status}`)
}

async function testGoogle(apiKey: string, modelId: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}`,
    {
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    },
  )
  if (response.ok) return { ok: true } as const

  const parsed = googleErrorSchema.safeParse(await readJson(response))
  const details = parsed.success ? (parsed.data.error.details ?? []) : []
  const reasons = details.flatMap((detail) => (detail.reason ? [detail.reason] : []))
  const status = parsed.success ? parsed.data.error.status : undefined
  console.warn('[ia-config] teste Gemini:', response.status, status ?? '', reasons.join(','))

  if (reasons.includes('API_KEY_INVALID') || response.status === 401) return failure('invalid_key')
  if (response.status === 403) return failure('forbidden')
  if (response.status === 404) return failure('model_unavailable', modelId)
  if (response.status === 429) return failure('rate_limited')
  if (response.status >= 500) return failure('provider_unavailable')
  return failure('unexpected', `HTTP ${response.status}`)
}

/** Nunca lança: falha de rede vira `provider_unavailable`. A chave não vai ao log. */
export async function testProviderKey(input: {
  provider: AssistantProvider
  apiKey: string
  workspaceId: string | null
  modelId: string
}): Promise<ProviderTestResult> {
  try {
    return input.provider === 'anthropic'
      ? await testAnthropic(input.apiKey, input.workspaceId, input.modelId)
      : await testGoogle(input.apiKey, input.modelId)
  } catch (error) {
    const reason = error instanceof Error ? error.name : ''
    console.warn('[ia-config] teste sem resposta:', input.provider, reason)
    return failure('provider_unavailable')
  }
}
