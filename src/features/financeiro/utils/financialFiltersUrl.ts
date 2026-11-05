import { z } from 'zod'
import { toISODate, todayISO } from '@/types/financialEntry.types'
import {
  defaultFinancialFilters,
  parseSituationFilter,
  periodOf,
  type FinancialFilters,
} from './filterFinancialEntries'
import {
  ALL_DATES,
  PERIOD_PRESETS,
  detectPreset,
  isAllDates,
  isCurrentPeriod,
  presetRange,
  type PeriodPreset,
  type PeriodRange,
} from './periods'

/**
 * The Financeiro filters in the URL (docs/financeiro.md). It is what makes a
 * dashboard number open the list that adds up to it, and keeps the screen on
 * a reload or in a link. The text search stays out: it can be a client's
 * name, and URLs end up in logs.
 *
 *     ?periodo=semana                  the current week — relative, stays current
 *     ?de=2026-09-01&ate=2026-09-30    fixed dates: a past month, dates by hand
 *     ?periodo=tudo                    every date
 *     ?semdata=1                       only date-less entries (the chart's "Sem data")
 *     ?tipo=receita&situacao=pago&cliente=<id>&processo=<id>
 *     ?id=<id>                         the entry open in the detail
 *     ?aba=exitos                      the Êxitos tab
 *
 * With no period at all the screen opens on the current month — except a link
 * with `situacao`, written before the period existed (the Assistant's chat
 * history keeps them): those always meant every date.
 */

/** The URL word of each shortcut: the "Hoje" button is the 'dia' preset. */
const PRESET_PARAMS: Record<PeriodPreset, string> = {
  dia: 'hoje',
  semana: 'semana',
  quinzena: 'quinzena',
  mes: 'mes',
}

const ALL_DATES_PARAM = 'tudo'

const idSchema = z.string().uuid()
const typeSchema = z.enum(['receita', 'despesa'])

/** Something with `get`: `URLSearchParams`, or the read-only one of Next. */
interface ParamReader {
  get(name: string): string | null
}

function parseId(value: string | null): string | null {
  const parsed = idSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** 'yyyy-MM-dd' that is a real day: '2026-02-30' does not round-trip. */
function parseDay(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  return toISODate(new Date(year, month - 1, day)) === value ? value : null
}

function presetFromParam(value: string | null): PeriodPreset | null {
  return PERIOD_PRESETS.find((preset) => PRESET_PARAMS[preset] === value) ?? null
}

function parsePeriod(params: ParamReader, today: string, hasSituation: boolean): PeriodRange {
  const from = parseDay(params.get('de'))
  const to = parseDay(params.get('ate'))
  if (from || to) return { from, to }

  const periodo = params.get('periodo')
  if (periodo === ALL_DATES_PARAM) return ALL_DATES
  const preset = presetFromParam(periodo)
  if (preset) return presetRange(preset, today)

  return hasSituation ? ALL_DATES : presetRange('mes', today)
}

/** The screen's tabs (`?aba=exitos`). The filters belong to Lançamentos; the
 * Êxitos tab has its own. */
export type FinanceiroTab = 'lancamentos' | 'exitos'

export interface FinancialUrlState {
  filters: FinancialFilters
  entryId: string | null
  tab: FinanceiroTab
}

export function parseFinancialUrl(
  params: ParamReader,
  today: string = todayISO()
): FinancialUrlState {
  const situation = parseSituationFilter(params.get('situacao')) ?? null
  const type = typeSchema.safeParse(params.get('tipo'))
  const undatedOnly = params.get('semdata') === '1'
  // "Sem data" has no period: the two cannot hold together.
  const period = undatedOnly ? ALL_DATES : parsePeriod(params, today, situation !== null)

  return {
    filters: {
      ...defaultFinancialFilters(today),
      type: type.success ? type.data : null,
      situation,
      clientId: parseId(params.get('cliente')),
      legalProcessId: parseId(params.get('processo')),
      periodFrom: period.from,
      periodTo: period.to,
      undatedOnly,
    },
    entryId: parseId(params.get('id')),
    tab: params.get('aba') === 'exitos' ? 'exitos' : 'lancamentos',
  }
}

/** The query string, without '?'. The current period of a shortcut is written
 * as the shortcut, so a saved link to "this week" keeps meaning this week. */
export function serializeFinancialUrl(
  { filters, entryId, tab }: FinancialUrlState,
  today: string = todayISO()
): string {
  const params = new URLSearchParams()
  const period = periodOf(filters)

  if (tab === 'exitos') params.set('aba', 'exitos')

  if (filters.undatedOnly) {
    params.set('periodo', ALL_DATES_PARAM)
    params.set('semdata', '1')
  } else if (isAllDates(period)) {
    params.set('periodo', ALL_DATES_PARAM)
  } else {
    const preset = detectPreset(period)
    if (preset && isCurrentPeriod(period, preset, today)) {
      params.set('periodo', PRESET_PARAMS[preset])
    } else {
      if (period.from) params.set('de', period.from)
      if (period.to) params.set('ate', period.to)
    }
  }

  if (filters.type) params.set('tipo', filters.type)
  if (filters.situation) params.set('situacao', filters.situation)
  if (filters.clientId) params.set('cliente', filters.clientId)
  if (filters.legalProcessId) params.set('processo', filters.legalProcessId)
  if (entryId) params.set('id', entryId)

  return params.toString()
}
