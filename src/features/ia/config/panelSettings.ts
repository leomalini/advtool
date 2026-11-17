// Só no servidor: escreve com a service_role e lida com a chave em claro.
// Quem chama (as rotas de /api/configuracoes/ia) confere a permissão ANTES.
import { z } from 'zod'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import type {
  AiProviderKeySummary,
  AiSettingsMutationResult,
  AiSettingsSummary,
  ProviderTestResult,
} from '@/types/aiSettings.types'
import { aiKeyVault } from './keyVault'
import { AI_PROVIDERS, AI_PROVIDER_LABELS, isCuratedModel, type AssistantProvider } from './models'
import { testProviderKey } from './providerTest'
import { API_KEY_ENV, getAiRuntimeConfig, invalidateAiRuntimeConfig } from './runtimeConfig'

/** Quantos caracteres do fim da chave a tela mostra. */
const HINT_LENGTH = 4

const keyRowSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  key_hint: z.string(),
  workspace_id: z.string().nullable(),
  last_test_at: z.string().nullable(),
  last_test_ok: z.boolean().nullable(),
  last_test_error: z.string().nullable(),
})

const MODEL_COLUMN: Record<AssistantProvider, 'anthropic_model' | 'google_model'> = {
  anthropic: 'anthropic_model',
  google: 'google_model',
}

/** Falha ao gravar no banco — a rota responde 503 com a mensagem. */
export class AiSettingsStorageError extends Error {}

function hintOf(apiKey: string): string {
  return apiKey.slice(-HINT_LENGTH)
}

async function log(
  changedBy: string,
  kind: 'provider' | 'model' | 'key_set' | 'key_removed' | 'test',
  details: Record<string, unknown>,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('ai_settings_log')
    .insert({ changed_by: changedBy, kind, details })
  // O histórico não desfaz a alteração que já valeu: registra a falha e segue.
  if (error) console.error('[ia-config] histórico não gravado:', error.code, error.message)
}

/**
 * O que a aba mostra. Lê a configuração em vigor SEM cache — a tela precisa
 * ver o que acabou de salvar — e as colunas de exibição das chaves do painel.
 */
export async function loadAiSettingsSummary(): Promise<AiSettingsSummary> {
  invalidateAiRuntimeConfig()
  const config = await getAiRuntimeConfig()
  const editable = config.panel !== 'unavailable'

  let rows: z.infer<typeof keyRowSchema>[] = []
  if (editable) {
    const { data, error } = await createAdminClient()
      .from('ai_provider_keys')
      .select('provider, key_hint, workspace_id, last_test_at, last_test_ok, last_test_error')
    const parsed = z.array(keyRowSchema).safeParse(data ?? [])
    if (error || !parsed.success) {
      console.error('[ia-config] chaves para a tela:', error?.code, error?.message)
    } else {
      rows = parsed.data
    }
  }

  const keys = AI_PROVIDERS.map((provider): AiProviderKeySummary => {
    const credentials = config.credentials[provider]
    const row = rows.find((candidate) => candidate.provider === provider)
    const panelInUse = credentials?.source === 'panel'
    return {
      provider,
      source: credentials?.source ?? null,
      hint: credentials ? hintOf(credentials.apiKey) : null,
      workspaceId: credentials?.workspaceId ?? null,
      unreadable: config.unreadableKeys.includes(provider),
      lastTest:
        panelInUse && row?.last_test_at && row.last_test_ok !== null
          ? { at: row.last_test_at, ok: row.last_test_ok, error: row.last_test_error }
          : null,
    }
  })

  return {
    editable,
    activeProvider: config.activeProvider,
    providerSource: config.providerSource,
    models: config.models,
    keys,
  }
}

/** Gravar só com o painel legível. Relê sem cache: a decisão usa o estado atual. */
async function requireEditable(): Promise<AiSettingsMutationResult | null> {
  invalidateAiRuntimeConfig()
  if (!hasServiceRoleKey()) {
    const message = 'O servidor está sem SUPABASE_SERVICE_ROLE_KEY.'
    return { ok: false, code: 'blocked', message }
  }
  const config = await getAiRuntimeConfig()
  if (config.panel === 'unavailable') {
    return {
      ok: false,
      code: 'blocked',
      message: 'O painel ainda não está disponível neste ambiente (migration 94 não aplicada).',
    }
  }
  return null
}

async function done(): Promise<AiSettingsMutationResult> {
  return { ok: true, summary: await loadAiSettingsSummary() }
}

/**
 * Testa a chave EM USO de um provedor (do painel ou do ambiente) com o modelo
 * escolhido para ele. Guarda o resultado quando a chave é do painel.
 */
export async function testCurrentKey(
  provider: AssistantProvider,
  userId: string,
): Promise<{ result: ProviderTestResult; summary: AiSettingsSummary }> {
  invalidateAiRuntimeConfig()
  const config = await getAiRuntimeConfig()
  const credentials = config.credentials[provider]
  if (!credentials) {
    return {
      result: { ok: false, code: 'no_key', message: 'Nenhuma chave configurada neste provedor.' },
      summary: await loadAiSettingsSummary(),
    }
  }

  const result = await testProviderKey({
    provider,
    apiKey: credentials.apiKey,
    workspaceId: credentials.workspaceId,
    modelId: config.models[provider],
  })

  if (config.panel !== 'unavailable') {
    if (credentials.source === 'panel') {
      const { error } = await createAdminClient()
        .from('ai_provider_keys')
        .update({
          last_test_at: new Date().toISOString(),
          last_test_ok: result.ok,
          last_test_error: result.ok ? null : result.message,
        })
        .eq('provider', provider)
      if (error) console.error('[ia-config] teste não gravado:', error.code, error.message)
    }
    await log(userId, 'test', {
      provider,
      source: credentials.source,
      model: config.models[provider],
      ok: result.ok,
      ...(result.ok ? {} : { code: result.code }),
    })
  }

  return { result, summary: await loadAiSettingsSummary() }
}

/**
 * Grava a chave de um provedor — só se ela passar no teste (D6). Chave
 * recusada não substitui a que está funcionando.
 */
export async function saveProviderKey(input: {
  provider: AssistantProvider
  apiKey: string
  workspaceId: string | null
  userId: string
}): Promise<AiSettingsMutationResult> {
  const blocked = await requireEditable()
  if (blocked) return blocked

  const config = await getAiRuntimeConfig()
  const workspaceId = input.provider === 'anthropic' ? input.workspaceId : null
  const test = await testProviderKey({
    provider: input.provider,
    apiKey: input.apiKey,
    workspaceId,
    modelId: config.models[input.provider],
  })
  if (!test.ok) return test

  const admin = createAdminClient()
  const replaced = config.credentials[input.provider]?.source === 'panel'
  const { error } = await admin.from('ai_provider_keys').upsert(
    {
      provider: input.provider,
      key_sealed: await aiKeyVault.seal(input.apiKey),
      key_hint: hintOf(input.apiKey),
      workspace_id: workspaceId,
      last_test_at: new Date().toISOString(),
      last_test_ok: true,
      last_test_error: null,
      updated_by: input.userId,
    },
    { onConflict: 'provider' },
  )
  if (error) throw new AiSettingsStorageError(`${error.code}: ${error.message}`)

  await log(input.userId, 'key_set', {
    provider: input.provider,
    hint: hintOf(input.apiKey),
    workspace: workspaceId !== null,
    replaced,
  })
  invalidateAiRuntimeConfig()
  return done()
}

/**
 * Apaga a chave do painel. Recusa quando o provedor está ativo e não há chave
 * do ambiente para assumir — o Assistente pararia na hora.
 */
export async function removeProviderKey(
  provider: AssistantProvider,
  userId: string,
): Promise<AiSettingsMutationResult> {
  const blocked = await requireEditable()
  if (blocked) return blocked

  const config = await getAiRuntimeConfig()
  const envFallback = Boolean(process.env[API_KEY_ENV[provider]]?.trim())
  if (config.activeProvider === provider && !envFallback) {
    return {
      ok: false,
      code: 'blocked',
      message:
        `${AI_PROVIDER_LABELS[provider]} é o provedor ativo e não há chave no ambiente ` +
        'para assumir. Troque o provedor antes.',
    }
  }

  const { error } = await createAdminClient()
    .from('ai_provider_keys')
    .delete()
    .eq('provider', provider)
  if (error) throw new AiSettingsStorageError(`${error.code}: ${error.message}`)

  await log(userId, 'key_removed', { provider, envFallback })
  invalidateAiRuntimeConfig()
  return done()
}

/**
 * Troca o provedor ativo e/ou o modelo dele. Testa a chave em uso com o
 * modelo novo antes: provedor sem chave, ou modelo não liberado, não entra.
 */
export async function saveProviderAndModel(input: {
  provider: AssistantProvider
  modelId: string
  userId: string
}): Promise<AiSettingsMutationResult> {
  const blocked = await requireEditable()
  if (blocked) return blocked
  if (!isCuratedModel(input.provider, input.modelId)) {
    return { ok: false, code: 'blocked', message: 'Modelo fora da lista do AdvTool.' }
  }

  const config = await getAiRuntimeConfig()
  const credentials = config.credentials[input.provider]
  if (!credentials) {
    return {
      ok: false,
      code: 'no_key',
      message: `Cadastre uma chave de ${AI_PROVIDER_LABELS[input.provider]} antes de ativá-lo.`,
    }
  }
  const test = await testProviderKey({
    provider: input.provider,
    apiKey: credentials.apiKey,
    workspaceId: credentials.workspaceId,
    modelId: input.modelId,
  })
  if (!test.ok) return test

  const { error } = await createAdminClient()
    .from('ai_settings')
    .upsert(
      {
        id: true,
        active_provider: input.provider,
        [MODEL_COLUMN[input.provider]]: input.modelId,
        updated_by: input.userId,
      },
      { onConflict: 'id' },
    )
  if (error) throw new AiSettingsStorageError(`${error.code}: ${error.message}`)

  if (config.activeProvider !== input.provider) {
    await log(input.userId, 'provider', { from: config.activeProvider, to: input.provider })
  }
  if (config.models[input.provider] !== input.modelId) {
    await log(input.userId, 'model', {
      provider: input.provider,
      from: config.models[input.provider],
      to: input.modelId,
    })
  }
  invalidateAiRuntimeConfig()
  return done()
}
