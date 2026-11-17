import type {
  AiSettingsMutationResult,
  AiSettingsSummary,
  AssistantProvider,
  ProviderTestResult,
} from '@/types/aiSettings.types'

const BASE = '/api/configuracoes/ia'

/** Tudo passa pelas rotas: as chaves só existem no servidor. */
async function call<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  })
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (!response.ok || !body) throw new Error(body?.error ?? fallback)
  return body
}

export function getAiSettings(): Promise<AiSettingsSummary> {
  return call('', { method: 'GET' }, 'Não foi possível ler as configurações da IA.')
}

export function testAiKey(
  provider: AssistantProvider,
): Promise<{ result: ProviderTestResult; summary: AiSettingsSummary }> {
  return call(
    '/testar',
    { method: 'POST', body: JSON.stringify({ provider }) },
    'Não foi possível testar a conexão agora.',
  )
}

export function saveAiKey(input: {
  provider: AssistantProvider
  apiKey: string
  workspaceId: string
}): Promise<AiSettingsMutationResult> {
  return call(
    '/chave',
    { method: 'PUT', body: JSON.stringify(input) },
    'Não foi possível salvar a chave agora.',
  )
}

export function removeAiKey(provider: AssistantProvider): Promise<AiSettingsMutationResult> {
  return call(
    '/chave',
    { method: 'DELETE', body: JSON.stringify({ provider }) },
    'Não foi possível remover a chave agora.',
  )
}

export function saveAiProvider(input: {
  provider: AssistantProvider
  model: string
}): Promise<AiSettingsMutationResult> {
  return call(
    '/provedor',
    { method: 'PUT', body: JSON.stringify(input) },
    'Não foi possível trocar o provedor agora.',
  )
}
