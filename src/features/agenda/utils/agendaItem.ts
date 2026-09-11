import { addMinutes, endOfDay, format, min as minDate, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { CalendarEvent } from '@/types/event.types'
import type { Task } from '@/types/task.types'
import { toInstant } from './datetime'
import { eventRangeLabel } from './daySpan'

/**
 * O que a Agenda desenha: um evento ou uma tarefa — os dois tipos do Google
 * Agenda.
 *
 * As duas continuam em tabelas próprias (`events`, `tasks`); aqui elas só
 * ganham a mesma forma de exibição. Tarefa criada na Agenda é uma linha de
 * `tasks`, e por isso aparece sozinha no quadro de Tarefas — e vice-versa.
 */

interface AgendaItemBase {
  /** Único entre os dois tipos (`event:<id>`, `task:<id>`) — vira `key` de lista. */
  id: string
  title: string
  /** Instantes ISO, na mesma convenção de `events` (ver utils/daySpan.ts). */
  start_at: string
  end_at: string
  all_day: boolean
}

export interface EventAgendaItem extends AgendaItemBase {
  kind: 'event'
  event: CalendarEvent
}

export interface TaskAgendaItem extends AgendaItemBase {
  kind: 'task'
  task: Task
  done: boolean
}

export type AgendaItem = EventAgendaItem | TaskAgendaItem

/** Altura de uma tarefa com hora na grade — ela marca um momento, não ocupa
 * um intervalo, então não usa a duração padrão de evento. */
const TASK_BLOCK_MINUTES = 30

export function eventToAgendaItem(event: CalendarEvent): EventAgendaItem {
  return {
    kind: 'event',
    id: `event:${event.id}`,
    title: event.title,
    start_at: event.start_at,
    end_at: event.end_at,
    all_day: event.all_day,
    event,
  }
}

/**
 * Tarefa → item da Agenda. Sem data, não há onde colocá-la: `null`.
 *
 * `due_date` + `due_time` são relógio de parede sem fuso; `toInstant` os
 * converte no instante local — o mesmo caminho do formulário de evento, então
 * uma tarefa das 9h cai exatamente na linha das 9h.
 */
export function taskToAgendaItem(task: Task): TaskAgendaItem | null {
  if (!task.due_date) return null

  const time = task.due_time?.slice(0, 5) || undefined
  const startAt = toInstant(task.due_date, time)
  // Com hora: um bloco curto, preso ao próprio dia — uma tarefa das 23h45 não
  // pode vazar para a coluna seguinte.
  const endAt = time
    ? minDate([
        addMinutes(parseISO(startAt), TASK_BLOCK_MINUTES),
        endOfDay(parseISO(startAt)),
      ]).toISOString()
    : startAt

  return {
    kind: 'task',
    id: `task:${task.id}`,
    title: task.title,
    start_at: startAt,
    end_at: endAt,
    all_day: !time,
    task,
    done: task.status === 'done',
  }
}

/** Rótulo de quando: tarefa mostra só o momento ("10 set, 09:00"); evento, o
 * intervalo inteiro. */
export function agendaItemWhenLabel(item: AgendaItem): string {
  if (item.kind === 'event') return eventRangeLabel(item.event)

  const start = parseISO(item.start_at)
  const day = format(start, 'dd MMM', { locale: ptBR })
  return item.all_day ? day : `${day}, ${format(start, 'HH:mm')}`
}
