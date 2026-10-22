'use client'

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isSameDay,
  parseISO,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Landmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveEventType, type EventTypeRecord } from '@/types/event.types'
import type { AgendaItem } from '@/features/agenda/utils/agendaItem'
import type { DaySegment } from '@/features/agenda/utils/daySpan'
import { pluralize } from '../utils/format'
import { hearingOf, rangeLabel, weekdayShort } from '../utils/today'

const MAX_DOTS = 3

/** Done tasks still sit on their day, but they are not something the day holds. */
export function isOpenItem(item: AgendaItem): boolean {
  return item.kind === 'event' || !item.done
}

function ItemDot({
  item,
  eventTypes,
  onAccent,
}: {
  item: AgendaItem
  eventTypes: Map<string, EventTypeRecord>
  onAccent: boolean
}) {
  // On the selected (indigo) day a hairline keeps the dots apart from it.
  const ring = onAccent && 'shadow-[0_0_0_1.5px_rgb(255_255_255/0.85)]'
  // A hearing is drawn as its icon, not a dot: among three dots of colour it
  // would be lost, and it is the commitment of the week that can't be moved.
  if (hearingOf(item)) {
    return (
      <Landmark
        aria-hidden
        className={cn('size-2.5', onAccent ? 'text-primary-foreground' : 'text-chart-2')}
      />
    )
  }
  if (item.kind === 'task') {
    return <span className={cn('size-1.5 rounded-full border border-info bg-card', ring)} />
  }
  // A fatal deadline outranks the type colour: it is what the dot must warn about.
  const color = item.event.fatal_deadline
    ? 'var(--destructive)'
    : resolveEventType(eventTypes, item.event.type).color
  return <span className={cn('size-1.5 rounded-full', ring)} style={{ backgroundColor: color }} />
}

interface TodayWeekStripProps {
  days: Date[]
  today: Date
  selectedKey: string
  onSelect: (dayKey: string) => void
  /** Dragging the strip sideways moves it by whole days. */
  onShift: (days: number) => void
  /** Must cover the days beside the strip too (`STRIP_BUFFER_DAYS` each side):
   * they slide in while it is dragged. */
  segmentsByDay: Map<string, DaySegment[]>
  eventTypes: Map<string, EventTypeRecord>
}

interface StripDrag {
  pointerId: number
  startX: number
  /** Where the track was when the drag took over. */
  baseOffset: number
  moved: boolean
  lastX: number
  lastTime: number
  /** px/ms, smoothed — a flick carries the strip past where it was let go. */
  velocity: number
}

/** Days rendered past each edge, so a drag never shows an empty track. It is
 * also how far one drag or flick can go. */
export const STRIP_BUFFER_DAYS = 7
/** Movement below this is a click on a day, not a drag. */
const DRAG_THRESHOLD_PX = 6
const SETTLE_MS = 320
const SETTLE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** How far ahead a flick is projected when picking the day to snap to. */
const FLICK_PROJECTION_MS = 90
/** A trackpad swipe sends a burst of wheel events; it snaps once they stop. */
const WHEEL_IDLE_MS = 140
const WHEEL_LINE_PX = 16

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Seven days, each with up to three dots of what it holds. Picking a day shows
 * it in the ruler and the list below.
 *
 * The days sit on a track three strips wide — a week of buffer on each side —
 * so it slides under the pointer (drag, flick, trackpad swipe) and snaps to a
 * whole day when let go. When the days change from outside (arrows, the
 * calendar) the track starts where the old days were and glides to the new
 * ones. The offset is written straight to the DOM: a render per pointer move
 * would stutter. */
export function TodayWeekStrip({
  days,
  today,
  selectedKey,
  onSelect,
  onShift,
  segmentsByDay,
  eventTypes,
}: TodayWeekStripProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<StripDrag | null>(null)
  // The click that ends a drag must not pick the day under the pointer.
  const swallowClickRef = useRef(false)
  // Current offset of the track from its resting place, in px.
  const offsetRef = useRef(0)
  // Days a settle animation is heading to, handed to `onShift` when it ends.
  const pendingShiftRef = useRef<number | null>(null)
  // After a shift this strip asked for, the offset that keeps the track still.
  const restOffsetRef = useRef<number | null>(null)
  const settleTimerRef = useRef<number | undefined>(undefined)
  const wheelTimerRef = useRef<number | undefined>(undefined)
  const [dragging, setDragging] = useState(false)

  const first = days[0]
  const last = days[days.length - 1]
  const firstKey = format(first, 'yyyy-MM-dd')
  const lastKey = format(last, 'yyyy-MM-dd')
  const track = eachDayOfInterval({
    start: addDays(first, -STRIP_BUFFER_DAYS),
    end: addDays(last, STRIP_BUFFER_DAYS),
  })

  function cellWidth(): number {
    return (viewportRef.current?.offsetWidth ?? 0) / days.length
  }

  function clampOffset(offset: number): number {
    const max = STRIP_BUFFER_DAYS * cellWidth()
    return Math.max(-max, Math.min(max, offset))
  }

  function place(offset: number, animate: boolean) {
    const element = trackRef.current
    if (!element) return
    offsetRef.current = offset
    element.style.transition = animate ? `transform ${SETTLE_MS}ms ${SETTLE_EASING}` : 'none'
    element.style.transform = `translateX(${offset}px)`
  }

  /** Where the track is on screen right now, mid-animation included. */
  function visualOffset(): number {
    const element = trackRef.current
    if (!element) return 0
    return new DOMMatrixReadOnly(getComputedStyle(element).transform).m41
  }

  function commitPending() {
    window.clearTimeout(settleTimerRef.current)
    const pending = pendingShiftRef.current
    if (pending === null) return
    pendingShiftRef.current = null
    restOffsetRef.current = offsetRef.current + pending * cellWidth()
    onShift(pending)
  }

  /** Snaps to the nearest whole day, then shifts the days by it. */
  function settle(projectedOffset: number) {
    const cell = cellWidth()
    if (cell === 0) return
    const steps = Math.round(-clampOffset(projectedOffset) / cell)
    if (steps === 0) {
      place(0, !prefersReducedMotion())
      return
    }
    pendingShiftRef.current = steps
    if (prefersReducedMotion()) {
      place(-steps * cell, false)
      commitPending()
      return
    }
    place(-steps * cell, true)
    settleTimerRef.current = window.setTimeout(commitPending, SETTLE_MS)
  }

  /** Stops whatever animation is running, keeping the track where it is on
   * screen, and returns that offset — a drag or a swipe goes on from there. */
  function takeOver(): number {
    window.clearTimeout(settleTimerRef.current)
    const current = visualOffset()
    place(current, false)
    const pending = pendingShiftRef.current
    if (pending === null) return current
    // The shift still happens; the offset is just re-expressed from the new days.
    commitPending()
    return current + pending * cellWidth()
  }

  // Runs after every change of days, before paint.
  const handleDaysChanged = useEffectEvent((previousFirst: Date) => {
    const rest = restOffsetRef.current
    if (rest !== null) {
      restOffsetRef.current = null
      place(rest, false)
      return
    }
    const cell = cellWidth()
    const from = visualOffset() + differenceInCalendarDays(first, previousFirst) * cell
    if (prefersReducedMotion() || Math.abs(from) > STRIP_BUFFER_DAYS * cell) {
      place(0, false)
      return
    }
    // FLIP: start where the old days were, then glide to the new ones.
    place(from, false)
    trackRef.current?.getBoundingClientRect()
    place(0, true)
  })

  const previousFirstKeyRef = useRef(firstKey)
  useLayoutEffect(() => {
    const previousKey = previousFirstKeyRef.current
    previousFirstKeyRef.current = firstKey
    if (previousKey !== firstKey) handleDaysChanged(parseISO(previousKey))
  }, [firstKey])

  const handleWheel = useEffectEvent((event: WheelEvent) => {
    // Vertical wheels keep scrolling the page.
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
    event.preventDefault()
    const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaX * WHEEL_LINE_PX : event.deltaX
    place(clampOffset(takeOver() - delta), false)
    window.clearTimeout(wheelTimerRef.current)
    wheelTimerRef.current = window.setTimeout(() => settle(offsetRef.current), WHEEL_IDLE_MS)
  })

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    // Not React's onWheel: it is passive, and the page would scroll sideways too.
    const listener = (event: WheelEvent) => handleWheel(event)
    viewport.addEventListener('wheel', listener, { passive: false })
    return () => {
      viewport.removeEventListener('wheel', listener)
      window.clearTimeout(wheelTimerRef.current)
      window.clearTimeout(settleTimerRef.current)
    }
  }, [])

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    swallowClickRef.current = false
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      baseOffset: 0,
      moved: false,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    if (!drag.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return
      drag.moved = true
      drag.baseOffset = takeOver()
      setDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const elapsed = event.timeStamp - drag.lastTime
    if (elapsed > 0) {
      const instant = (event.clientX - drag.lastX) / elapsed
      drag.velocity = drag.velocity * 0.6 + instant * 0.4
    }
    drag.lastX = event.clientX
    drag.lastTime = event.timeStamp
    place(clampOffset(drag.baseOffset + dx), false)
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    swallowClickRef.current = drag.moved
    if (!drag.moved) return
    setDragging(false)
    // A pause before letting go is not a flick.
    const velocity = event.timeStamp - drag.lastTime > 80 ? 0 : drag.velocity
    settle(offsetRef.current + velocity * FLICK_PROJECTION_MS)
  }

  function handleClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (!swallowClickRef.current) return
    swallowClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div
      ref={viewportRef}
      role="group"
      aria-label={`Dias de ${rangeLabel(first, last)}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClickCapture={handleClickCapture}
      className={cn(
        // `-mx-0.5`: each day has 2px each side, so the edges line up with the row above.
        '-mx-0.5 touch-pan-y overflow-hidden py-0.5 select-none @3xl:w-[calc(7*3.75rem)]',
        dragging && 'cursor-grabbing *:*:*:cursor-grabbing'
      )}
    >
      {/* Three strips wide, the middle one in view. */}
      <div ref={trackRef} className="flex w-[300%] -translate-x-1/3 will-change-transform">
        {track.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const offStrip = key < firstKey || key > lastKey
          // Hearings first, so the cap of three marks never hides one.
          const items = (segmentsByDay.get(key) ?? [])
            .map((s) => s.item)
            .filter(isOpenItem)
            .sort((a, b) => Number(hearingOf(b) !== null) - Number(hearingOf(a) !== null))
          const selected = key === selectedKey
          const isToday = isSameDay(day, today)
          const hearings = items.filter((item) => hearingOf(item) !== null).length
          const hearingNote = hearings > 0 ? `, ${pluralize(hearings, 'audiência', 'audiências')}` : ''

          return (
            // The days off the strip only show while it slides: out of reach of
            // the keyboard and of screen readers.
            <div key={key} inert={offStrip} className="min-w-0 flex-1 px-0.5">
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`${format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}: ${pluralize(items.length, 'item', 'itens')}${hearingNote}`}
                onClick={() => onSelect(key)}
                className={cn(
                  'flex w-full flex-col items-center gap-0.5 rounded-lg border py-1.5 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  selected
                    ? 'border-accent-foreground bg-accent-foreground text-primary-foreground'
                    : 'border-transparent hover:bg-muted/70',
                  !selected && isToday && 'border-accent-foreground/40'
                )}
              >
                <span
                  className={cn(
                    'text-[11px] font-semibold uppercase tracking-wide',
                    selected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                  )}
                >
                  {weekdayShort(day)}
                </span>
                <span
                  className={cn(
                    'text-base leading-tight font-bold tabular-nums',
                    !selected && isToday && 'text-accent-foreground'
                  )}
                >
                  {format(day, 'd')}
                </span>
                {/* `h-2.5`: the hearing icon is a little taller than a dot. */}
                <span className="flex h-2.5 items-center gap-[3px]">
                  {items.slice(0, MAX_DOTS).map((item) => (
                    <ItemDot key={item.id} item={item} eventTypes={eventTypes} onAccent={selected} />
                  ))}
                  {items.length > MAX_DOTS && (
                    <span
                      className={cn(
                        'text-[10px] leading-none font-semibold',
                        selected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                      )}
                    >
                      +{items.length - MAX_DOTS}
                    </span>
                  )}
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
