import type { LegalProcessWithRelations } from '@/types/legalProcess.types'
import { getCrmItemClientName } from '@/types/crmItem.types'
import type { CrmLegalArea } from '@/schemas/crmItem.schema'

/**
 * Como o processo é acompanhado, pelo seletor de frequência do detalhe:
 *
 *  · 'manual' — alguém escolheu uma frequência (Diária, Semanal, Mensal): há um
 *    monitoramento do processo na BuscaProcessos, cobrado por mês.
 *  · 'oab' — "Não monitorado" no seletor: o processo só é coberto pelo
 *    monitoramento das OABs do escritório, que traz as publicações em que elas
 *    aparecem.
 *
 * Todo processo cai em exatamente um dos dois, então marcar ambos equivale a
 * não filtrar.
 */
export type MonitoringSource = 'oab' | 'manual'

export const MONITORING_SOURCES: readonly MonitoringSource[] = ['oab', 'manual']

export const MONITORING_SOURCE_LABELS: Record<MonitoringSource, string> = {
  oab: 'Pela OAB',
  manual: 'Manual',
}

export function monitoringSourceOf(
  processo: Pick<LegalProcessWithRelations, 'monitoring_frequency'>
): MonitoringSource {
  return processo.monitoring_frequency ? 'manual' : 'oab'
}

export interface ProcessoFilters {
  search: string
  legalArea: CrmLegalArea | null
  assignedTo: string | null
  columnId: string | null
  /** Prazo (next_deadline) range, ISO date strings (yyyy-mm-dd), inclusive. */
  deadlineFrom: string | null
  deadlineTo: string | null
  /** Vazio = qualquer um. Ver `MonitoringSource`. */
  monitoring: MonitoringSource[]
}

export const emptyProcessoFilters: ProcessoFilters = {
  search: '',
  legalArea: null,
  assignedTo: null,
  columnId: null,
  deadlineFrom: null,
  deadlineTo: null,
  monitoring: [],
}

export function hasActiveProcessoFilters(f: ProcessoFilters): boolean {
  return (
    f.search.trim() !== '' ||
    f.legalArea !== null ||
    f.assignedTo !== null ||
    f.columnId !== null ||
    f.deadlineFrom !== null ||
    f.deadlineTo !== null ||
    f.monitoring.length > 0
  )
}

export function countActiveProcessoFilters(f: ProcessoFilters): number {
  let n = 0
  if (f.search.trim() !== '') n++
  if (f.legalArea !== null) n++
  if (f.assignedTo !== null) n++
  if (f.columnId !== null) n++
  if (f.deadlineFrom !== null || f.deadlineTo !== null) n++
  if (f.monitoring.length > 0) n++
  return n
}

/** Applies the Processos filters (texto + área + responsável + etapa + prazo + monitoramento) a uma lista de processos. */
export function filterLegalProcesses(
  processos: LegalProcessWithRelations[],
  f: ProcessoFilters
): LegalProcessWithRelations[] {
  const q = f.search.trim().toLowerCase()
  const qDigits = q.replace(/\D/g, '')
  const from = f.deadlineFrom ? new Date(f.deadlineFrom).getTime() : null
  const to = f.deadlineTo ? new Date(f.deadlineTo).getTime() : null

  return processos.filter((p) => {
    if (f.monitoring.length > 0 && !f.monitoring.includes(monitoringSourceOf(p))) return false

    // A processo with no linked crm_item has none of the item-side fields —
    // any filter on them excludes it, but it still matches by CNJ/parties.
    const item = p.crm_item
    if (f.legalArea && item?.legal_area !== f.legalArea) return false
    if (f.assignedTo && item?.assigned_to !== f.assignedTo) return false
    if (f.columnId && item?.column_id !== f.columnId) return false

    if (from !== null || to !== null) {
      if (!item?.next_deadline) return false
      const deadline = new Date(item.next_deadline).getTime()
      if (from !== null && deadline < from) return false
      if (to !== null && deadline > to) return false
    }

    if (q) {
      const haystack = [
        item?.title,
        p.cnj_number,
        p.plaintiff,
        p.defendant,
        p.opposing_counsel,
        p.court,
        p.court_division,
        item?.next_task_summary,
        item ? getCrmItemClientName(item) : null,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesText = haystack.includes(q)
      const matchesDigits = qDigits.length > 0 && (p.cnj_number?.replace(/\D/g, '') ?? '').includes(qDigits)

      if (!matchesText && !matchesDigits) return false
    }

    return true
  })
}
