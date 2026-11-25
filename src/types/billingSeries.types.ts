import type { FinancialEntryCategory } from './financialEntry.types'

/**
 * Espelha `public.billing_series` (migration 98): uma mensalidade. O cron
 * gera um lançamento com cobrança por ciclo (fase 4 de docs/cobrancas.md).
 */
export interface BillingSeries {
  id: string
  client_id: string
  legal_process_id: string | null
  contract_id: string | null
  /** Interna: a descrição de cada lançamento, com o mês. */
  description: string
  /** O que o cliente lê, com o mês. */
  client_description: string
  category: BillingSeriesCategory
  /** numeric — o PostgREST devolve number. */
  amount: number
  /** Primeiro vencimento; o dia dele é o de todos ('yyyy-MM-dd'). */
  start_date: string
  /** Último vencimento possível; null = até encerrar. */
  end_date: string | null
  /** Primeiro vencimento que ainda pode ser gerado (retomar empurra). */
  generate_from: string
  reminders_enabled: boolean
  late_fee_percent: number | null
  monthly_interest_percent: number | null
  pix_discount_percent: number | null
  paused_at: string | null
  ended_at: string | null
  ended_by: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export const BILLING_SERIES_COLUMNS =
  'id, client_id, legal_process_id, contract_id, description, client_description, category, ' +
  'amount, start_date, end_date, generate_from, reminders_enabled, late_fee_percent, ' +
  'monthly_interest_percent, pix_discount_percent, paused_at, ended_at, ended_by, created_by, ' +
  'created_at, updated_at'

export type BillingSeriesCategory = Extract<
  FinancialEntryCategory,
  'honorario' | 'custas' | 'pericia' | 'outros'
>

export const BILLING_SERIES_CATEGORIES: readonly BillingSeriesCategory[] = [
  'honorario',
  'custas',
  'pericia',
  'outros',
]

/** Os limites das colunas: a descrição do cliente deixa espaço para " — 12/2026"
 * caber nos 120 de `billings.client_description`. */
export const SERIES_DESCRIPTION_MAX = 250
export const SERIES_CLIENT_DESCRIPTION_MAX = 110

export type BillingSeriesState = 'active' | 'paused' | 'ended'

export const BILLING_SERIES_STATE_LABELS: Record<BillingSeriesState, string> = {
  active: 'Ativa',
  paused: 'Pausada',
  ended: 'Encerrada',
}

/** Encerrada à mão, ou passou do último vencimento. */
export function billingSeriesState(
  series: Pick<BillingSeries, 'paused_at' | 'ended_at' | 'end_date'>,
  today: string,
): BillingSeriesState {
  if (series.ended_at !== null) return 'ended'
  if (series.end_date !== null && series.end_date < today) return 'ended'
  if (series.paused_at !== null) return 'paused'
  return 'active'
}

/** Uma mensalidade como a aba Cobranças lista. */
export interface BillingSeriesItem {
  series: BillingSeries
  clientName: string | null
  state: BillingSeriesState
  /** O próximo vencimento ainda não gerado, se houver. */
  nextDueDate: string | null
  /** Ciclos já gerados (lançamentos). */
  generatedCount: number
  lastGeneratedDueDate: string | null
}
