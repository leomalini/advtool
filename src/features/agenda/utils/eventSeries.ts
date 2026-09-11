import type { CalendarEvent } from '@/types/event.types'
import { effectiveEnd } from './daySpan'

export interface CollapsedEvent {
  event: CalendarEvent
  /** Ocorrências da série nesta lista — 1 para evento avulso. */
  seriesSize: number
}

/**
 * Listas por entidade (abas de Processo/Cliente): uma linha por série, na
 * ocorrência que ainda não terminou mais próxima — ou na última, se a série
 * inteira já passou. Sem isso, uma reunião semanal de um ano empurrava 52
 * linhas para dentro da aba. Na Agenda cada ocorrência continua no seu dia.
 *
 * Mantém a ordem da lista recebida, na posição da ocorrência escolhida.
 */
export function collapseEventSeries(events: CalendarEvent[], now = new Date()): CollapsedEvent[] {
  const bySeries = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const seriesId = event.recurrence_series_id
    if (!seriesId) continue
    const list = bySeries.get(seriesId)
    if (list) list.push(event)
    else bySeries.set(seriesId, [event])
  }

  const chosen = new Map<string, CalendarEvent>()
  for (const [seriesId, list] of bySeries) {
    const sorted = [...list].sort((a, b) => a.start_at.localeCompare(b.start_at))
    chosen.set(seriesId, sorted.find((ev) => effectiveEnd(ev) > now) ?? sorted[sorted.length - 1])
  }

  return events.flatMap((event) => {
    const seriesId = event.recurrence_series_id
    if (!seriesId) return [{ event, seriesSize: 1 }]
    if (chosen.get(seriesId)?.id !== event.id) return []
    return [{ event, seriesSize: bySeries.get(seriesId)?.length ?? 1 }]
  })
}
