import type { Profile } from './common.types'

export type FinancialEntryType = 'receita' | 'despesa'
export type FinancialEntryCategory = 'honorario' | 'custas' | 'pericia' | 'outros'
/** "Atrasado" não é um estado guardado — ver isFinancialEntryOverdue. */
export type FinancialEntryStatus = 'pendente' | 'pago'

export const FINANCIAL_TYPE_LABELS: Record<FinancialEntryType, string> = {
  receita: 'Receita',
  despesa: 'Despesa',
}

export const FINANCIAL_CATEGORY_LABELS: Record<FinancialEntryCategory, string> = {
  honorario: 'Honorário',
  custas: 'Custas',
  pericia: 'Perícia',
  outros: 'Outros',
}

export const FINANCIAL_STATUS_LABELS: Record<FinancialEntryStatus, string> = {
  pendente: 'Pendente',
  pago: 'Pago',
}

export interface FinancialEntry {
  id: string
  type: FinancialEntryType
  category: FinancialEntryCategory
  description: string
  /** numeric(12,2) — PostgREST devolve como number. */
  amount: number
  status: FinancialEntryStatus
  due_date: string
  paid_at: string | null
  client_id: string | null
  crm_item_id: string | null
  legal_process_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface FinancialEntryWithRelations extends FinancialEntry {
  client?: {
    id: string
    type: 'individual' | 'company'
    name: string | null
    company_name: string | null
    trade_name: string | null
  } | null
  /** Resumo do processo vinculado — o suficiente para a coluna e o link. */
  legal_process?: {
    id: string
    cnj_number: string | null
  } | null
  creator?: Profile
}

/** Derivado, nunca armazenado: um lançamento vencido continuaria "pendente"
 * para sempre se o atraso fosse um status gravado. */
export function isFinancialEntryOverdue(entry: FinancialEntry): boolean {
  if (entry.status === 'pago') return false
  return entry.due_date < new Date().toISOString().slice(0, 10)
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
