import { addDays, addMinutes, format, max as maxDate, min as minDate, parseISO, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { CalendarEvent } from '@/types/event.types'
import type { AgendaItem } from './agendaItem'

/**
 * Quais dias um evento ocupa na grade.
 *
 * Até aqui a Agenda indexava cada evento só pelo dia de início: "Férias de 1 a
 * 5" aparecia no dia 1 e sumia do resto. Esta é a regra única de "em que dias
 * este evento aparece", usada pelo mês, pela semana/dia e pela lateral.
 *
 * Convenções de gravação (ver `edgeInstant` em events.service.ts):
 *   · dia inteiro → `start_at` é 00:00 local do primeiro dia e `end_at` é 00:00
 *     local do ÚLTIMO dia, inclusivo;
 *   · com horário → os instantes reais. Sem término informado, `end_at` repete
 *     o `start_at` (o CHECK exige `end_at >= start_at`).
 */

/** Vale para evento e para item da Agenda (evento ou tarefa já convertida). */
type SpanSource = Pick<CalendarEvent, 'start_at' | 'end_at' | 'all_day'>

const DAY_MS = 24 * 60 * 60 * 1000

/** Duração assumida para evento sem término — a mesma que a grade de horas desenha. */
export const DEFAULT_DURATION_MIN = 60

export interface DaySegment<T extends SpanSource = AgendaItem> {
  item: T
  /** Chave yyyy-MM-dd do dia local deste pedaço. */
  dayKey: string
  isFirstDay: boolean
  isLastDay: boolean
}

/** Primeiro e último dia local (à meia-noite) que o evento ocupa. */
export function eventDayBounds(event: SpanSource): { first: Date; last: Date } {
  const start = parseISO(event.start_at)
  const end = parseISO(event.end_at)
  const first = startOfDay(start)

  if (end <= start) return { first, last: first }
  if (event.all_day) return { first, last: maxDate([first, startOfDay(end)]) }

  // Terminar exatamente à meia-noite não ocupa o dia seguinte — uma reunião
  // das 22h às 00h é do dia em que começou (regra do Google Agenda).
  const endDay = startOfDay(end)
  const last = end.getTime() === endDay.getTime() ? addDays(endDay, -1) : endDay
  return { first, last: maxDate([first, last]) }
}

export function isMultiDay(event: SpanSource): boolean {
  const { first, last } = eventDayBounds(event)
  return first.getTime() !== last.getTime()
}

/**
 * Vai para a faixa "Dia todo" da semana/dia em vez da grade de horas.
 *
 * Dia inteiro, ou 24h ou mais — pintar a coluna inteira de vários dias
 * seguidos esconderia todo o resto. Com horário e menos de 24h (uma diligência
 * das 22h às 2h) continua na grade, cortado na meia-noite de cada dia.
 */
export function belongsToAllDayStrip(event: SpanSource): boolean {
  if (event.all_day) return true
  return parseISO(event.end_at).getTime() - parseISO(event.start_at).getTime() >= DAY_MS
}

/** Quando o evento deixa de estar "em andamento" — para listas de próximos. */
export function effectiveEnd(event: SpanSource): Date {
  if (event.all_day) return addDays(eventDayBounds(event).last, 1)
  const start = parseISO(event.start_at)
  const end = parseISO(event.end_at)
  return end > start ? end : addMinutes(start, DEFAULT_DURATION_MIN)
}

/**
 * Indexa cada evento em todos os dias locais que ele cobre, recortado ao
 * período visível — um evento de meses não gera chave para dias fora da tela.
 */
export function indexEventsByDay<T extends SpanSource>(
  events: T[],
  rangeStart: Date,
  rangeEnd: Date
): Map<string, DaySegment<T>[]> {
  const map = new Map<string, DaySegment<T>[]>()
  const visibleFirst = startOfDay(rangeStart)
  const visibleLast = startOfDay(rangeEnd)

  for (const event of events) {
    const { first, last } = eventDayBounds(event)
    const from = maxDate([first, visibleFirst])
    const to = minDate([last, visibleLast])

    // addDays, não soma de 24h: a conta é em dias de calendário locais.
    for (let day = from; day <= to; day = addDays(day, 1)) {
      const dayKey = format(day, 'yyyy-MM-dd')
      const segment: DaySegment<T> = {
        item: event,
        dayKey,
        isFirstDay: day.getTime() === first.getTime(),
        isLastDay: day.getTime() === last.getTime(),
      }
      const list = map.get(dayKey)
      if (list) list.push(segment)
      else map.set(dayKey, [segment])
    }
  }

  return map
}

/** "01 set – 05 set", "10 set, 09:00 – 10:00", "01 set, 14:00 – 03 set, 18:00".
 * O ano só aparece quando não é o corrente. */
export function eventRangeLabel(event: SpanSource): string {
  const currentYear = new Date().getFullYear()
  const day = (d: Date) =>
    format(d, d.getFullYear() === currentYear ? 'dd MMM' : 'dd MMM yyyy', { locale: ptBR })
  const time = (d: Date) => format(d, 'HH:mm')
  const start = parseISO(event.start_at)
  const end = parseISO(event.end_at)
  const { first, last } = eventDayBounds(event)
  const multi = first.getTime() !== last.getTime()

  if (event.all_day) return multi ? `${day(first)} – ${day(last)}` : day(first)
  if (end <= start) return `${day(start)}, ${time(start)}`
  if (!multi) return `${day(start)}, ${time(start)} – ${time(end)}`
  return `${day(start)}, ${time(start)} – ${day(end)}, ${time(end)}`
}

/**
 * Marcador curto de um pedaço no mês e na faixa "Dia todo": a hora de início
 * no primeiro dia, "até HH:mm" no último, nada nos dias do meio. Dia inteiro de
 * um dia só leva "Dia todo"; de vários dias, a própria barra já diz isso.
 */
export function segmentMarker(segment: DaySegment): string | null {
  const { item: event, isFirstDay, isLastDay } = segment
  const multi = !(isFirstDay && isLastDay)

  if (event.all_day) return multi ? null : 'Dia todo'
  if (isFirstDay) return format(parseISO(event.start_at), 'HH:mm')
  if (isLastDay) return `até ${format(parseISO(event.end_at), 'HH:mm')}`
  return null
}

/**
 * Ordem dentro de um dia: vários dias primeiro (os mais longos antes), depois
 * dia inteiro — eventos antes de tarefas —, depois por horário. Com a mesma
 * ordem em todas as células, um evento de vários dias tende a ficar na mesma
 * altura ao longo da semana.
 */
export function compareDaySegments<T extends SpanSource & { id: string; kind?: string }>(
  a: DaySegment<T>,
  b: DaySegment<T>
): number {
  const aMulti = isMultiDay(a.item)
  const bMulti = isMultiDay(b.item)
  if (aMulti !== bMulti) return aMulti ? -1 : 1
  if (aMulti && bMulti) {
    const byStart = a.item.start_at.localeCompare(b.item.start_at)
    if (byStart !== 0) return byStart
    const byEnd = b.item.end_at.localeCompare(a.item.end_at)
    if (byEnd !== 0) return byEnd
    return a.item.id.localeCompare(b.item.id)
  }
  if (a.item.all_day !== b.item.all_day) return a.item.all_day ? -1 : 1
  if (a.item.all_day && a.item.kind !== b.item.kind) return a.item.kind === 'task' ? 1 : -1
  return a.item.start_at.localeCompare(b.item.start_at) || a.item.id.localeCompare(b.item.id)
}
