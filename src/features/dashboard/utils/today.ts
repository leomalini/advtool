import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { AgendaItem } from '@/features/agenda/utils/agendaItem'
import { belongsToAllDayStrip } from '@/features/agenda/utils/daySpan'

export function greeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** "Sexta-feira, 9 de outubro de 2026" — sentence case, as a line of its own. */
export function longDate(date: Date): string {
  const text = format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "Hoje", "Amanhã", "sáb, 10/10". The `EEE` of ptBR is the whole name
 * ("sábado"); three letters fit where this goes. */
export function relativeDayLabel(day: Date, today: Date): string {
  const offset = differenceInCalendarDays(day, today)
  if (offset === 0) return 'Hoje'
  if (offset === 1) return 'Amanhã'
  return `${weekdayShort(day)}, ${format(day, 'dd/MM')}`
}

export function weekdayShort(day: Date): string {
  return format(day, 'EEEE', { locale: ptBR }).slice(0, 3)
}

/** Starts at a moment — a timed event, a task with a time. All-day items and
 * done tasks never come "next". */
function isTimedAndPending(item: AgendaItem): boolean {
  if (item.kind === 'task' && item.done) return false
  return !belongsToAllDayStrip(item)
}

/**
 * What comes next after `now`. Compared as instants: events come from the
 * database (`+00:00`) and tasks from `toInstant` (`Z`), so the ISO strings
 * themselves don't sort together.
 */
export function nextUpcoming(items: readonly AgendaItem[], now: Date): AgendaItem | null {
  let next: AgendaItem | null = null
  let nextStart = Infinity
  for (const item of items) {
    if (!isTimedAndPending(item)) continue
    const start = parseISO(item.start_at).getTime()
    if (start > now.getTime() && start < nextStart) {
      next = item
      nextStart = start
    }
  }
  return next
}

/** Whole minutes until `start`, rounded up: at 13:25:30, 14:00 is "em 35 min"
 * — and one minute before, "em 1 min", never "em 0 min". */
export function minutesUntil(start: Date, now: Date): number {
  return Math.ceil((start.getTime() - now.getTime()) / 60_000)
}

/** "em 35 min", "em 1 h 20 min", "em 2 h". */
export function countdown(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `em ${rest} min`
  return rest === 0 ? `em ${hours} h` : `em ${hours} h ${rest} min`
}
