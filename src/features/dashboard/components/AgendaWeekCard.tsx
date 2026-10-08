'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  addDays,
  eachDayOfInterval,
  endOfDay,
  format,
  isToday,
  isTomorrow,
  parseISO,
  startOfDay,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AlertCircle, CalendarDays } from 'lucide-react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getAvatarTone, getDisplayName, getInitials } from '@/utils/profile'
import { usePermissions } from '@/hooks/usePermissions'
import {
  resolveEventType,
  type CalendarEvent,
  type EventClient,
  type EventTypeRecord,
} from '@/types/event.types'
import { useEvents } from '@/features/agenda/hooks/useEvents'
import { useEventTypeMap } from '@/features/agenda/hooks/useEventTypes'
import { AgendaTaskCheck } from '@/features/agenda/components/AgendaTaskCheck'
import { EventDetailModal } from '@/features/agenda/components/EventDetailModal'
import {
  eventToAgendaItem,
  taskToAgendaItem,
  type AgendaItem,
  type TaskAgendaItem,
} from '@/features/agenda/utils/agendaItem'
import {
  compareDaySegments,
  effectiveEnd,
  indexEventsByDay,
  isMultiDay,
  segmentMarker,
  type DaySegment,
} from '@/features/agenda/utils/daySpan'
import { useTasksInRange } from '@/features/tarefas/hooks/useTasks'
import { TaskDetailModal } from '@/features/tarefas/components/TaskDetailModal'
import { useCompleteTask } from '../hooks/useCompleteTask'
import { pluralize } from '../utils/format'

const DAYS = 7
const MAX_DOTS = 3
/** Rows in the whole-week view — a busy week still fits beside the monitoring card. */
const LIST_LIMIT = 8
/** The dashboard stays open all day; the Agenda page refreshes by mutation. */
const REFRESH_MS = 60_000

type EventTypeMap = Map<string, EventTypeRecord>

function clientName(client: EventClient | null | undefined): string | null {
  if (!client) return null
  return client.type === 'individual' ? client.name : (client.trade_name ?? client.company_name)
}

/** 'Hoje', 'Amanhã', 'qui, 09/10'. */
function dayHeading(day: Date): string {
  if (isToday(day)) return 'Hoje'
  if (isTomorrow(day)) return 'Amanhã'
  return format(day, 'EEE, dd/MM', { locale: ptBR })
}

/** The time of a row in the day being listed — a multi-day event reads
 * differently on its first, middle and last day. */
function timeLabel(segment: DaySegment): string | null {
  const { item } = segment
  if (isMultiDay(item)) return segmentMarker(segment) ?? 'o dia todo'
  if (item.all_day) return item.kind === 'event' ? 'Dia todo' : null

  const start = parseISO(item.start_at)
  const end = parseISO(item.end_at)
  // A task marks a moment; an event without an end repeats its start.
  if (item.kind === 'task' || end <= start) return format(start, 'HH:mm')
  return `${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`
}

function ItemDot({ item, eventTypes }: { item: AgendaItem; eventTypes: EventTypeMap }) {
  if (item.kind === 'task') {
    return <span className="h-1.5 w-1.5 rounded-full border border-info" />
  }
  // A fatal deadline outranks the type colour: it is what the dot must warn about.
  const color = item.event.fatal_deadline
    ? 'var(--destructive)'
    : resolveEventType(eventTypes, item.event.type).color
  return <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
}

interface AgendaRowProps {
  segment: DaySegment
  eventTypes: EventTypeMap
  onOpen: (item: AgendaItem) => void
  onToggleTask?: (item: TaskAgendaItem) => void
}

/** Stretched button: the title covers the row with `::after`, and the task's
 * check sits above it — a button inside a button is not valid HTML. */
function AgendaRow({ segment, eventTypes, onOpen, onToggleTask }: AgendaRowProps) {
  const { item } = segment
  const time = timeLabel(segment)
  const rowClass =
    'relative flex items-start gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50 ' +
    'has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring'
  const titleClass =
    'block w-full truncate text-left text-sm font-medium after:absolute after:inset-0 ' +
    'focus-visible:outline-none'

  if (item.kind === 'task') {
    return (
      <div className={rowClass}>
        <span className="relative z-10 mt-0.5 flex">
          <AgendaTaskCheck item={item} onToggle={onToggleTask} className="h-4 w-4 text-info" />
        </span>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onOpen(item)} className={titleClass}>
            {item.title}
          </button>
          <p className="truncate text-[11px] text-muted-foreground">
            {['Tarefa', time].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
    )
  }

  const event = item.event
  const type = resolveEventType(eventTypes, event.type)
  const meta = [type.label, time, clientName(event.client), event.location]
    .filter(Boolean)
    .join(' · ')
  const assignee = event.assignees?.[0] ?? event.assignee
  const assigneeName = assignee ? getDisplayName(assignee.full_name) : null

  return (
    <div className={rowClass}>
      <span
        aria-hidden
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: type.color }}
      />
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => onOpen(item)} className={titleClass}>
          {event.title}
        </button>
        <p className="truncate text-[11px] text-muted-foreground">{meta}</p>
      </div>
      {event.fatal_deadline && (
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
          <AlertCircle className="h-3 w-3" />
          Prazo fatal
        </span>
      )}
      {assignee && assigneeName && (
        <span
          title={assigneeName}
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white',
            getAvatarTone(assignee.id)
          )}
        >
          {getInitials(assigneeName)}
        </span>
      )}
    </div>
  )
}

interface AgendaWeekCardProps {
  /** Placement in the dashboard grid (`lg:col-span-N`). */
  className?: string
}

/**
 * The next seven days: a strip with what each day holds, and the list below.
 * Clicking a day narrows the list to it; clicking again shows the week.
 *
 * Same queries — and cache — as the Agenda page, through the same item model:
 * a multi-day event shows on every day it covers, every event and task
 * mutation already invalidates what this card reads, and the detail opens here.
 */
export function AgendaWeekCard({ className }: AgendaWeekCardProps) {
  const { can } = usePermissions()
  const canViewTasks = can('tarefas', 'view')
  const canToggleTasks = can('tarefas', 'update')

  const today = startOfDay(new Date())
  const lastDay = addDays(today, DAYS - 1)
  const days = eachDayOfInterval({ start: today, end: lastDay })

  const events = useEvents(today.toISOString(), endOfDay(lastDay).toISOString(), {
    refetchInterval: REFRESH_MS,
  })
  const tasks = useTasksInRange(format(today, 'yyyy-MM-dd'), format(lastDay, 'yyyy-MM-dd'), {
    enabled: canViewTasks,
    refetchInterval: REFRESH_MS,
  })
  const eventTypes = useEventTypeMap()
  const completeTask = useCompleteTask()

  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  // What is still ahead: pending tasks, and events that haven't ended — the
  // same rule as the Agenda's "Próximos 7 dias".
  const now = new Date()
  const pendingTasks = (canViewTasks ? (tasks.data ?? []) : [])
    .map(taskToAgendaItem)
    .filter((item): item is TaskAgendaItem => item !== null && !item.done)
  const items: AgendaItem[] = [
    ...(events.data ?? []).map(eventToAgendaItem).filter((item) => effectiveEnd(item) > now),
    ...pendingTasks,
  ]

  const byDay = indexEventsByDay(items, today, lastDay)
  const segmentsOf = (dayKey: string) => [...(byDay.get(dayKey) ?? [])].sort(compareDaySegments)

  // The list: the selected day, or the whole week up to LIST_LIMIT rows.
  let budget = LIST_LIMIT
  let hidden = 0
  const groups: { day: Date; key: string; segments: DaySegment[] }[] = []
  for (const day of days) {
    const key = format(day, 'yyyy-MM-dd')
    if (selectedDay && key !== selectedDay) continue
    const segments = segmentsOf(key)
    const shown = segments.slice(0, Math.max(budget, 0))
    hidden += segments.length - shown.length
    budget -= shown.length
    if (shown.length > 0) groups.push({ day, key, segments: shown })
  }

  const isLoading = events.isLoading || (canViewTasks && tasks.isLoading)
  const isError = events.isError || tasks.isError
  const selectedTask = selectedTaskId
    ? ((tasks.data ?? []).find((task) => task.id === selectedTaskId) ?? null)
    : null

  function openItem(item: AgendaItem) {
    if (item.kind === 'event') setSelectedEvent(item.event)
    else setSelectedTaskId(item.task.id)
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-accent-foreground" />
          Agenda da semana
        </CardTitle>
        <CardAction>
          <Link
            href="/agenda"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Abrir agenda
          </Link>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-7 gap-1" role="group" aria-label="Próximos 7 dias">
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd')
            const segments = segmentsOf(key)
            const active = selectedDay === key

            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                aria-label={`${format(day, "EEEE, dd 'de' MMMM", { locale: ptBR })}: ${pluralize(
                  segments.length,
                  'compromisso',
                  'compromissos'
                )}`}
                onClick={() => setSelectedDay(active ? null : key)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border py-1.5 transition-colors',
                  'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-foreground/40 bg-muted/60' : 'border-transparent',
                  !active && isToday(day) && 'border-border'
                )}
              >
                {/* Três letras: o `EEE` do ptBR devolve o nome inteiro ("quarta"),
                    que não cabe em sete colunas. */}
                <span className="text-[10px] uppercase text-muted-foreground">
                  {format(day, 'EEEE', { locale: ptBR }).slice(0, 3)}
                </span>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    isToday(day) && 'text-accent-foreground'
                  )}
                >
                  {format(day, 'dd')}
                </span>
                <span className="flex h-2 items-center gap-0.5">
                  {segments.slice(0, MAX_DOTS).map((segment) => (
                    <ItemDot key={segment.item.id} item={segment.item} eventTypes={eventTypes} />
                  ))}
                  {segments.length > MAX_DOTS && (
                    <span className="text-[9px] leading-none text-muted-foreground">
                      +{segments.length - MAX_DOTS}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        )}

        {isError && (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            Não foi possível carregar a agenda.
          </p>
        )}

        {!isLoading && !isError && groups.length === 0 && (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            {selectedDay ? 'Nada neste dia.' : 'Nada nos próximos 7 dias.'}
          </p>
        )}

        {groups.map((group) => (
          <section key={group.key} className="space-y-0.5">
            <h3 className="px-2 text-xs font-semibold text-muted-foreground">
              {dayHeading(group.day)}
            </h3>
            <ul>
              {group.segments.map((segment) => (
                <li key={`${segment.item.id}-${segment.dayKey}`}>
                  <AgendaRow
                    segment={segment}
                    eventTypes={eventTypes}
                    onOpen={openItem}
                    onToggleTask={
                      canToggleTasks ? (item) => completeTask(item.task) : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

        {(hidden > 0 || selectedDay) && (
          <div className="flex flex-wrap items-center gap-x-3 px-2 text-xs text-muted-foreground">
            {hidden > 0 && (
              <Link href="/agenda" className="hover:text-foreground hover:underline">
                e mais {pluralize(hidden, 'compromisso', 'compromissos')} na Agenda
              </Link>
            )}
            {selectedDay && (
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="font-medium text-foreground hover:underline"
              >
                Ver a semana
              </button>
            )}
          </div>
        )}
      </CardContent>

      <EventDetailModal
        event={selectedEvent}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTaskId(null)}
      />
    </Card>
  )
}
