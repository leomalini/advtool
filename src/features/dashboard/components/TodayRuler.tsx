'use client'

import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { resolveEventType, type EventTypeRecord } from '@/types/event.types'
import type { AgendaItem } from '@/features/agenda/utils/agendaItem'
import { layoutDayEvents, segmentMinutes, type DayWindow } from '@/features/agenda/utils/dayLayout'
import { belongsToAllDayStrip, type DaySegment } from '@/features/agenda/utils/daySpan'

/** The working day the ruler shows by default; it widens to fit an earlier or
 * later item, by whole hours. */
const DEFAULT_START_MIN = 8 * 60
const DEFAULT_END_MIN = 19 * 60

function timeOf(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  return `${String(h).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function itemSummary(item: AgendaItem, eventTypes: Map<string, EventTypeRecord>): string {
  if (item.kind === 'task') return 'Tarefa'
  return resolveEventType(eventTypes, item.event.type).label
}

interface TodayRulerProps {
  /** Segments of the day being shown. */
  segments: DaySegment[]
  isToday: boolean
  now: Date
  eventTypes: Map<string, EventTypeRecord>
  onOpen: (item: AgendaItem) => void
}

/**
 * The shape of the day at a glance: each event as a block on an hour axis,
 * tasks with a time as pins, the time already gone faded and the "now" line.
 * It shows where the day is free, which a list can't.
 *
 * `layoutDayEvents` is the Agenda's own vertical layout: its `top`/`height`
 * become `left`/`width` here, and its side-by-side lanes become stacked rows.
 *
 * Everything here is also in the list below — with names, times and keyboard
 * access — so the ruler is hidden from assistive tech and from the Tab order.
 */
export function TodayRuler({ segments, isToday, now, eventTypes, onOpen }: TodayRulerProps) {
  const timed = segments.filter((segment) => !belongsToAllDayStrip(segment.item))
  // Pins alone leave a near-empty bar: without an event the list says it all.
  if (!timed.some((segment) => segment.item.kind === 'event')) return null

  let startMin = DEFAULT_START_MIN
  let endMin = DEFAULT_END_MIN
  for (const segment of timed) {
    const range = segmentMinutes(segment)
    startMin = Math.min(startMin, Math.floor(range.startMin / 60) * 60)
    endMin = Math.max(endMin, Math.ceil(range.endMin / 60) * 60)
  }
  const window: DayWindow = { startMin, endMin, spanMin: endMin - startMin }
  const pct = (minutes: number) =>
    ((Math.min(Math.max(minutes, startMin), endMin) - startMin) / window.spanMin) * 100

  const events = layoutDayEvents(
    timed.filter((segment) => segment.item.kind === 'event'),
    window,
    { minHeightPct: 1.5 }
  ).timed
  const pins = timed.filter((segment) => segment.item.kind === 'task')

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const showNow = isToday && nowMin >= startMin && nowMin <= endMin
  // After the ruler's last hour the whole day is behind: `pct` clamps to 100.
  const pastPct = isToday ? pct(nowMin) : 0
  const hours: number[] = []
  for (let h = startMin / 60; h <= endMin / 60; h++) hours.push(h)

  return (
    <div aria-hidden className="relative px-6 pt-1 pb-2 @max-xl:hidden">
      <div className="relative h-5 text-[11px] font-medium text-muted-foreground">
        {hours.map((h) => (
          <span
            key={h}
            className={cn(
              'absolute top-0 -translate-x-1/2 tabular-nums',
              // Every other hour when the panel is narrow — the labels would touch.
              h % 2 === 1 && '@max-3xl:hidden'
            )}
            style={{ left: `${pct(h * 60)}%` }}
          >
            {String(h % 24).padStart(2, '0')}h
          </span>
        ))}
      </div>

      <div className="relative h-9 overflow-hidden rounded-lg bg-muted">
        {hours.slice(1, -1).map((h) => (
          <span
            key={h}
            className="absolute inset-y-0 w-px bg-foreground/[0.06]"
            style={{ left: `${pct(h * 60)}%` }}
          />
        ))}

        {events.map((block) => {
          const { item } = block
          if (item.kind !== 'event') return null
          const color = resolveEventType(eventTypes, item.event.type).color
          return (
            <Tooltip key={`${item.id}-${block.segment.dayKey}`}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => onOpen(item)}
                  className="absolute rounded-[5px] transition-[filter] hover:brightness-110"
                  style={{
                    left: `${block.topPct}%`,
                    width: `${block.heightPct}%`,
                    top: `calc(${block.leftPct}% + 4px)`,
                    height: `calc(${block.widthPct}% - 8px)`,
                    backgroundColor: color,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">
                  {timeOf(block.startMin)}–{timeOf(block.endMin)} · {item.title}
                </p>
                <p className="opacity-80">{itemSummary(item, eventTypes)}</p>
              </TooltipContent>
            </Tooltip>
          )
        })}

        {pins.map((segment) => {
          const { item } = segment
          const done = item.kind === 'task' && item.done
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => onOpen(item)}
                  className={cn(
                    'absolute top-1/2 z-[1] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-info',
                    done ? 'bg-info' : 'bg-card'
                  )}
                  style={{ left: `${pct(segmentMinutes(segment).startMin)}%` }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">
                  {format(parseISO(item.start_at), 'HH:mm')} · {item.title}
                </p>
                <p className="opacity-80">{done ? 'Tarefa concluída' : 'Tarefa'}</p>
              </TooltipContent>
            </Tooltip>
          )
        })}

        {pastPct > 0 && (
          <span
            className="pointer-events-none absolute inset-y-0 left-0 z-[2] bg-card/55"
            style={{ width: `${pastPct}%` }}
          />
        )}
      </div>

      {showNow && (
        <span
          className="pointer-events-none absolute top-5 bottom-1 z-[3] w-0.5 -translate-x-1/2 rounded-full bg-destructive"
          style={{ left: `calc(1.5rem + (100% - 3rem) * ${pct(nowMin) / 100})` }}
        >
          <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-destructive" />
        </span>
      )}
    </div>
  )
}
