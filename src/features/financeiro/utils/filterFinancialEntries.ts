import {
  isFinancialEntryOverdue,
  type FinancialEntryWithRelations,
  type FinancialEntryType,
} from '@/types/financialEntry.types'
import { getClientDisplayName } from '@/types/cliente.types'

/** 'pendente' e 'pago' são status reais; 'atrasado' é derivado (ver
 * isFinancialEntryOverdue) mas filtra como se fosse um. */
export type FinancialStatusFilter = 'pendente' | 'pago' | 'atrasado'

export interface FinancialFilters {
  search: string
  type: FinancialEntryType | null
  status: FinancialStatusFilter | null
  clientId: string | null
  legalProcessId: string | null
  /** Intervalo de vencimento, ISO (yyyy-mm-dd), inclusivo. */
  dueFrom: string | null
  dueTo: string | null
}

export const emptyFinancialFilters: FinancialFilters = {
  search: '',
  type: null,
  status: null,
  clientId: null,
  legalProcessId: null,
  dueFrom: null,
  dueTo: null,
}

export function hasActiveFinancialFilters(f: FinancialFilters): boolean {
  return (
    f.search.trim() !== '' ||
    f.type !== null ||
    f.status !== null ||
    f.clientId !== null ||
    f.legalProcessId !== null ||
    f.dueFrom !== null ||
    f.dueTo !== null
  )
}

export function countActiveFinancialFilters(f: FinancialFilters): number {
  let n = 0
  if (f.search.trim() !== '') n++
  if (f.type !== null) n++
  if (f.status !== null) n++
  if (f.clientId !== null) n++
  if (f.legalProcessId !== null) n++
  // Um período conta como um filtro só, mesmo com as duas pontas preenchidas.
  if (f.dueFrom !== null || f.dueTo !== null) n++
  return n
}

/** Primeiro e último dia de um mês 'yyyy-MM' — usado pelo clique no gráfico. */
export function monthRange(month: string): { from: string; to: string } {
  const [year, m] = month.split('-').map(Number)
  const last = new Date(year, m, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

export function filterFinancialEntries(
  entries: FinancialEntryWithRelations[],
  f: FinancialFilters
): FinancialEntryWithRelations[] {
  const q = f.search.trim().toLowerCase()
  const qDigits = q.replace(/\D/g, '')

  return entries.filter((e) => {
    if (f.type && e.type !== f.type) return false
    if (f.clientId && e.client_id !== f.clientId) return false
    if (f.legalProcessId && e.legal_process_id !== f.legalProcessId) return false

    if (f.status) {
      const overdue = isFinancialEntryOverdue(e)
      if (f.status === 'atrasado' && !overdue) return false
      // "Pendente" exclui os atrasados: quem filtra por pendente quer o que
      // ainda está no prazo — o atraso tem seu próprio filtro.
      if (f.status === 'pendente' && (e.status !== 'pendente' || overdue)) return false
      if (f.status === 'pago' && e.status !== 'pago') return false
    }

    if (f.dueFrom && e.due_date < f.dueFrom) return false
    if (f.dueTo && e.due_date > f.dueTo) return false

    if (q) {
      const haystack = [
        e.description,
        e.client ? getClientDisplayName(e.client as Parameters<typeof getClientDisplayName>[0]) : null,
        e.legal_process?.cnj_number,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesText = haystack.includes(q)
      const matchesDigits =
        qDigits.length > 0 &&
        (e.legal_process?.cnj_number?.replace(/\D/g, '') ?? '').includes(qDigits)

      if (!matchesText && !matchesDigits) return false
    }

    return true
  })
}
