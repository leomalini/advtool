import { addMinutes, endOfDay, format, parseISO, startOfDay } from 'date-fns'
import type { CalendarEvent } from '@/types/event.types'
import type { Task } from '@/types/task.types'
import type { UpdateEventInput } from '@/schemas/event.schema'
import type { UpdateTaskInput } from '@/schemas/task.schema'
import type { AgendaItem } from './agendaItem'
import type { DaySegment } from './daySpan'

/**
 * Arrastar um item da Agenda: de onde ele saiu e onde caiu → os novos instantes.
 *
 * Tudo aqui é puro e em hora local, como em `utils/datetime.ts` ("grava
 * instante, lê local"). Os componentes só medem pixels; a conta de dia e
 * horário é toda deste arquivo.
 */

/** Passo do arraste na grade de horas — o mesmo piso de altura de um bloco. */
export const SNAP_MINUTES = 15

const DAY_MINUTES = 24 * 60
const MINUTE_MS = 60 * 1000

/** O intervalo do item depois de movido. */
export interface MovedTimes {
  start: Date
  /** Igual a `start` quando o evento não tem término informado. */
  end: Date
  allDay: boolean
}

/** O que o bloco arrastado carrega (`data` do `useDraggable`). */
export interface AgendaDragSource {
  type: 'agenda-item'
  segment: DaySegment
  /** Topo do bloco na coluna, em minutos do dia — o que a tela mostra. */
  topMin: number
  heightMin: number
}

/** Coluna de um dia na grade de horas (`data` do `useDroppable`). */
export interface GridDropZone {
  type: 'grid-day'
  day: Date
  /** Altura de uma hora em px — converte pixels em minutos. */
  hourHeight: number
  /** Topo da coluna na tela AGORA. Lido na hora, não medido no início: a
   * grade rola sozinha quando o ponteiro encosta na borda. */
  getTop: () => number
}

export function isAgendaDragSource(data: unknown): data is AgendaDragSource {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'agenda-item'
}

export function isGridDropZone(data: unknown): data is GridDropZone {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'grid-day'
}

export interface GridMove {
  moved: MovedTimes
  /** Onde a sombra fica na coluna de destino, em minutos do dia. */
  topMin: number
  heightMin: number
}

/**
 * Onde o topo do bloco estaria na coluna, em minutos do dia (sem encaixe).
 *
 * `pointerY` é a posição do ponteiro na tela e `grabOffset` a distância entre
 * o topo do bloco e o ponto em que ele foi pego. Não usa o `delta` do dnd-kit:
 * com a grade rolando sozinha durante o arraste, o `delta` não acompanhava a
 * rolagem, e a sombra ficava centenas de pixels acima do ponteiro.
 */
export function blockTopInColumn(zone: GridDropZone, pointerY: number, grabOffset: number): number {
  return ((pointerY - grabOffset - zone.getTop()) / zone.hourHeight) * 60
}

/**
 * Bloco da grade de horas solto na coluna `zone`, com o topo em `rawTopMin`
 * (ver `blockTopInColumn`).
 *
 * O passo de 15 min vale para o deslocamento, não para o horário: uma reunião
 * das 9h10 anda para 9h25, 9h40… e soltar no lugar não a empurra para 9h15. O
 * topo fica dentro do dia de destino — soltar abaixo da grade não joga o item
 * para o dia seguinte.
 *
 * Pedaço de um evento que atravessa a meia-noite: quem anda é o evento
 * inteiro. O pedaço de depois da meia-noite começa no topo da coluna, e o
 * evento, horas antes, no dia anterior — essa distância é mantida.
 */
export function moveInGrid(source: AgendaDragSource, zone: GridDropZone, rawTopMin: number): GridMove {
  const { segment, topMin, heightMin } = source
  const item = segment.item

  const deltaMin = Math.round((rawTopMin - topMin) / SNAP_MINUTES) * SNAP_MINUTES
  const newTop = Math.min(Math.max(topMin + deltaMin, 0), DAY_MINUTES - SNAP_MINUTES)

  const start = parseISO(item.start_at)
  const end = parseISO(item.end_at)
  const lead = segment.isFirstDay
    ? 0
    : addMinutes(parseISO(segment.dayKey), topMin).getTime() - start.getTime()

  const newStart = new Date(addMinutes(startOfDay(zone.day), newTop).getTime() - lead)
  // Duração em ms: o Brasil não tem horário de verão desde 2019, e somar a
  // duração mantém o término sem término (end = start) do jeito que está.
  const newEnd = new Date(newStart.getTime() + (end.getTime() - start.getTime()))

  return {
    moved: { start: newStart, end: newEnd, allDay: false },
    topMin: newTop,
    heightMin: Math.min(heightMin, DAY_MINUTES - newTop),
  }
}

/** O item já está aí — soltar no lugar não grava nada. */
export function isUnchangedMove(item: AgendaItem, moved: MovedTimes): boolean {
  return (
    moved.allDay === item.all_day &&
    Math.floor(moved.start.getTime() / MINUTE_MS) ===
      Math.floor(parseISO(item.start_at).getTime() / MINUTE_MS)
  )
}

/** O intervalo atual do item, no formato de um movimento — é o que o Desfazer grava. */
export function currentTimes(item: AgendaItem): MovedTimes {
  return { start: parseISO(item.start_at), end: parseISO(item.end_at), allDay: item.all_day }
}

/** "14:15 – 15:15" na sombra; tarefa e evento sem término, só o início. */
export function movedTimeLabel(item: AgendaItem, moved: MovedTimes): string {
  const start = format(moved.start, 'HH:mm')
  if (item.kind === 'task' || moved.end <= moved.start) return start
  return `${start} – ${format(moved.end, 'HH:mm')}`
}

/**
 * Patch de evento para o movimento.
 *
 * Vão sempre as seis chaves do tempo juntas: `toDbPatch` lê `all_day` do
 * próprio patch, e sem término no patch iguala `end_at` ao novo início.
 * `inform_end` sai do intervalo real, não da flag gravada — uma linha antiga com
 * término e `inform_end = false` perderia o término ao ser movida.
 *
 * O prazo fatal não entra: é a data legal, não a do trabalho.
 */
export function toEventMovePatch(event: CalendarEvent, moved: MovedTimes): UpdateEventInput {
  const hasEnd = moved.end.getTime() > moved.start.getTime()
  return {
    id: event.id,
    all_day: moved.allDay,
    start_date: format(moved.start, 'yyyy-MM-dd'),
    start_time: moved.allDay ? '' : format(moved.start, 'HH:mm'),
    inform_end: hasEnd,
    end_date: hasEnd ? format(moved.end, 'yyyy-MM-dd') : '',
    end_time: hasEnd && !moved.allDay ? format(moved.end, 'HH:mm') : '',
  }
}

/** As mesmas colunas, já como o banco devolve — para a lista em cache. */
export function movedEventColumns(
  moved: MovedTimes
): Pick<CalendarEvent, 'start_at' | 'end_at' | 'all_day' | 'inform_end'> {
  return {
    start_at: moved.start.toISOString(),
    end_at: moved.end.toISOString(),
    all_day: moved.allDay,
    inform_end: moved.end.getTime() > moved.start.getTime(),
  }
}

/** Tarefa marca um momento: só data e hora (sem hora quando vira dia inteiro). */
export function toTaskMovePatch(
  task: Task,
  moved: MovedTimes
): UpdateTaskInput & { due_date: string; due_time: string | null } {
  return {
    id: task.id,
    due_date: format(moved.start, 'yyyy-MM-dd'),
    due_time: moved.allDay ? null : format(moved.start, 'HH:mm'),
  }
}

/** Limite do prazo fatal. Gravado sem hora, ele fica à meia-noite — e vale
 * pelo dia inteiro, senão uma audiência às 9h do próprio dia do prazo já
 * contaria como "depois". */
function fatalDeadlineLimit(event: CalendarEvent): Date | null {
  if (!event.fatal_deadline) return null
  const deadline = parseISO(event.fatal_deadline)
  return deadline.getTime() === startOfDay(deadline).getTime() ? endOfDay(deadline) : deadline
}

/**
 * O movimento leva o evento para depois do prazo fatal dele?
 *
 * Só quando cruza o limite: um evento que já estava depois do prazo e anda
 * dentro dessa zona não pergunta de novo a cada arraste.
 */
export function crossesFatalDeadline(event: CalendarEvent, moved: MovedTimes): boolean {
  const limit = fatalDeadlineLimit(event)
  if (!limit) return false
  return moved.start > limit && parseISO(event.start_at) <= limit
}
