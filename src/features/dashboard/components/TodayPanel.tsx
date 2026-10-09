'use client'

import { useId, useState } from 'react'
import { addDays, eachDayOfInterval, endOfDay, format, isSameDay, parseISO, startOfDay } from 'date-fns'
import { CalendarCheck, CalendarDays, CalendarPlus, Clock, ListPlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getDisplayName } from '@/utils/profile'
import { useMounted } from '@/hooks/useMounted'
import { useNow } from '@/hooks/useNow'
import { usePermissions } from '@/hooks/usePermissions'
import { useCurrentProfile } from '@/hooks/useProfiles'
import type { CalendarEvent } from '@/types/event.types'
import { useEvents } from '@/features/agenda/hooks/useEvents'
import { useEventTypeMap } from '@/features/agenda/hooks/useEventTypes'
import { EventDetailModal } from '@/features/agenda/components/EventDetailModal'
import {
  AgendaCreateDialog,
  type CreateKind,
} from '@/features/agenda/components/AgendaCreateDialog'
import {
  eventToAgendaItem,
  taskToAgendaItem,
  type AgendaItem,
  type TaskAgendaItem,
} from '@/features/agenda/utils/agendaItem'
import { compareDaySegments, indexEventsByDay } from '@/features/agenda/utils/daySpan'
import { useTasksInRange } from '@/features/tarefas/hooks/useTasks'
import { useToggleTaskDone } from '@/features/tarefas/hooks/useTaskMutations'
import { TaskDetailModal } from '@/features/tarefas/components/TaskDetailModal'
import { useCompleteTask } from '../hooks/useCompleteTask'
import { pluralize } from '../utils/format'
import { ENTER_ANIMATION } from '../utils/motion'
import {
  countdown,
  greeting,
  longDate,
  minutesUntil,
  nextUpcoming,
  relativeDayLabel,
} from '../utils/today'
import { CardLink } from './CardLink'
import { TONE_CHIP_CLASSES } from './DashboardCard'
import { TodayDayList } from './TodayDayList'
import { TodayRuler } from './TodayRuler'
import { TodayWeekStrip, isOpenItem } from './TodayWeekStrip'

const DAYS = 7
/** The dashboard stays open all day; the Agenda page refreshes by mutation. */
const REFRESH_MS = 60_000

/** First name only — "Bom dia, Ana" reads better than the full legal name.
 * Goes through getDisplayName because seeded profiles may hold an e-mail. */
function firstName(fullName: string): string {
  return getDisplayName(fullName).trim().split(/\s+/)[0]
}

const CHIP =
  'inline-flex min-h-7 items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium'

function Chip({
  tone,
  icon,
  children,
}: {
  tone?: 'success' | 'danger' | 'accent'
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        CHIP,
        tone === 'success' && 'border-success/30 bg-success/8',
        tone === 'danger' && 'border-destructive/30 bg-destructive/8',
        tone === 'accent' && 'border-accent-foreground/30 bg-accent'
      )}
    >
      {icon}
      <span>{children}</span>
    </span>
  )
}

interface TodayPanelProps {
  className?: string
}

/**
 * The top of the dashboard: the greeting, what today holds, and the next
 * seven days — a strip to pick a day, a ruler with the shape of that day and
 * the list of it. Replaces the "Agenda da semana" card and the header line.
 *
 * Rendered only after mount: the greeting, the "now" line and the countdowns
 * are the browser's local time, and the server's clock would hydrate a
 * different text.
 */
export function TodayPanel({ className }: TodayPanelProps) {
  const mounted = useMounted()
  if (!mounted) {
    return <Skeleton className={cn('h-60 rounded-xl', className)} />
  }
  return <TodayPanelBody className={className} />
}

function TodayPanelBody({ className }: TodayPanelProps) {
  const titleId = useId()
  const profile = useCurrentProfile()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const showAgenda = can('agenda', 'view')
  const canViewTasks = can('tarefas', 'view')
  const canToggleTasks = can('tarefas', 'update')
  const canCreateEvent = can('agenda', 'create')
  const canCreateTask = can('tarefas', 'create')

  const now = useNow()
  const today = startOfDay(now)
  const todayKey = format(today, 'yyyy-MM-dd')
  const lastDay = addDays(today, DAYS - 1)
  const days = eachDayOfInterval({ start: today, end: lastDay })

  const events = useEvents(today.toISOString(), endOfDay(lastDay).toISOString(), {
    refetchInterval: REFRESH_MS,
  })
  const tasks = useTasksInRange(todayKey, format(lastDay, 'yyyy-MM-dd'), {
    enabled: canViewTasks,
    refetchInterval: REFRESH_MS,
  })
  const eventTypes = useEventTypeMap()
  const completeTask = useCompleteTask()
  const toggleTaskDone = useToggleTaskDone()

  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [creating, setCreating] = useState<{ at: Date; kind: CreateKind } | null>(null)

  const items: AgendaItem[] = [
    ...(events.data ?? []).map(eventToAgendaItem),
    ...(canViewTasks ? (tasks.data ?? []) : [])
      .map(taskToAgendaItem)
      .filter((item): item is TaskAgendaItem => item !== null),
  ]
  const byDay = indexEventsByDay(items, today, lastDay)
  const segmentsOf = (key: string) => [...(byDay.get(key) ?? [])].sort(compareDaySegments)

  // A pick from yesterday's strip falls back to today once the day turns.
  const selectedDay = days.find((day) => format(day, 'yyyy-MM-dd') === pickedKey) ?? today
  const selectedKey = format(selectedDay, 'yyyy-MM-dd')
  const selectedIsToday = isSameDay(selectedDay, today)
  const daySegments = segmentsOf(selectedKey)

  const todayOpen = segmentsOf(todayKey).map((s) => s.item).filter(isOpenItem)
  const todayEvents = todayOpen.filter((item) => item.kind === 'event').length
  const todayTasks = todayOpen.length - todayEvents
  const fatalToday = todayOpen.filter(
    (item) => item.kind === 'event' && item.event.fatal_deadline === todayKey
  )
  const next = nextUpcoming(items, now)
  const restOfWeek = days
    .slice(1)
    .reduce((sum, day) => sum + segmentsOf(format(day, 'yyyy-MM-dd')).filter((s) => isOpenItem(s.item)).length, 0)

  const isLoading = permissionsLoading || events.isLoading || (canViewTasks && tasks.isLoading)
  const isError = events.isError || tasks.isError
  const canCreate = canCreateEvent || canCreateTask
  const selectedTask = selectedTaskId
    ? ((tasks.data ?? []).find((task) => task.id === selectedTaskId) ?? null)
    : null

  function openItem(item: AgendaItem) {
    if (item.kind === 'event') setSelectedEvent(item.event)
    else setSelectedTaskId(item.task.id)
  }

  function toggleTask(item: TaskAgendaItem) {
    if (item.done) toggleTaskDone.mutate({ id: item.task.id, done: false })
    else completeTask(item.task)
  }

  function nextLabel(item: AgendaItem): React.ReactNode {
    const start = parseISO(item.start_at)
    if (isSameDay(start, today)) {
      return (
        <>
          Próximo: <strong className="font-semibold">{item.title}</strong> às {format(start, 'HH:mm')} ·{' '}
          <strong className="font-semibold">{countdown(minutesUntil(start, now))}</strong>
        </>
      )
    }
    return (
      <>
        Próximo: <strong className="font-semibold">{item.title}</strong> ·{' '}
        {relativeDayLabel(start, today).toLowerCase()}, {format(start, 'HH:mm')}
      </>
    )
  }

  const name = profile ? firstName(profile.full_name) : null

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        '@container relative overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm',
        ENTER_ANIMATION,
        className
      )}
    >
      {/* A wash of the accent from the top right: the one block with colour of its own. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_150%_at_100%_0%,var(--accent),transparent_62%)]"
      />

      <div
        className={cn(
          'relative grid gap-4 px-5 pt-5 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-end @3xl:px-6',
          showAgenda ? 'pb-3' : 'pb-5'
        )}
      >
        <div className="min-w-0">
          <h1 id={titleId} className="text-2xl font-bold tracking-tight">
            {greeting(now)}
            {name ? `, ${name}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">{longDate(now)}</p>

          {showAgenda && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {isLoading ? (
                <Skeleton className="h-7 w-64 rounded-full" />
              ) : (
                <>
                  {todayOpen.length > 0 ? (
                    <Chip icon={<CalendarDays aria-hidden className="size-3.5 text-muted-foreground" />}>
                      <strong className="font-semibold">
                        {[
                          todayEvents > 0 && pluralize(todayEvents, 'compromisso', 'compromissos'),
                          todayTasks > 0 && pluralize(todayTasks, 'tarefa', 'tarefas'),
                        ]
                          .filter(Boolean)
                          .join(' e ')}
                      </strong>{' '}
                      hoje
                    </Chip>
                  ) : (
                    <Chip
                      tone="success"
                      icon={<CalendarCheck aria-hidden className="size-3.5 text-success" />}
                    >
                      {segmentsOf(todayKey).length > 0 ? 'Tudo feito por hoje' : 'Nada marcado para hoje'}
                    </Chip>
                  )}
                  {fatalToday.length > 0 && (
                    <Chip
                      tone="danger"
                      icon={<span aria-hidden className="size-2 rounded-full bg-destructive animate-pulse-urgent" />}
                    >
                      Prazo fatal hoje · <strong className="font-semibold">{fatalToday[0].title}</strong>
                      {fatalToday.length > 1 && ` e mais ${fatalToday.length - 1}`}
                    </Chip>
                  )}
                  {next && (
                    <Chip
                      tone="accent"
                      icon={<Clock aria-hidden className="size-3.5 text-accent-foreground" />}
                    >
                      {nextLabel(next)}
                    </Chip>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {showAgenda && (
          <div className="flex flex-col gap-3 @3xl:items-end">
            {canCreate && (
              <div className="flex flex-wrap gap-2">
                {canCreateEvent && (
                  <Button size="sm" onClick={() => setCreating({ at: selectedDay, kind: 'event' })}>
                    <CalendarPlus aria-hidden />
                    Novo compromisso
                  </Button>
                )}
                {canCreateTask && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCreating({ at: selectedDay, kind: 'task' })}
                  >
                    <ListPlus aria-hidden />
                    Tarefa
                  </Button>
                )}
              </div>
            )}
            <TodayWeekStrip
              days={days}
              today={today}
              selectedKey={selectedKey}
              onSelect={setPickedKey}
              segmentsByDay={byDay}
              eventTypes={eventTypes}
            />
          </div>
        )}
      </div>

      {showAgenda && (
        <div className="relative">
          {isLoading && (
            <div className="space-y-2 px-5 pb-5 @3xl:px-6">
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          )}

          {isError && (
            <p className="px-5 pb-5 text-sm text-muted-foreground @3xl:px-6">
              Não foi possível carregar a agenda.
            </p>
          )}

          {!isLoading && !isError && daySegments.length === 0 && (
            <div className="mx-5 mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-muted/70 px-3.5 py-3 @3xl:mx-6">
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full',
                  TONE_CHIP_CLASSES.success
                )}
              >
                <CalendarCheck aria-hidden className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {!selectedIsToday
                    ? `Nada marcado para ${relativeDayLabel(selectedDay, today).toLowerCase()}`
                    : restOfWeek > 0
                      ? 'Dia livre'
                      : 'Semana livre'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {!selectedIsToday
                    ? 'Dia livre na agenda.'
                    : restOfWeek > 0
                      ? `${pluralize(restOfWeek, 'item', 'itens')} nos próximos dias — veja na faixa acima.`
                      : `Nada nos próximos ${DAYS} dias.`}
                </p>
              </div>
              {canCreate && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setCreating({ at: selectedDay, kind: canCreateEvent ? 'event' : 'task' })
                  }
                >
                  <Plus aria-hidden />
                  Agendar
                </Button>
              )}
            </div>
          )}

          {!isLoading && !isError && daySegments.length > 0 && (
            <>
              <TodayRuler
                segments={daySegments}
                isToday={selectedIsToday}
                now={now}
                eventTypes={eventTypes}
                onOpen={openItem}
              />
              <div className="flex items-center gap-2 px-5 pt-1 text-xs text-muted-foreground @3xl:px-6">
                <span className="text-[13px] font-semibold text-foreground">
                  {relativeDayLabel(selectedDay, today)}
                </span>
                <span>· {pluralize(daySegments.length, 'item', 'itens')}</span>
                <CardLink href="/agenda" className="ml-auto">
                  Abrir na Agenda
                </CardLink>
              </div>
              <div className="px-3 pt-1 pb-3 @3xl:px-4">
                <TodayDayList
                  segments={daySegments}
                  isToday={selectedIsToday}
                  now={now}
                  todayKey={todayKey}
                  eventTypes={eventTypes}
                  onOpen={openItem}
                  onToggleTask={canToggleTasks ? toggleTask : undefined}
                />
              </div>
            </>
          )}
        </div>
      )}

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
      {creating && (
        <AgendaCreateDialog
          open
          onOpenChange={(open) => !open && setCreating(null)}
          target={{ at: creating.at, withTime: false, kind: creating.kind }}
        />
      )}
    </section>
  )
}
