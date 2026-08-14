import { parseISO } from 'date-fns'
import type { CalendarEvent } from '@/types/event.types'

/**
 * Posicionamento dos eventos num eixo de tempo vertical.
 *
 * Usado pelas visões de semana e dia, onde a grade tem uma linha por hora e um
 * evento de 30 minutos ocupa metade da altura de um de uma hora. A visão de mês
 * **não** usa isto: lá os eventos são linhas, sem relação com a duração.
 */

/** Altura mínima de um bloco, em % da área — só para que um evento de 10
 * minutos continue clicável. Baixa de propósito: um piso alto esticaria as
 * durações curtas e quebraria a proporção entre elas. */
const DEFAULT_MIN_HEIGHT_PCT = 4

/**
 * Duração assumida para evento sem término informado.
 *
 * O formulário só grava `end_at` quando "informar término" está marcado; nos
 * demais casos o service repete o `start_at` para respeitar o CHECK
 * `end_at >= start_at`. Sem esta regra, esses eventos apareciam esticados até a
 * meia-noite — a marca de "sem término" era confundida com a de "vira o dia".
 */
const DEFAULT_DURATION_MIN = 60

/** Fim efetivo do evento, em minutos do dia. Exportada para a grade poder
 * exibir o mesmo horário de término que desenha. */
export function resolveEndMinutes(event: CalendarEvent, startMin: number): number {
  const hasEnd = !!event.end_at && event.end_at !== event.start_at
  if (!hasEnd) return Math.min(24 * 60, startMin + DEFAULT_DURATION_MIN)

  const endMin = minutesOfDay(event.end_at)
  // Menor que o início com término informado = atravessa a meia-noite. A coluna
  // representa um dia, então corta ali em vez de invadir o dia seguinte.
  return endMin > startMin ? endMin : 24 * 60
}

export interface DayWindow {
  /** Minuto do dia em que a faixa começa (0–1440). */
  startMin: number
  endMin: number
  /** Duração da faixa em minutos — nunca zero. */
  spanMin: number
}

export interface PositionedEvent {
  event: CalendarEvent
  /** Percentuais relativos à altura/largura da área de eventos. */
  topPct: number
  heightPct: number
  leftPct: number
  widthPct: number
}

export interface DayLayout {
  /** Eventos com horário, posicionados no eixo. */
  timed: PositionedEvent[]
  /** Eventos de dia inteiro — ficam fora do eixo, numa faixa própria. */
  allDay: CalendarEvent[]
}

function minutesOfDay(iso: string): number {
  const d = parseISO(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Divide os eventos em grupos que se sobrepõem no tempo e distribui cada grupo
 * em faixas lado a lado. Fora de um grupo, o evento usa a largura inteira —
 * por isso o agrupamento, em vez de uma contagem global de faixas.
 */
function assignLanes(
  items: { event: CalendarEvent; start: number; end: number }[]
): { event: CalendarEvent; start: number; end: number; lane: number; lanes: number }[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end)
  const result: { event: CalendarEvent; start: number; end: number; lane: number; lanes: number }[] = []

  let cluster: typeof sorted = []
  let clusterEnd = -Infinity

  function flush() {
    if (cluster.length === 0) return

    // Guloso: cada evento entra na primeira faixa já livre no seu início.
    const laneEnds: number[] = []
    const placed = cluster.map((item) => {
      let lane = laneEnds.findIndex((end) => end <= item.start)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(item.end)
      } else {
        laneEnds[lane] = item.end
      }
      return { ...item, lane }
    })

    for (const p of placed) result.push({ ...p, lanes: laneEnds.length })
    cluster = []
    clusterEnd = -Infinity
  }

  for (const item of sorted) {
    if (item.start >= clusterEnd) flush()
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  flush()

  return result
}

export function layoutDayEvents(
  events: CalendarEvent[],
  window: DayWindow,
  options: { minHeightPct?: number } = {}
): DayLayout {
  const minHeightPct = options.minHeightPct ?? DEFAULT_MIN_HEIGHT_PCT
  const allDay = events.filter((ev) => ev.all_day)

  const items = events
    .filter((ev) => !ev.all_day)
    .map((ev) => {
      const start = minutesOfDay(ev.start_at)
      return { event: ev, start, end: resolveEndMinutes(ev, start) }
    })

  const timed = assignLanes(items).map(({ event, start, end, lane, lanes }) => {
    const topPct = ((start - window.startMin) / window.spanMin) * 100
    const rawHeight = ((end - start) / window.spanMin) * 100

    // O bloco não pode transbordar a área nem sumir: primeiro garante a altura
    // mínima, depois puxa o topo para cima se o conjunto passar de 100%.
    const heightPct = Math.min(100, Math.max(minHeightPct, rawHeight))
    const clampedTop = Math.max(0, Math.min(topPct, 100 - heightPct))

    const widthPct = 100 / lanes

    return {
      event,
      topPct: clampedTop,
      heightPct,
      leftPct: lane * widthPct,
      widthPct,
    }
  })

  return { timed, allDay }
}
