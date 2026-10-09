'use client'

import { Fragment } from 'react'
import { format, parseISO } from 'date-fns'
import { AlertCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAvatarTone, getDisplayName, getInitials } from '@/utils/profile'
import {
  resolveEventType,
  type EventClient,
  type EventTypeRecord,
} from '@/types/event.types'
import type { Profile } from '@/types/common.types'
import { AgendaTaskCheck } from '@/features/agenda/components/AgendaTaskCheck'
import type { AgendaItem, TaskAgendaItem } from '@/features/agenda/utils/agendaItem'
import {
  belongsToAllDayStrip,
  effectiveEnd,
  isMultiDay,
  segmentMarker,
  type DaySegment,
} from '@/features/agenda/utils/daySpan'
import { countdown, minutesUntil } from '../utils/today'

type EventTypeMap = Map<string, EventTypeRecord>

/** "em 35 min" shows for what starts within this many minutes. */
const SOON_MINUTES = 60

function clientName(client: EventClient | null | undefined): string | null {
  if (!client) return null
  return client.type === 'individual' ? client.name : (client.trade_name ?? client.company_name)
}

function startOf(segment: DaySegment): number {
  return parseISO(segment.item.start_at).getTime()
}

/** The time column: when the item starts — or, for a multi-day event, what
 * this day is of it ("até 14:00", "o dia todo"). */
function timeColumn(segment: DaySegment): { main: string; sub: string | null } {
  const { item } = segment
  if (isMultiDay(item)) return { main: segmentMarker(segment) ?? 'O dia todo', sub: null }
  if (belongsToAllDayStrip(item)) {
    return item.kind === 'task' ? { main: 'Sem hora', sub: 'tarefa' } : { main: 'Dia todo', sub: null }
  }
  const start = parseISO(item.start_at)
  if (item.kind === 'task') return { main: format(start, 'HH:mm'), sub: 'tarefa' }
  const end = parseISO(item.end_at)
  return { main: format(start, 'HH:mm'), sub: end > start ? format(end, 'HH:mm') : null }
}

function assigneeOf(item: AgendaItem): Profile | null {
  if (item.kind === 'task') return item.task.assignee ?? null
  return item.event.assignees?.[0] ?? item.event.assignee ?? null
}

function Avatar({ person }: { person: Profile }) {
  const name = getDisplayName(person.full_name)
  return (
    <span
      title={name}
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white',
        getAvatarTone(person.id)
      )}
    >
      {getInitials(name)}
    </span>
  )
}

const PILL = 'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold'

interface RowProps {
  segment: DaySegment
  isToday: boolean
  now: Date
  todayKey: string
  eventTypes: EventTypeMap
  onOpen: (item: AgendaItem) => void
  onToggleTask?: (item: TaskAgendaItem) => void
}

/** Stretched button: the title covers the row with `::after`, and the task's
 * check sits above it — a button inside a button is not valid HTML. */
function DayRow({ segment, isToday, now, todayKey, eventTypes, onOpen, onToggleTask }: RowProps) {
  const { item } = segment
  const time = timeColumn(segment)
  const timed = !belongsToAllDayStrip(item)
  const start = parseISO(item.start_at)
  const minutesToStart = minutesUntil(start, now)
  const person = assigneeOf(item)

  const done = item.kind === 'task' && item.done
  const ended = isToday && item.kind === 'event' && effectiveEnd(item) <= now
  const ongoing = isToday && timed && item.kind === 'event' && start <= now && !ended
  const soon = isToday && timed && !done && minutesToStart > 0 && minutesToStart <= SOON_MINUTES
  const lateTask = isToday && timed && item.kind === 'task' && !done && start < now
  const fatalToday = item.kind === 'event' && item.event.fatal_deadline === todayKey

  const color =
    item.kind === 'task' ? 'var(--info)' : resolveEventType(eventTypes, item.event.type).color
  const meta =
    item.kind === 'task'
      ? 'Tarefa'
      : [
          resolveEventType(eventTypes, item.event.type).label,
          clientName(item.event.client),
          item.event.location,
        ]
          .filter(Boolean)
          .join(' · ')

  return (
    <div
      className={cn(
        'relative grid grid-cols-[3.25rem_3px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-2 transition-colors',
        'hover:bg-muted/50 has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring',
        ongoing && 'bg-accent',
        (ended || done) && 'opacity-55'
      )}
    >
      <div className="text-[13px] leading-tight font-semibold tabular-nums">
        {time.main}
        {time.sub && <span className="block text-xs font-normal text-muted-foreground">{time.sub}</span>}
      </div>
      <span aria-hidden className="h-8 w-[3px] self-center rounded-full" style={{ backgroundColor: color }} />

      <div className="min-w-0">
        {/* The title shrinks down to a floor; past it, the pills drop to a
            line of their own instead of cutting the title to a word. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          {item.kind === 'task' && (
            <span className="relative z-10 flex">
              <AgendaTaskCheck item={item} onToggle={onToggleTask} className="size-4 text-info" />
            </span>
          )}
          <button
            type="button"
            onClick={() => onOpen(item)}
            className={cn(
              'max-w-full min-w-[7rem] truncate text-left text-sm font-semibold after:absolute after:inset-0 focus-visible:outline-none',
              done && 'line-through'
            )}
          >
            {item.title}
          </button>
          {soon && (
            <span className={cn(PILL, 'bg-accent text-accent-foreground')}>
              <Clock aria-hidden className="size-3" />
              {countdown(minutesToStart)}
            </span>
          )}
          {ongoing && (
            <span className={cn(PILL, 'bg-accent-foreground text-primary-foreground')}>agora</span>
          )}
          {item.kind === 'event' && item.event.fatal_deadline && (
            <span className={cn(PILL, 'bg-destructive/10 text-destructive')}>
              {fatalToday ? (
                <span aria-hidden className="size-1.5 rounded-full bg-destructive animate-pulse-urgent" />
              ) : (
                <AlertCircle aria-hidden className="size-3" />
              )}
              {fatalToday ? 'Prazo fatal hoje' : 'Prazo fatal'}
            </span>
          )}
          {lateTask && (
            <span className={cn(PILL, 'bg-destructive/10 text-destructive')}>passou do horário</span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>

      {person ? <Avatar person={person} /> : <span />}
    </div>
  )
}

interface TodayDayListProps {
  /** Segments of the day being shown, in `compareDaySegments` order. */
  segments: DaySegment[]
  isToday: boolean
  now: Date
  todayKey: string
  eventTypes: EventTypeMap
  onOpen: (item: AgendaItem) => void
  onToggleTask?: (item: TaskAgendaItem) => void
}

/**
 * The day as a list: what has no hour first, then by time, with a red "now"
 * divider between what is behind and what is ahead (today only). What already
 * ended stays, faded — the day reads whole.
 */
export function TodayDayList({ segments, isToday, now, ...rowProps }: TodayDayListProps) {
  const untimed = segments.filter((segment) => belongsToAllDayStrip(segment.item))
  const timed = segments
    .filter((segment) => !belongsToAllDayStrip(segment.item))
    .sort((a, b) => startOf(a) - startOf(b))
  const firstAhead = isToday ? timed.findIndex((segment) => startOf(segment) >= now.getTime()) : -1
  const nowLabel = `Agora · ${format(now, 'HH:mm')}`

  const divider = (
    <li aria-hidden className="flex items-center gap-2 px-2 py-0.5 text-[11px] font-bold text-destructive">
      {nowLabel}
      <span className="h-0.5 flex-1 rounded-full bg-destructive/70" />
    </li>
  )

  return (
    <ul>
      {untimed.map((segment) => (
        <li key={`${segment.item.id}-${segment.dayKey}`}>
          <DayRow segment={segment} isToday={isToday} now={now} {...rowProps} />
        </li>
      ))}
      {timed.map((segment, index) => (
        <Fragment key={`${segment.item.id}-${segment.dayKey}`}>
          {index === firstAhead && divider}
          <li>
            <DayRow segment={segment} isToday={isToday} now={now} {...rowProps} />
          </li>
        </Fragment>
      ))}
      {isToday && timed.length > 0 && firstAhead === -1 && divider}
    </ul>
  )
}
