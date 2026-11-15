import type { MirroredParams } from '@/hooks/useSearchParamsMirror'
import { parseIsoDay, parseOneOf, parseUuid, type ParamReader } from '@/lib/urlParams'
import { CRM_LEGAL_AREAS } from '@/schemas/crmItem.schema'
import {
  emptyProcessoFilters,
  MONITORING_SOURCES,
  type ProcessoFilters,
} from './filterLegalProcesses'

export type ProcessoSortField = 'prazo' | 'atualizacao'

/** `null` = a ordem padrão: processo atualizado mais recentemente primeiro. */
export interface ProcessoSort {
  field: ProcessoSortField
  direction: 'asc' | 'desc'
}

/**
 * Os filtros e a ordem da lista de Processos na URL (docs/paginacao.md):
 *
 *     ?area=trabalhista&responsavel=<id>&etapa=<coluna>
 *     ?prazo_de=2026-11-01&prazo_ate=2026-11-30
 *     ?monitoramento=oab | monitoramento=manual
 *     ?ordem=prazo | -prazo | atualizacao | -atualizacao   ("-" = decrescente)
 *
 * A busca por texto fica FORA, como no Financeiro: é nome de parte, de
 * cliente, e URLs acabam em logs. Os parâmetros que a tela já usava
 * (`create`, `clientId`, `cnj`) não são tocados.
 */
const PARAMS = {
  legalArea: 'area',
  assignedTo: 'responsavel',
  columnId: 'etapa',
  deadlineFrom: 'prazo_de',
  deadlineTo: 'prazo_ate',
  monitoring: 'monitoramento',
  sort: 'ordem',
} as const

const SORT_VALUES = ['prazo', '-prazo', 'atualizacao', '-atualizacao'] as const

/** Id de coluna do workflow ('col-...'): texto curto, sem espaço. Uma etapa
 * que não existe só deixa a lista vazia, como um filtro qualquer. */
function parseColumnId(value: string | null): string | null {
  return value && /^[\w-]{1,64}$/.test(value) ? value : null
}

export function parseProcessoFilters(params: ParamReader): ProcessoFilters {
  const deadlineFrom = parseIsoDay(params.get(PARAMS.deadlineFrom))
  const deadlineTo = parseIsoDay(params.get(PARAMS.deadlineTo))
  // Período invertido não tem resultado possível: fica sem período.
  const inverted = deadlineFrom !== null && deadlineTo !== null && deadlineFrom > deadlineTo
  const monitoring = parseOneOf(params.get(PARAMS.monitoring), MONITORING_SOURCES)

  return {
    ...emptyProcessoFilters,
    legalArea: parseOneOf(params.get(PARAMS.legalArea), CRM_LEGAL_AREAS),
    assignedTo: parseUuid(params.get(PARAMS.assignedTo)),
    columnId: parseColumnId(params.get(PARAMS.columnId)),
    deadlineFrom: inverted ? null : deadlineFrom,
    deadlineTo: inverted ? null : deadlineTo,
    monitoring: monitoring ? [monitoring] : [],
  }
}

export function parseProcessoSort(params: ParamReader): ProcessoSort | null {
  const value = parseOneOf(params.get(PARAMS.sort), SORT_VALUES)
  if (!value) return null
  const descending = value.startsWith('-')
  return {
    field: (descending ? value.slice(1) : value) as ProcessoSortField,
    direction: descending ? 'desc' : 'asc',
  }
}

/** Todos menos a busca; `null` tira o parâmetro da URL. */
export function serializeProcessoListState(
  filters: ProcessoFilters,
  sort: ProcessoSort | null
): MirroredParams {
  // As duas fontes marcadas equivalem a nenhuma (todo processo cai numa).
  const monitoring = filters.monitoring.length === 1 ? filters.monitoring[0] : null
  return {
    [PARAMS.legalArea]: filters.legalArea,
    [PARAMS.assignedTo]: filters.assignedTo,
    [PARAMS.columnId]: filters.columnId,
    [PARAMS.deadlineFrom]: filters.deadlineFrom,
    [PARAMS.deadlineTo]: filters.deadlineTo,
    [PARAMS.monitoring]: monitoring,
    [PARAMS.sort]: sort ? `${sort.direction === 'desc' ? '-' : ''}${sort.field}` : null,
  }
}
