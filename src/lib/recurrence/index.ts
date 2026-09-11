import { addDays, addMonths, addWeeks, addYears, format, parseISO } from 'date-fns'
import { isBusinessDay } from '@/lib/prazos'

/**
 * Datas de uma série recorrente.
 *
 * A recorrência é materializada (migration 52): ao salvar, cada data daqui
 * vira uma linha de `events` ou `tasks`. Por isso "até quando" é obrigatório —
 * uma série sem fim não tem como ser gravada.
 *
 * Tudo em 'yyyy-MM-dd' (dia de calendário, sem hora nem fuso). O horário é
 * aplicado depois, por ocorrência, com `toInstant` — assim "toda terça às 9h"
 * continua às 9h mesmo que o fuso mude no meio da série.
 */

export const RECURRENCE_TYPES = [
  'daily',
  'weekdays',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
] as const

export type RecurrenceType = (typeof RECURRENCE_TYPES)[number]

export const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  daily: 'Diariamente',
  weekdays: 'Dias úteis (seg–sex, sem feriados)',
  weekly: 'Semanalmente',
  biweekly: 'Quinzenalmente',
  monthly: 'Mensalmente',
  yearly: 'Anualmente',
}

/** Rótulo curto, para badges e para o cartão ("↻ Semanal"). */
export const RECURRENCE_SHORT_LABELS: Record<RecurrenceType, string> = {
  daily: 'Diária',
  weekdays: 'Dias úteis',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  yearly: 'Anual',
}

/** Teto por série: um ano de ocorrências diárias. Protege o banco de uma
 * série de dez anos criada sem querer, e a tela de centenas de linhas. */
export const MAX_OCCURRENCES = 365

export type RecurrenceEnd =
  | { kind: 'until'; until: string }
  | { kind: 'count'; count: number }

export interface RecurrenceRule {
  type: RecurrenceType
  end: RecurrenceEnd
}

export interface ExpandedSeries {
  dates: string[]
  /** A regra pedia mais que MAX_OCCURRENCES e a série foi cortada. */
  truncated: boolean
}

function toKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/**
 * A i-ésima data da série, calculada SEMPRE a partir da âncora — nunca da data
 * anterior. Encadeado, "todo dia 31" viraria 31/01 → 28/02 → 28/03; a partir
 * da âncora dá 31/01 → 28/02 → 31/03. O `date-fns` já recua para o último dia
 * do mês quando ele não existe (e 29/02 anual cai em 28/02).
 */
function nthDate(anchor: Date, type: Exclude<RecurrenceType, 'weekdays'>, index: number): Date {
  switch (type) {
    case 'daily':
      return addDays(anchor, index)
    case 'weekly':
      return addWeeks(anchor, index)
    case 'biweekly':
      return addWeeks(anchor, index * 2)
    case 'monthly':
      return addMonths(anchor, index)
    case 'yearly':
      return addYears(anchor, index)
  }
}

/**
 * Expande a regra a partir de `anchor` (a data escolhida no formulário, que é
 * sempre a primeira ocorrência — mesmo num sábado de uma série de dias úteis).
 */
export function expandOccurrences(anchor: string, rule: RecurrenceRule): ExpandedSeries {
  const limit =
    rule.end.kind === 'count' ? Math.max(1, Math.floor(rule.end.count)) : Number.POSITIVE_INFINITY
  const until = rule.end.kind === 'until' ? rule.end.until : null

  const dates: string[] = [anchor]
  const accepts = (key: string) => until === null || key <= until
  let truncated = false

  const wants = () => dates.length < limit
  const room = () => {
    if (dates.length < MAX_OCCURRENCES) return true
    truncated = true
    return false
  }

  if (rule.type === 'weekdays') {
    // Dia útil do escritório: seg–sex fora dos feriados nacionais. O recesso
    // forense (20/12–20/01) não conta como folga — o escritório funciona.
    let day = parseISO(anchor)
    while (wants()) {
      day = addDays(day, 1)
      const key = toKey(day)
      if (!accepts(key)) break
      if (!isBusinessDay(key, { ignoreRecess: true })) continue
      if (!room()) break
      dates.push(key)
    }
  } else {
    const base = parseISO(anchor)
    for (let index = 1; wants(); index++) {
      const key = toKey(nthDate(base, rule.type, index))
      if (!accepts(key)) break
      if (!room()) break
      dates.push(key)
    }
  }

  return { dates, truncated }
}

/**
 * Alcance de uma edição ou exclusão numa ocorrência de série — as três opções
 * do Google Agenda. Ocorrência sem série sempre usa 'this'.
 */
export type SeriesScope = 'this' | 'following' | 'all'

/** Colunas `recurrence_*` de uma linha, no formato da regra. */
export interface StoredRecurrence {
  recurrence_type: RecurrenceType | null
  recurrence_until: string | null
  recurrence_count: number | null
}

/** Colunas a gravar numa ocorrência da série `seriesId` — ou a limpeza delas. */
export function recurrenceColumns(
  rule: RecurrenceRule | null,
  seriesId: string | null
): StoredRecurrence & { recurrence_series_id: string | null } {
  if (!rule || !seriesId) {
    return {
      recurrence_series_id: null,
      recurrence_type: null,
      recurrence_until: null,
      recurrence_count: null,
    }
  }
  return {
    recurrence_series_id: seriesId,
    recurrence_type: rule.type,
    recurrence_until: rule.end.kind === 'until' ? rule.end.until : null,
    recurrence_count: rule.end.kind === 'count' ? rule.end.count : null,
  }
}

/** A regra do formulário é a mesma já gravada na série? */
export function isSameRule(rule: RecurrenceRule | null, stored: StoredRecurrence): boolean {
  if (!rule) return !stored.recurrence_type
  if (rule.type !== stored.recurrence_type) return false
  if (rule.end.kind === 'until') return rule.end.until === stored.recurrence_until
  return rule.end.count === stored.recurrence_count
}

/** Dias entre duas datas 'yyyy-MM-dd' (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000)
}

/** Soma dias a uma data 'yyyy-MM-dd'. */
export function shiftDateKey(key: string, days: number): string {
  return toKey(addDays(parseISO(key), days))
}
