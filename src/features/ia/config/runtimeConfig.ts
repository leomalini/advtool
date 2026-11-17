// Só no servidor: lê a service_role e decifra as chaves de API.
import { z } from 'zod'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { aiKeyVault } from './keyVault'
import {
  AI_PROVIDERS,
  DEFAULT_MODELS,
  isAssistantProvider,
  isCuratedModel,
  type AssistantProvider,
} from './models'

/** De onde veio um valor: do painel de Configurações ou do ambiente. */
export type ConfigSource = 'panel' | 'env'

export interface ProviderCredentials {
  apiKey: string
  /** Cabeçalho `anthropic-workspace-id`; só Anthropic. Anda com a chave. */
  workspaceId: string | null
  source: ConfigSource
}

export type MonthlyBudget =
  | { kind: 'none'; source: ConfigSource }
  | { kind: 'limit'; usd: number; source: ConfigSource }
  /** `AI_MONTHLY_BUDGET_USD` com valor que não é número: falha fechada. */
  | { kind: 'invalid'; raw: string }

export interface AiFeatureToggles {
  assistant: boolean
  portal: boolean
  autoSummary: boolean
  triage: boolean
  briefing: boolean
}

/**
 * - `loaded`: o painel tem configuração (linha ou chave).
 * - `empty`: as tabelas existem e estão vazias — tudo do ambiente.
 * - `unavailable`: não deu para ler (sem service_role, migration 94 ausente,
 *   erro do banco) — tudo do ambiente, motivo no log `[ia-config]`.
 */
export type PanelStatus = 'loaded' | 'empty' | 'unavailable'

export interface AiRuntimeConfig {
  /** `null` só quando nada no painel e `AI_ASSISTANT_PROVIDER` inválida. */
  activeProvider: AssistantProvider | null
  providerSource: ConfigSource
  /** O modelo de cada provedor — o do ativo atende as rotas; o do Claude
   * também atende o lote, qualquer que seja o ativo (D7). */
  models: Record<AssistantProvider, string>
  credentials: Record<AssistantProvider, ProviderCredentials | null>
  /** Chaves guardadas no painel que não abriram (segredo do servidor trocado
   * ou coluna adulterada). Nesses provedores vale a chave do ambiente, se houver. */
  unreadableKeys: AssistantProvider[]
  monthlyBudget: MonthlyBudget
  features: AiFeatureToggles
  panel: PanelStatus
}

/** A chave que cada provedor lê do ambiente. */
export const API_KEY_ENV: Record<AssistantProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
}

const ALL_FEATURES_ON: AiFeatureToggles = {
  assistant: true,
  portal: true,
  autoSummary: true,
  triage: true,
  briefing: true,
}

const settingsRowSchema = z.object({
  active_provider: z.enum(AI_PROVIDERS).nullable(),
  anthropic_model: z.string().nullable(),
  google_model: z.string().nullable(),
  budget_source: z.enum(['env', 'panel']),
  monthly_budget_usd: z.coerce.number().positive().nullable(),
  assistant_enabled: z.boolean(),
  portal_enabled: z.boolean(),
  auto_summary_enabled: z.boolean(),
  triage_enabled: z.boolean(),
  briefing_enabled: z.boolean(),
})
type SettingsRow = z.infer<typeof settingsRowSchema>

const keyRowSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  key_sealed: z.string(),
  workspace_id: z.string().nullable(),
})
type KeyRow = z.infer<typeof keyRowSchema>

const SETTINGS_COLUMNS =
  'active_provider, anthropic_model, google_model, budget_source, monthly_budget_usd, ' +
  'assistant_enabled, portal_enabled, auto_summary_enabled, triage_enabled, briefing_enabled'

const budgetSchema = z.coerce.number().positive()

function envValue(name: string): string | null {
  return process.env[name]?.trim() || null
}

function envProvider(): AssistantProvider | null {
  const value = (process.env.AI_ASSISTANT_PROVIDER ?? 'anthropic').trim().toLowerCase()
  return isAssistantProvider(value) ? value : null
}

function envCredentials(provider: AssistantProvider): ProviderCredentials | null {
  const apiKey = envValue(API_KEY_ENV[provider])
  if (!apiKey) return null
  return {
    apiKey,
    workspaceId: provider === 'anthropic' ? envValue('ANTHROPIC_WORKSPACE_ID') : null,
    source: 'env',
  }
}

function envBudget(): MonthlyBudget {
  const raw = envValue('AI_MONTHLY_BUDGET_USD')
  if (!raw) return { kind: 'none', source: 'env' }
  const parsed = budgetSchema.safeParse(raw)
  return parsed.success ? { kind: 'limit', usd: parsed.data, source: 'env' } : { kind: 'invalid', raw }
}

type PanelRead =
  | { status: 'unavailable' }
  | { status: 'loaded' | 'empty'; settings: SettingsRow | null; keys: KeyRow[] }

async function readPanel(): Promise<PanelRead> {
  if (!hasServiceRoleKey()) return { status: 'unavailable' }

  try {
    const admin = createAdminClient()
    const [settings, keys] = await Promise.all([
      admin.from('ai_settings').select(SETTINGS_COLUMNS).maybeSingle(),
      admin.from('ai_provider_keys').select('provider, key_sealed, workspace_id'),
    ])
    const error = settings.error ?? keys.error
    if (error) {
      console.warn('[ia-config] painel ilegível, valendo o ambiente:', error.code, error.message)
      return { status: 'unavailable' }
    }

    const settingsRow = settings.data ? settingsRowSchema.safeParse(settings.data) : null
    const keyRows = z.array(keyRowSchema).safeParse(keys.data ?? [])
    if ((settingsRow && !settingsRow.success) || !keyRows.success) {
      console.error('[ia-config] linha do painel fora do formato, valendo o ambiente.')
      return { status: 'unavailable' }
    }

    const row = settingsRow?.data ?? null
    return {
      status: row || keyRows.data.length > 0 ? 'loaded' : 'empty',
      settings: row,
      keys: keyRows.data,
    }
  } catch (error) {
    console.error('[ia-config] leitura do painel falhou, valendo o ambiente:', error)
    return { status: 'unavailable' }
  }
}

function panelModel(provider: AssistantProvider, modelId: string | null): string {
  if (!modelId) return DEFAULT_MODELS[provider]
  if (isCuratedModel(provider, modelId)) return modelId
  console.error(`[ia-config] modelo fora da lista curada (${provider}): ${modelId}; usando o padrão.`)
  return DEFAULT_MODELS[provider]
}

async function loadAiRuntimeConfig(): Promise<AiRuntimeConfig> {
  const panel = await readPanel()
  const settings = panel.status === 'unavailable' ? null : panel.settings
  const keys = panel.status === 'unavailable' ? [] : panel.keys

  const credentials = {} as Record<AssistantProvider, ProviderCredentials | null>
  const unreadableKeys: AssistantProvider[] = []
  for (const provider of AI_PROVIDERS) {
    const row = keys.find((key) => key.provider === provider)
    const apiKey = row ? await aiKeyVault.open(row.key_sealed) : null
    if (row && apiKey) {
      credentials[provider] = {
        apiKey,
        workspaceId: provider === 'anthropic' ? row.workspace_id?.trim() || null : null,
        source: 'panel',
      }
      continue
    }
    if (row) {
      unreadableKeys.push(provider)
      console.error(`[ia-config] chave do painel ilegível (${provider}); valendo a do ambiente, se houver.`)
    }
    credentials[provider] = envCredentials(provider)
  }

  let monthlyBudget: MonthlyBudget = envBudget()
  if (settings?.budget_source === 'panel') {
    monthlyBudget =
      settings.monthly_budget_usd === null
        ? { kind: 'none', source: 'panel' }
        : { kind: 'limit', usd: settings.monthly_budget_usd, source: 'panel' }
  }

  return {
    activeProvider: settings?.active_provider ?? envProvider(),
    providerSource: settings?.active_provider ? 'panel' : 'env',
    models: {
      anthropic: panelModel('anthropic', settings?.anthropic_model ?? null),
      google: panelModel('google', settings?.google_model ?? null),
    },
    credentials,
    unreadableKeys,
    monthlyBudget,
    features: settings
      ? {
          assistant: settings.assistant_enabled,
          portal: settings.portal_enabled,
          autoSummary: settings.auto_summary_enabled,
          triage: settings.triage_enabled,
          briefing: settings.briefing_enabled,
        }
      : ALL_FEATURES_ON,
    panel: panel.status,
  }
}

/**
 * Quanto uma leitura vale. Cada instância do servidor relê o painel (e o
 * ambiente) a cada 30 s: uma troca salva na tela vale na hora na instância
 * que salvou (`invalidateAiRuntimeConfig`) e em até 30 s nas outras.
 */
const CACHE_TTL_MS = 30_000

let cached: { value: Promise<AiRuntimeConfig>; expiresAt: number } | null = null

/**
 * A configuração da IA em vigor: o painel de Configurações (migration 94) vale
 * mais que o ambiente, campo a campo; sem painel, tudo como antes dele.
 *
 * Nunca lança: o que não dá para ler cai para o ambiente, com o motivo no log
 * `[ia-config]`. O resultado leva as chaves em claro — não sai do servidor.
 */
export function getAiRuntimeConfig(): Promise<AiRuntimeConfig> {
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.value
  const value = loadAiRuntimeConfig()
  cached = { value, expiresAt: now + CACHE_TTL_MS }
  return value
}

/** Descarta a leitura guardada — chamar depois de salvar no painel. */
export function invalidateAiRuntimeConfig(): void {
  cached = null
}
