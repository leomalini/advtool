import {
  AI_FEATURE_INFO,
  AI_MODEL_OPTIONS,
  AI_PROVIDER_LABELS,
  isAssistantProvider,
  type AiFeature,
} from '@/features/ia/config/models'
import type { AiSettingsLogEntry } from '@/types/aiSettings.types'

const usd = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' })

/** US$ com centavos, no formato brasileiro (US$ 12,34). */
export function formatUsd(value: number): string {
  return usd.format(value)
}

function providerLabel(value: unknown): string {
  return typeof value === 'string' && isAssistantProvider(value)
    ? AI_PROVIDER_LABELS[value]
    : 'nenhum'
}

function modelLabel(value: unknown): string {
  if (typeof value !== 'string') return '—'
  const all = [...AI_MODEL_OPTIONS.anthropic, ...AI_MODEL_OPTIONS.google]
  return all.find((option) => option.id === value)?.label ?? value
}

function budgetLabel(value: unknown): string {
  if (typeof value !== 'object' || value === null) return '—'
  const { source, usd: amount } = value as { source?: unknown; usd?: unknown }
  const limit = typeof amount === 'number' ? formatUsd(amount) : 'sem teto'
  return source === 'env' ? `do ambiente (${limit})` : limit
}

function featureLabel(value: unknown): string {
  return typeof value === 'string' && value in AI_FEATURE_INFO
    ? AI_FEATURE_INFO[value as AiFeature].label
    : 'Função'
}

/** Uma linha do histórico em português. `details` vem do banco: tudo é conferido. */
export function describeLogEntry(entry: AiSettingsLogEntry): string {
  const d = entry.details
  switch (entry.kind) {
    case 'provider':
      return `Provedor: ${providerLabel(d.from)} → ${providerLabel(d.to)}`
    case 'model':
      return `Modelo (${providerLabel(d.provider)}): ${modelLabel(d.from)} → ${modelLabel(d.to)}`
    case 'key_set': {
      const hint = typeof d.hint === 'string' ? ` (••••${d.hint})` : ''
      const verb = d.replaced === true ? 'trocada' : 'cadastrada'
      return `Chave de ${providerLabel(d.provider)} ${verb}${hint}`
    }
    case 'key_removed':
      return `Chave de ${providerLabel(d.provider)} removida do painel`
    case 'budget':
      return `Teto mensal: ${budgetLabel(d.from)} → ${budgetLabel(d.to)}`
    case 'toggle':
      return `${featureLabel(d.feature)} ${d.enabled === true ? 'ligado' : 'desligado'}`
    case 'test': {
      const where = d.source === 'env' ? 'do ambiente' : 'do painel'
      const result = d.ok === true ? 'ok' : 'falhou'
      return `Teste da chave ${where} de ${providerLabel(d.provider)}: ${result}`
    }
  }
}
