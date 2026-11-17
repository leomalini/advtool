import type { AiFeature, AssistantProvider } from '@/features/ia/config/models'

export type { AiFeature, AssistantProvider }

/** Por que um teste de conexão falhou — a tela mostra `message`. */
export type ProviderTestCode =
  | 'invalid_key'
  | 'forbidden'
  | 'model_unavailable'
  | 'workspace_required'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'no_key'
  | 'unexpected'

export type ProviderTestResult =
  | { ok: true }
  | { ok: false; code: ProviderTestCode; message: string }

export interface AiProviderKeySummary {
  provider: AssistantProvider
  /** De onde vem a chave em uso: o painel, o ambiente (`.env`) ou nenhuma. */
  source: 'panel' | 'env' | null
  /** Os últimos caracteres da chave em uso, para a tela mostrar `••••abcd`. */
  hint: string | null
  workspaceId: string | null
  /** Há chave no painel, mas ela não abre (segredo do servidor trocado). */
  unreadable: boolean
  /** Último teste da chave do painel. Chave do ambiente não guarda teste. */
  lastTest: { at: string; ok: boolean; error: string | null } | null
}

export interface AiBudgetSummary {
  /** `env`: vale `AI_MONTHLY_BUDGET_USD`; `panel`: vale o valor do painel. */
  source: 'panel' | 'env'
  /** `null` = sem teto no app. */
  limitUsd: number | null
  /** A variável do ambiente tem valor que não é número: a IA para (falha fechada). */
  invalidEnv: boolean
}

/** O que a aba "Assistente IA" mostra. Nunca leva uma chave inteira. */
export interface AiSettingsSummary {
  /** `false` sem a migration 94 ou sem service_role: só leitura do ambiente. */
  editable: boolean
  activeProvider: AssistantProvider | null
  providerSource: 'panel' | 'env'
  models: Record<AssistantProvider, string>
  keys: AiProviderKeySummary[]
  budget: AiBudgetSummary
  features: Record<AiFeature, boolean>
}

export interface AiUsageByRoute {
  route: string
  calls: number
  costUsd: number
  /** Chamadas sem preço conhecido (Gemini): fora do total. */
  uncosted: number
}

/** O gasto do mês corrente, no fuso do escritório, a partir de `ai_usage`. */
export interface AiMonthUsage {
  /** Primeiro dia do mês (yyyy-MM-dd). */
  month: string
  totalUsd: number
  calls: number
  uncosted: number
  byRoute: AiUsageByRoute[]
}

export type AiSettingsLogKind =
  | 'provider'
  | 'model'
  | 'key_set'
  | 'key_removed'
  | 'budget'
  | 'toggle'
  | 'test'

export interface AiSettingsLogEntry {
  id: string
  createdAt: string
  kind: AiSettingsLogKind
  details: Record<string, unknown>
  changedByName: string | null
}

/** O que as rotas de gravação devolvem: a tela nova, ou por que não gravou. */
export type AiSettingsMutationResult =
  | { ok: true; summary: AiSettingsSummary }
  | { ok: false; code: ProviderTestCode | 'blocked'; message: string }
