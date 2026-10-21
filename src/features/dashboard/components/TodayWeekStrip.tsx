'use client'

import { useRef, useState } from 'react'
import { format, isSameDay } from 'date-fns'
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
  segmentsByDay: Map<string, DaySegment[]>
  eventTypes: Map<string, EventTypeRecord>
  /** The days are still the previous window's, while the new one loads. */
  isStale?: boolean
}

interface StripDrag {
  pointerId: number
  startX: number
  /** Days already shifted by this drag. */
  shifted: number
  moved: boolean
}

/** Movement below this is a click on a day, not a drag. */
const DRAG_THRESHOLD_PX = 6

/** Seven days, each with up to three dots of what it holds. Picking a day shows
 * it in the ruler and the list below; dragging the strip moves the days. */
export function TodayWeekStrip({
  days,
  today,
  selectedKey,
  onSelect,
  onShift,
  segmentsByDay,
  eventTypes,
  isStale = false,
}: TodayWeekStripProps) {
  const dragRef = useRef<StripDrag | null>(null)
  // The click that ends a drag must not pick the day under the pointer.
  const swallowClickRef = useRef(false)
  const [dragging, setDragging] = useState(false)

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    swallowClickRef.current = false
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, shifted: 0, moved: false }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    if (!drag.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return
      drag.moved = true
      setDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    // The days slide with the pointer: dragging left brings later days in.
    const cellWidth = event.currentTarget.offsetWidth / days.length
    const steps = Math.round(-dx / cellWidth)
    if (steps !== drag.shifted) {
      onShift(steps - drag.shifted)
      drag.shifted = steps
    }
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    swallowClickRef.current = drag.moved
    dragRef.current = null
    setDragging(false)
  }

  function handleClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (!swallowClickRef.current) return
    swallowClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  const first = days[0]
  const last = days[days.length - 1]

  return (
    <div
      role="group"
      aria-label={`Dias de ${rangeLabel(first, last)}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClickCapture={handleClickCapture}
      className={cn(
        'grid touch-pan-y grid-cols-7 gap-1 select-none transition-opacity @3xl:grid-cols-[repeat(7,3.5rem)]',
        dragging && 'cursor-grabbing *:cursor-grabbing',
        isStale && 'opacity-60'
      )}
    >
      {days.map((day) => {
        const key = format(day, 'yyyy-MM-dd')
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
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            aria-label={`${format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}: ${pluralize(items.length, 'item', 'itens')}${hearingNote}`}
            onClick={() => onSelect(key)}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-lg border py-1.5 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
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
        )
      })}
    </div>
  )
}
