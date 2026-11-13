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
 * não filtrar. No banco: `monitoring_frequency` nulo é 'oab', preenchido é
 * 'manual' (`getLegalProcessPage`).
 */
export type MonitoringSource = 'oab' | 'manual'

export const MONITORING_SOURCES: readonly MonitoringSource[] = ['oab', 'manual']

export const MONITORING_SOURCE_LABELS: Record<MonitoringSource, string> = {
  oab: 'Pela OAB',
  manual: 'Manual',
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

// O filtro em si roda no servidor desde a paginação (docs/paginacao.md):
// `search_legal_processes` + os filtros encadeados em `getLegalProcessPage`.
