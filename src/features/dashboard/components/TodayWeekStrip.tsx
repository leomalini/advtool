'use client'

import { format, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { resolveEventType, type EventTypeRecord } from '@/types/event.types'
import type { AgendaItem } from '@/features/agenda/utils/agendaItem'
import type { DaySegment } from '@/features/agenda/utils/daySpan'
import { pluralize } from '../utils/format'
import { weekdayShort } from '../utils/today'

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
  segmentsByDay: Map<string, DaySegment[]>
  eventTypes: Map<string, EventTypeRecord>
}

/** The next seven days, each with up to three dots of what it holds. Picking a
 * day shows it in the ruler and the list below. */
export function TodayWeekStrip({
  days,
  today,
  selectedKey,
  onSelect,
  segmentsByDay,
  eventTypes,
}: TodayWeekStripProps) {
  return (
    <div
      role="group"
      aria-label="Próximos 7 dias"
      className="grid grid-cols-7 gap-1 @3xl:grid-cols-[repeat(7,3.5rem)]"
    >
      {days.map((day) => {
        const key = format(day, 'yyyy-MM-dd')
        const items = (segmentsByDay.get(key) ?? []).map((s) => s.item).filter(isOpenItem)
        const selected = key === selectedKey
        const isToday = isSameDay(day, today)

        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            aria-label={`${format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}: ${pluralize(items.length, 'item', 'itens')}`}
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
            <span className="flex h-1.5 items-center gap-[3px]">
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
