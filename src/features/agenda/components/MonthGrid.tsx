'use client'

import { useDroppable } from '@dnd-kit/core'
import { format, isSameMonth, isToday, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { resolveEventType } from '@/types/event.types'
import type { EventTypeRecord } from '@/types/event.types'
import {
  compareDaySegments,
  eventRangeLabel,
  segmentMarker,
  type DaySegment,
} from '../utils/daySpan'
import {
  agendaItemWhenLabel,
  type AgendaItem,
  type EventAgendaItem,
  type TaskAgendaItem,
} from '../utils/agendaItem'
import type { ChipDragSource, DayDropZone } from '../utils/dragMove'
import { isDayHighlighted, useAgendaDrag, useAgendaItemDrag } from '../hooks/useAgendaDrag'
import { AgendaTaskCheck } from './AgendaTaskCheck'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Quantos itens cabem na célula antes do "+N mais". */
const MAX_VISIBLE = 4

interface MonthGridProps {
  days: Date[]
  currentDate: Date
  getItemsForDay: (day: Date) => DaySegment[]
  eventTypes: Map<string, EventTypeRecord>
  onDayClick: (day: Date) => void
  onItemClick: (item: AgendaItem) => void
  /** Ausente sem permissão de alterar tarefas. */
  onToggleTask?: (item: TaskAgendaItem) => void
  /** Pode arrastar este item para outro dia? Ausente: nada se move. */
  canDragItem?: (item: AgendaItem) => boolean
}

function EventChip({
  segment,
  item,
  eventTypes,
  draggable,
  onItemClick,
}: {
  segment: DaySegment
  item: EventAgendaItem
  eventTypes: Map<string, EventTypeRecord>
  draggable: boolean
  onItemClick: (item: AgendaItem) => void
}) {
  const tipo = resolveEventType(eventTypes, item.event.type)
  const marker = segmentMarker(segment)
  const dragSource: ChipDragSource = { type: 'agenda-item', origin: 'chip', segment }
  const { setNodeRef, listeners, dragClasses } = useAgendaItemDrag(dragSource, draggable)

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onItemClick(item)
      }}
      title={`${eventRangeLabel(item.event)} · ${tipo.label} · ${item.title}`}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-left text-white hover:opacity-90 transition-opacity',
        // Emendas retas até a borda: lido como uma barra só atravessando os
        // dias, como no Google Agenda.
        !segment.isFirstDay && '-ml-1 rounded-l-none pl-2',
        !segment.isLastDay && '-mr-1 rounded-r-none',
        dragClasses
      )}
      style={{ backgroundColor: tipo.color }}
    >
      {marker && <span className="text-[9px] font-semibold opacity-90 shrink-0">{marker}</span>}
      <span className="text-[10px] leading-tight truncate">{item.title}</span>
    </button>
  )
}

/** Tarefa: contorno em vez de preenchimento, com o círculo de concluir — dá
 * para distinguir de um evento sem ler. */
function TaskChip({
  segment,
  item,
  draggable,
  onItemClick,
  onToggleTask,
}: {
  segment: DaySegment
  item: TaskAgendaItem
  draggable: boolean
  onItemClick: (item: AgendaItem) => void
  onToggleTask?: (item: TaskAgendaItem) => void
}) {
  const dragSource: ChipDragSource = { type: 'agenda-item', origin: 'chip', segment }
  const { setNodeRef, listeners, dragClasses } = useAgendaItemDrag(dragSource, draggable)

  return (
    // div, não button: o círculo de concluir é um botão próprio, e botão
    // dentro de botão não é HTML válido.
    <div
      ref={setNodeRef}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        onItemClick(item)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        e.stopPropagation()
        onItemClick(item)
      }}
      title={`Tarefa · ${agendaItemWhenLabel(item)} · ${item.title}`}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded border border-info/40 bg-info/10 px-1 py-0.5 text-left text-info hover:bg-info/15 transition-colors cursor-pointer',
        item.done && 'opacity-60',
        dragClasses
      )}
    >
      <AgendaTaskCheck item={item} onToggle={onToggleTask} className="h-3 w-3" />
      {!item.all_day && (
        <span className="text-[9px] font-semibold shrink-0">
          {format(parseISO(item.start_at), 'HH:mm')}
        </span>
      )}
      <span className={cn('text-[10px] leading-tight truncate', item.done && 'line-through')}>
        {item.title}
      </span>
    </div>
  )
}

function DayCell({
  day,
  segments,
  currentDate,
  eventTypes,
  onDayClick,
  onItemClick,
  onToggleTask,
  canDragItem,
}: {
  day: Date
  segments: DaySegment[]
  currentDate: Date
  eventTypes: Map<string, EventTypeRecord>
  onDayClick: (day: Date) => void
  onItemClick: (item: AgendaItem) => void
  onToggleTask?: (item: TaskAgendaItem) => void
  canDragItem?: (item: AgendaItem) => boolean
}) {
  const isCurrentMonth = isSameMonth(day, currentDate)
  const isTodayDay = isToday(day)

  const dayKey = format(day, 'yyyy-MM-dd')
  const dropZone: DayDropZone = { type: 'day-cell', day, area: 'month' }
  const { setNodeRef } = useDroppable({ id: `day:${dayKey}`, data: dropZone })
  const { preview } = useAgendaDrag()
  const highlighted = isDayHighlighted(preview, 'month', dayKey)

  // Vários dias primeiro, depois dia inteiro, depois por horário: a mesma
  // ordem em todas as células mantém a barra de vários dias na mesma altura.
  const ordered = [...segments].sort(compareDaySegments)

  const visible = ordered.slice(0, MAX_VISIBLE)
  const hidden = ordered.length - visible.length

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      aria-label={`Criar em ${format(day, "dd 'de' MMMM", { locale: ptBR })}`}
      onClick={() => onDayClick(day)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onDayClick(day)
      }}
      className={cn(
        'flex flex-col h-[148px] border-b border-r transition-colors cursor-pointer select-none',
        !isCurrentMonth && 'bg-muted/15',
        isTodayDay && 'bg-primary/5',
        'hover:bg-accent/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        // Todos os dias que o item vai ocupar, não só o do ponteiro.
        highlighted && 'bg-primary/10 ring-2 ring-inset ring-primary/40'
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

      {/* Padding, não margem: a barra de vários dias usa margem negativa para
          encostar na borda da célula, e o overflow-hidden só recorta o que
          passa do padding. */}
      <div className="flex-1 min-h-0 px-1 pb-1 pt-0.5 flex flex-col gap-0.5 overflow-hidden">
        {visible.map((segment) =>
          segment.item.kind === 'event' ? (
            <EventChip
              key={segment.item.id}
              segment={segment}
              item={segment.item}
              eventTypes={eventTypes}
              draggable={canDragItem?.(segment.item) ?? false}
              onItemClick={onItemClick}
            />
          ) : (
            <TaskChip
              key={segment.item.id}
              segment={segment}
              item={segment.item}
              draggable={canDragItem?.(segment.item) ?? false}
              onItemClick={onItemClick}
              onToggleTask={onToggleTask}
            />
          )
        )}

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
  getItemsForDay,
  eventTypes,
  onDayClick,
  onItemClick,
  onToggleTask,
  canDragItem,
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
        {days.map((day) => (
          <DayCell
            key={day.toISOString()}
            day={day}
            segments={getItemsForDay(day)}
            currentDate={currentDate}
            eventTypes={eventTypes}
            onDayClick={onDayClick}
            onItemClick={onItemClick}
            onToggleTask={onToggleTask}
            canDragItem={canDragItem}
          />
        ))}
      </div>
    </div>
  )
}
