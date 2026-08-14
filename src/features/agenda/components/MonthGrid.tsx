'use client'

import { format, isSameMonth, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { resolveEventType } from '@/types/event.types'
import type { CalendarEvent, EventTypeRecord } from '@/types/event.types'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Quantos eventos cabem na célula antes do "+N mais". */
const MAX_VISIBLE = 4

interface MonthGridProps {
  days: Date[]
  currentDate: Date
  getEventosForDay: (day: Date) => CalendarEvent[]
  eventTypes: Map<string, EventTypeRecord>
  onDayClick: (day: Date) => void
  onEventClick: (ev: CalendarEvent) => void
}

function DayCell({
  day,
  eventos,
  currentDate,
  eventTypes,
  onDayClick,
  onEventClick,
}: {
  day: Date
  eventos: CalendarEvent[]
  currentDate: Date
  eventTypes: Map<string, EventTypeRecord>
  onDayClick: (day: Date) => void
  onEventClick: (ev: CalendarEvent) => void
}) {
  const isCurrentMonth = isSameMonth(day, currentDate)
  const isTodayDay = isToday(day)

  // Dia todo primeiro, depois os demais em ordem de relógio: é a leitura
  // natural do dia, e o de dia inteiro é o que enquadra todos os outros.
  const ordered = [
    ...eventos.filter((ev) => ev.all_day),
    ...eventos.filter((ev) => !ev.all_day).sort((a, b) => a.start_at.localeCompare(b.start_at)),
  ]

  const visible = ordered.slice(0, MAX_VISIBLE)
  const hidden = ordered.length - visible.length

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Criar evento em ${format(day, "dd 'de' MMMM", { locale: ptBR })}`}
      onClick={() => onDayClick(day)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onDayClick(day)
      }}
      className={cn(
        'flex flex-col h-[148px] border-b border-r transition-colors cursor-pointer select-none',
        !isCurrentMonth && 'bg-muted/15',
        isTodayDay && 'bg-primary/5',
        'hover:bg-accent/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
      )}
    >
      <div className="flex items-center justify-between px-1.5 pt-1.5 shrink-0">
        <div
          className={cn(
            'h-6 w-6 flex items-center justify-center rounded-full text-xs font-medium',
            isTodayDay
              ? 'bg-primary text-primary-foreground'
              : !isCurrentMonth
                ? 'text-muted-foreground/40'
                : 'text-foreground'
          )}
        >
          {format(day, 'd')}
        </div>

      </div>

      {/* Linhas de evento — o de dia todo é apenas o primeiro da lista, com
          "Dia todo" ocupando o lugar do horário. */}
      <div className="flex-1 min-h-0 m-1 mt-0.5 flex flex-col gap-0.5 overflow-hidden">
        {visible.map((ev) => {
          const tipo = resolveEventType(eventTypes, ev.type)
          const marker = ev.all_day ? 'Dia todo' : format(new Date(ev.start_at), 'HH:mm')

          return (
            <button
              key={ev.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEventClick(ev)
              }}
              title={`${marker} · ${tipo.label} · ${ev.title}`}
              className="flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-left text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: tipo.color }}
            >
              <span className="text-[9px] font-semibold opacity-90 shrink-0">{marker}</span>
              <span className="text-[10px] leading-tight truncate">{ev.title}</span>
            </button>
          )
        })}

        {hidden > 0 && (
          <span className="text-[10px] text-muted-foreground pl-1 shrink-0">+{hidden} mais</span>
        )}
      </div>
    </div>
  )
}

export function MonthGrid({
  days,
  currentDate,
  getEventosForDay,
  eventTypes,
  onDayClick,
  onEventClick,
}: MonthGridProps) {
  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-2.5 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day, i) => (
          <DayCell
            key={i}
            day={day}
            eventos={getEventosForDay(day)}
            currentDate={currentDate}
            eventTypes={eventTypes}
            onDayClick={onDayClick}
            onEventClick={onEventClick}
          />
        ))}
      </div>
    </div>
  )
}
