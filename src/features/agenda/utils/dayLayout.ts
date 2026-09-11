import { parseISO } from 'date-fns'
import type { CalendarEvent } from '@/types/event.types'
import { belongsToAllDayStrip, DEFAULT_DURATION_MIN, type DaySegment } from './daySpan'

/**
 * Posicionamento dos eventos num eixo de tempo vertical.
 *
 * Usado pelas visões de semana e dia, onde a grade tem uma linha por hora e um
 * evento de 30 minutos ocupa metade da altura de um de uma hora. A visão de mês
 * **não** usa isto: lá os eventos são linhas, sem relação com a duração.
 *
 * Trabalha sobre os pedaços de um dia (`DaySegment`), não sobre o evento
 * inteiro: uma diligência das 22h às 2h vira 22h–24h num dia e 0h–2h no outro.
 */

/** Altura mínima de um bloco, em % da área — só para que um evento de 10
 * minutos continue clicável. Baixa de propósito: um piso alto esticaria as
 * durações curtas e quebraria a proporção entre elas. */
const DEFAULT_MIN_HEIGHT_PCT = 4

const FULL_DAY_MIN = 24 * 60

function minutesOfDay(iso: string): number {
  const d = parseISO(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Início e fim do pedaço, em minutos do dia.
 *
 * Sem término informado o service repete o `start_at` (para respeitar o CHECK
 * `end_at >= start_at`); aí vale a duração padrão. Sem essa regra esses eventos
 * apareciam esticados até a meia-noite — a marca de "sem término" era
 * confundida com a de "vira o dia".
 */
export function segmentMinutes(segment: DaySegment): { startMin: number; endMin: number } {
  const { event, isFirstDay, isLastDay } = segment
  const startMin = isFirstDay ? minutesOfDay(event.start_at) : 0
  if (!isLastDay) return { startMin, endMin: FULL_DAY_MIN }

  const hasEnd = parseISO(event.end_at).getTime() !== parseISO(event.start_at).getTime()
  if (!hasEnd) return { startMin, endMin: Math.min(FULL_DAY_MIN, startMin + DEFAULT_DURATION_MIN) }

  const endMin = minutesOfDay(event.end_at)
  // No próprio dia de início, fim "antes" do início só acontece quando o
  // término cai à meia-noite seguinte: o bloco vai até o fim da coluna.
  if (isFirstDay) return { startMin, endMin: endMin > startMin ? endMin : FULL_DAY_MIN }
  return { startMin, endMin: endMin === 0 ? FULL_DAY_MIN : endMin }
}

export interface DayWindow {
  /** Minuto do dia em que a faixa começa (0–1440). */
  startMin: number
  endMin: number
  /** Duração da faixa em minutos — nunca zero. */
  spanMin: number
}

export interface PositionedEvent {
  segment: DaySegment
  event: CalendarEvent
  /** Minutos do dia que o bloco representa — o rótulo mostra estes. */
  startMin: number
  endMin: number
  /** Percentuais relativos à altura/largura da área de eventos. */
  topPct: number
  heightPct: number
  leftPct: number
  widthPct: number
}

export interface DayLayout {
  /** Pedaços com horário, posicionados no eixo. */
  timed: PositionedEvent[]
  /** Dia inteiro e eventos de 24h+ — ficam fora do eixo, numa faixa própria. */
  allDay: DaySegment[]
}

interface LaneItem {
  segment: DaySegment
  start: number
  end: number
}

/**
 * Divide os eventos em grupos que se sobrepõem no tempo e distribui cada grupo
 * em faixas lado a lado. Fora de um grupo, o evento usa a largura inteira —
 * por isso o agrupamento, em vez de uma contagem global de faixas.
 */
function assignLanes(items: LaneItem[]): (LaneItem & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end)
  const result: (LaneItem & { lane: number; lanes: number })[] = []

  let cluster: LaneItem[] = []
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
  segments: DaySegment[],
  window: DayWindow,
  options: { minHeightPct?: number } = {}
): DayLayout {
  const minHeightPct = options.minHeightPct ?? DEFAULT_MIN_HEIGHT_PCT
  const allDay = segments.filter((s) => belongsToAllDayStrip(s.event))

  const items = segments
    .filter((s) => !belongsToAllDayStrip(s.event))
    .map((segment) => {
      const { startMin, endMin } = segmentMinutes(segment)
      return { segment, start: startMin, end: endMin }
    })

  const timed = assignLanes(items).map(({ segment, start, end, lane, lanes }) => {
    const topPct = ((start - window.startMin) / window.spanMin) * 100
    const rawHeight = ((end - start) / window.spanMin) * 100

    // O bloco não pode transbordar a área nem sumir: primeiro garante a altura
    // mínima, depois puxa o topo para cima se o conjunto passar de 100%.
    const heightPct = Math.min(100, Math.max(minHeightPct, rawHeight))
    const clampedTop = Math.max(0, Math.min(topPct, 100 - heightPct))

    const widthPct = 100 / lanes

    return {
      segment,
      event: segment.event,
      startMin: start,
      endMin: end,
      topPct: clampedTop,
      heightPct,
      leftPct: lane * widthPct,
      widthPct,
    }
  })

  return { timed, allDay }
}
