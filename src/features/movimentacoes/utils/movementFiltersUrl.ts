import { format, isValid, parseISO } from 'date-fns'
import type { MovementCategory } from '@/types/legalProcess.types'
import type { MirroredParams } from '@/hooks/useSearchParamsMirror'
import { MOVEMENT_CATEGORIES } from './categories'
import { defaultMovementFilters, type MovementFilters } from './movementFilters'

/**
 * Os filtros de Movimentações na URL (docs/paginacao.md), com os nomes em
 * português como os do Financeiro:
 *
 *     ?de=2026-10-01&ate=2026-10-31   período fixo (o padrão, últimos 30 dias, não vai)
 *     ?categorias=decisao,sentenca    chips de categoria
 *     ?tribunal=TJSP
 *     ?providencia=1                  só o que pede providência
 *     ?tratadas=1                     inclui as já tratadas (o padrão é escondê-las)
 *
 * A busca por texto fica FORA, como no Financeiro: pode ser o nome de um
 * cliente, e URLs acabam em logs.
 */
const PARAMS = {
  from: 'de',
  to: 'ate',
  categories: 'categorias',
  court: 'tribunal',
  requiresAction: 'providencia',
  includeHandled: 'tratadas',
} as const

interface ParamReader {
  get(name: string): string | null
}

/** 'yyyy-MM-dd' que é um dia de verdade: '2026-02-30' não volta igual. */
function parseDay(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = parseISO(value)
  return isValid(date) && format(date, 'yyyy-MM-dd') === value ? value : null
}

function isMovementCategory(value: string): value is MovementCategory {
  return Object.hasOwn(MOVEMENT_CATEGORIES, value)
}

/** Lê os filtros da URL. O que faltar ou vier inválido fica no padrão. */
export function parseMovementFilters(params: ParamReader): MovementFilters {
  const base = defaultMovementFilters()

  const from = parseDay(params.get(PARAMS.from)) ?? base.from
  const to = parseDay(params.get(PARAMS.to)) ?? base.to
  // Um período invertido não tem resultado possível: volta ao padrão em vez de
  // abrir uma lista vazia sem explicação.
  const period = from > to ? { from: base.from, to: base.to } : { from, to }

  const categories = (params.get(PARAMS.categories) ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(isMovementCategory)

  return {
    ...base,
    ...period,
    categories: [...new Set(categories)],
    court: params.get(PARAMS.court)?.trim() || null,
    requiresAction: params.get(PARAMS.requiresAction) === '1',
    onlyUnhandled: params.get(PARAMS.includeHandled) !== '1',
  }
}

/** O inverso de `parseMovementFilters`: só o que difere do padrão vai. */
export function serializeMovementFilters(filters: MovementFilters): MirroredParams {
  const base = defaultMovementFilters()
  const customPeriod = filters.from !== base.from || filters.to !== base.to

  return {
    [PARAMS.from]: customPeriod ? filters.from : null,
    [PARAMS.to]: customPeriod ? filters.to : null,
    [PARAMS.categories]: filters.categories.length > 0 ? filters.categories.join(',') : null,
    [PARAMS.court]: filters.court,
    [PARAMS.requiresAction]: filters.requiresAction ? '1' : null,
    [PARAMS.includeHandled]: filters.onlyUnhandled ? null : '1',
  }
}
