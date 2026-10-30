import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  getDate,
  getYear,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toISODate, todayISO } from '@/types/financialEntry.types'

/**
 * The periods of the Financeiro bar (docs/financeiro.md → "Períodos e filtros
 * na tela toda"). Calendar periods, not rolling windows: "Recebido" needs the
 * days that already went by, and a "next 7 days" window would leave it at zero.
 *
 * Every date is 'yyyy-MM-dd' in the local time zone, like `todayISO`.
 */

/** The shortcuts. 'dia' is the "Hoje" button: the arrows take it to other days. */
export type PeriodPreset = 'dia' | 'semana' | 'quinzena' | 'mes'

export const PERIOD_PRESETS: readonly PeriodPreset[] = ['dia', 'semana', 'quinzena', 'mes']

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  dia: 'Hoje',
  semana: 'Semana',
  quinzena: 'Quinzena',
  mes: 'Mês',
}

/** Inclusive range. `null` on one end = open; on both = every date ("Tudo"). */
export interface PeriodRange {
  from: string | null
  to: string | null
}

export interface ClosedPeriod {
  from: string
  to: string
}

export const ALL_DATES: PeriodRange = { from: null, to: null }

/** Monday to Sunday: the working week. */
const WEEK_OPTIONS = { weekStartsOn: 1 } as const

/** The period of a shortcut that contains `reference`. */
export function presetRange(preset: PeriodPreset, reference: string = todayISO()): ClosedPeriod {
  const day = parseISO(reference)
  switch (preset) {
    case 'dia':
      return { from: reference, to: reference }
    case 'semana':
      return {
        from: toISODate(startOfWeek(day, WEEK_OPTIONS)),
        to: toISODate(endOfWeek(day, WEEK_OPTIONS)),
      }
    case 'quinzena': {
      // The local usage: the 1st to the 15th, and the 16th to the end.
      const monthStart = startOfMonth(day)
      return getDate(day) <= 15
        ? { from: toISODate(monthStart), to: toISODate(addDays(monthStart, 14)) }
        : { from: toISODate(addDays(monthStart, 15)), to: toISODate(endOfMonth(day)) }
    }
    case 'mes':
      return { from: toISODate(startOfMonth(day)), to: toISODate(endOfMonth(day)) }
  }
}

export function isAllDates(range: PeriodRange): boolean {
  return range.from === null && range.to === null
}

function sameRange(a: PeriodRange, b: PeriodRange): boolean {
  return a.from === b.from && a.to === b.to
}

/**
 * The shortcut a range is, on any date — or `null` for dates picked by hand
 * and for every date. Derived on purpose: the screen keeps only the range,
 * never which button was clicked, so the two cannot disagree.
 */
export function detectPreset(range: PeriodRange): PeriodPreset | null {
  const { from, to } = range
  if (!from || !to) return null
  return PERIOD_PRESETS.find((preset) => sameRange(presetRange(preset, from), range)) ?? null
}

/** Is the range the current period of its shortcut (this week, this month)?
 * That is what the URL keeps as relative (`?periodo=semana`) instead of dates. */
export function isCurrentPeriod(
  range: PeriodRange,
  preset: PeriodPreset,
  today: string = todayISO()
): boolean {
  return sameRange(range, presetRange(preset, today))
}

/**
 * The previous (-1) or next (+1) period. A shortcut steps to the one before
 * its first day or after its last — which turns the 1st–15th into the 16th–end
 * and back. Dates picked by hand step their own length. `null` when there is
 * nowhere to go: every date, or an open end.
 */
export function shiftPeriod(range: PeriodRange, direction: 1 | -1): ClosedPeriod | null {
  const { from, to } = range
  if (!from || !to) return null

  const start = parseISO(from)
  const end = parseISO(to)
  const preset = detectPreset(range)
  if (preset) {
    const reference = direction === 1 ? addDays(end, 1) : addDays(start, -1)
    return presetRange(preset, toISODate(reference))
  }

  const days = (differenceInCalendarDays(end, start) + 1) * direction
  return { from: toISODate(addDays(start, days)), to: toISODate(addDays(end, days)) }
}

/** Is a cash-flow date inside the range? A date-less entry belongs to no
 * period: compared directly, `null < '2026-01-01'` is false in JS, and the
 * entry would slip past both limits into every interval. */
export function isWithinPeriod(date: string | null, range: PeriodRange): boolean {
  if (isAllDates(range)) return true
  if (date === null) return false
  if (range.from && date < range.from) return false
  if (range.to && date > range.to) return false
  return true
}

// ── Labels ───────────────────────────────────────────────────────────────────

const ORDINALS = ['1ª', '2ª'] as const

function dayMonthYear(iso: string): string {
  return format(parseISO(iso), 'dd/MM/yyyy')
}

function dayMonth(iso: string): string {
  return format(parseISO(iso), 'dd/MM')
}

function monthName(iso: string, today: string): string {
  const date = parseISO(iso)
  // The year only when it is not this one: "em outubro" reads better than
  // "em outubro de 2026" on the screen people open every day.
  return getYear(date) === getYear(parseISO(today))
    ? format(date, 'MMMM', { locale: ptBR })
    : format(date, "MMMM 'de' yyyy", { locale: ptBR })
}

function fortnightOrdinal(from: string): string {
  return getDate(parseISO(from)) <= 15 ? ORDINALS[0] : ORDINALS[1]
}

/** Two dates, the first without the year when both share it. */
function formatSpan(from: string, to: string): string {
  return from.slice(0, 4) === to.slice(0, 4)
    ? `${dayMonth(from)} – ${dayMonthYear(to)}`
    : `${dayMonthYear(from)} – ${dayMonthYear(to)}`
}

/** The name of the period in the navigator: "outubro de 2026", "26/10 –
 * 01/11/2026". Lowercase where pt-BR is — the screen capitalises it. */
export function formatPeriod(range: PeriodRange): string {
  const { from, to } = range
  if (from === null) return to === null ? 'Todas as datas' : `Até ${dayMonthYear(to)}`
  if (to === null) return `A partir de ${dayMonthYear(from)}`

  switch (detectPreset(range)) {
    case 'dia':
      return format(parseISO(from), 'EEEE, dd/MM/yyyy', { locale: ptBR })
    case 'quinzena':
      return `${fortnightOrdinal(from)} quinzena de ${format(parseISO(from), "MMMM 'de' yyyy", {
        locale: ptBR,
      })}`
    case 'mes':
      return format(parseISO(from), "MMMM 'de' yyyy", { locale: ptBR })
    case 'semana':
    case null:
      return formatSpan(from, to)
  }
}

/** The period inside a sentence: "A receber em outubro", "Recebido hoje". */
export function describePeriod(range: PeriodRange, today: string = todayISO()): string {
  const { from, to } = range
  if (from === null) return to === null ? 'em todas as datas' : `até ${dayMonthYear(to)}`
  if (to === null) return `a partir de ${dayMonthYear(from)}`

  const preset = detectPreset(range)
  const current = preset !== null && isCurrentPeriod(range, preset, today)
  switch (preset) {
    case 'dia':
      return current ? 'hoje' : `em ${dayMonthYear(from)}`
    case 'semana':
      return current ? 'nesta semana' : `na semana de ${dayMonth(from)} a ${dayMonth(to)}`
    case 'quinzena':
      return current
        ? 'nesta quinzena'
        : `na ${fortnightOrdinal(from)} quinzena de ${monthName(from, today)}`
    case 'mes':
      return `em ${monthName(from, today)}`
    case null:
      return `de ${dayMonthYear(from)} a ${dayMonthYear(to)}`
  }
}
