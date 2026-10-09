'use client'

import { useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { format, isToday, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveEventType } from '@/types/event.types'
import type { EventTypeRecord } from '@/types/event.types'
import { layoutDayEvents, segmentMinutes, type PositionedEvent } from '../utils/dayLayout'
import {
  belongsToAllDayStrip,
  compareDaySegments,
  eventRangeLabel,
  segmentMarker,
  type DaySegment,
} from '../utils/daySpan'
import { agendaItemWhenLabel, type AgendaItem, type TaskAgendaItem } from '../utils/agendaItem'
import type {
  ChipDragSource,
  DayDropZone,
  GridDragSource,
  GridDropZone,
  ResizeDragSource,
} from '../utils/dragMove'
import type { MinuteRange } from '../utils/dragMove'
import { useCreateRange } from '../hooks/useCreateRange'
import {
  isDayHighlighted,
  useAgendaDrag,
  useAgendaItemDrag,
  useAgendaResizeDrag,
  type AgendaDragPreview,
} from '../hooks/useAgendaDrag'
import { AgendaTaskCheck } from './AgendaTaskCheck'

/** Minutos do dia → "HH:mm". 1440 é meia-noite do dia seguinte. */
function formatMinutes(total: number): string {
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Altura de uma hora, em px. Define a escala inteira da grade. */
const HOUR_HEIGHT = 48
const TOTAL_HEIGHT = HOUR_HEIGHT * 24
const HOURS = Array.from({ length: 24 }, (_, h) => h)

/** Janela fixa de 24h: aqui a grade rola, então não há motivo para comprimir
 * o dia — diferente da célula do mês, que tem altura fechada. */
const FULL_DAY = { startMin: 0, endMin: 24 * 60, spanMin: 24 * 60 }

/**
 * Piso de altura: exatamente 15 minutos nesta escala (12px).
 *
 * Amarrado ao menor intervalo que alguém agenda de fato. Um piso maior
 * esticaria os blocos de 15 min e faria 30 min deixar de ser o dobro deles —
 * assim, tudo a partir de um quarto de hora é rigorosamente proporcional, e só
 * o que for menor ganha altura emprestada para continuar clicável.
 */
const MIN_HEIGHT_PCT = (HOUR_HEIGHT / 4 / TOTAL_HEIGHT) * 100

interface TimeGridProps {
  days: Date[]
  getItemsForDay: (day: Date) => DaySegment[]
  eventTypes: Map<string, EventTypeRecord>
  /** Clique num espaço vazio cria evento ou tarefa naquele dia e hora. */
  onSlotClick: (day: Date, hour: number) => void
  /** Arrastar no vazio de uma coluna cria com início e término. Ausente sem
   * permissão de criar. */
  onRangeSelect?: (day: Date, range: MinuteRange) => void
  onItemClick: (item: AgendaItem) => void
  /** Ausente sem permissão de alterar tarefas. */
  onToggleTask?: (item: TaskAgendaItem) => void
  /** Pode arrastar este item para outro dia ou horário? Ausente: nada se move. */
  canDragItem?: (item: AgendaItem) => boolean
}

/** Linha vermelha da hora atual, como no Google Calendar. */
function NowIndicator({ days }: { days: Date[] }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const columnIndex = days.findIndex((d) => isSameDay(d, now))
  if (columnIndex === -1) return null

  const top = ((now.getHours() * 60 + now.getMinutes()) / (24 * 60)) * TOTAL_HEIGHT
  const width = 100 / days.length

  return (
    <div
      className="absolute z-20 pointer-events-none flex items-center"
      style={{ top, left: `${columnIndex * width}%`, width: `${width}%` }}
    >
      <span className="h-2 w-2 -ml-1 rounded-full bg-destructive shrink-0" />
      <span className="h-px flex-1 bg-destructive" />
    </div>
  )
}

/** Item na faixa "Dia todo": dia inteiro, eventos de 24h+ e tarefas sem hora. */
function AllDayChip({
  segment,
  eventTypes,
  draggable,
  onItemClick,
  onToggleTask,
}: {
  segment: DaySegment
  eventTypes: Map<string, EventTypeRecord>
  draggable: boolean
  onItemClick: (item: AgendaItem) => void
  onToggleTask?: (item: TaskAgendaItem) => void
}) {
  const item = segment.item
  const dragSource: ChipDragSource = { type: 'agenda-item', origin: 'chip', segment }
  const { setNodeRef, listeners, dragClasses } = useAgendaItemDrag(dragSource, draggable)

  if (item.kind === 'task') {
    return (
      // div: o círculo de concluir é um botão, e botão dentro de botão não vale.
      <div
        ref={setNodeRef}
        {...listeners}
        role="button"
        tabIndex={0}
        onClick={() => onItemClick(item)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          onItemClick(item)
        }}
        title={`Tarefa · ${agendaItemWhenLabel(item)} · ${item.title}`}
        className={cn(
          'flex min-w-0 items-center gap-1 rounded border border-info/40 bg-info/10 px-1.5 py-1 text-left text-info hover:bg-info/15 transition-colors cursor-pointer',
          item.done && 'opacity-60',
          dragClasses
        )}
      >
        <AgendaTaskCheck item={item} onToggle={onToggleTask} className="h-3 w-3" />
        <span className={cn('text-[11px] font-medium truncate', item.done && 'line-through')}>
          {item.title}
        </span>
      </div>
    )
  }

  const tipo = resolveEventType(eventTypes, item.event.type)
  // Dia inteiro de um dia só já está na faixa "Dia todo" — repetir o rótulo
  // seria ruído.
  const marker = item.all_day ? null : segmentMarker(segment)

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      type="button"
      onClick={() => onItemClick(item)}
      title={`${eventRangeLabel(item.event)} · ${tipo.label} · ${item.title}`}
      className={cn(
        // Sem w-full: esticado pelo flex-col, a margem negativa alarga o botão
        // em vez de só deslocá-lo.
        'flex min-w-0 items-center gap-1 rounded px-1.5 py-1 text-left hover:brightness-95 transition-all',
        // Emendas retas até a borda da coluna: uma barra só.
        !segment.isFirstDay && '-ml-1 rounded-l-none',
        !segment.isLastDay && '-mr-1 rounded-r-none',
        dragClasses
      )}
      style={{ backgroundColor: `${tipo.color}22`, color: tipo.color }}
    >
      {segment.isFirstDay && <Sun className="h-2.5 w-2.5 shrink-0" />}
      {marker && <span className="text-[9px] font-semibold shrink-0">{marker}</span>}
      <span className="text-[11px] font-medium truncate">{item.title}</span>
    </button>
  )
}

/** Bloco posicionado na grade de horas. */
function TimedBlock({
  positioned,
  eventTypes,
  draggable,
  onItemClick,
  onToggleTask,
}: {
  positioned: PositionedEvent
  eventTypes: Map<string, EventTypeRecord>
  draggable: boolean
  onItemClick: (item: AgendaItem) => void
  onToggleTask?: (item: TaskAgendaItem) => void
}) {
  const { segment, item, startMin, endMin, topPct, heightPct, leftPct, widthPct } = positioned
  const heightPx = (heightPct / 100) * TOTAL_HEIGHT
  const compact = heightPx < 34
  const position = {
    top: `${topPct}%`,
    height: `${heightPct}%`,
    left: `calc(${leftPct}% + 2px)`,
    width: `calc(${widthPct}% - 4px)`,
  }

  const dragSource: GridDragSource = {
    type: 'agenda-item',
    origin: 'grid',
    segment,
    topMin: startMin,
    heightMin: endMin - startMin,
  }
  const { setNodeRef, listeners, dragClasses } = useAgendaItemDrag(dragSource, draggable)

  if (item.kind === 'task') {
    // Tarefa marca um momento: uma linha só, com o círculo de concluir.
    return (
      <div
        ref={setNodeRef}
        {...listeners}
        role="button"
        tabIndex={0}
        onClick={() => onItemClick(item)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          onItemClick(item)
        }}
        title={`Tarefa · ${agendaItemWhenLabel(item)} · ${item.title}`}
        className={cn(
          'absolute z-10 flex items-start gap-1 rounded border border-info/40 bg-card px-1.5 py-0.5 text-left text-info overflow-hidden shadow-sm hover:bg-info/10 transition-colors cursor-pointer',
          item.done && 'opacity-60',
          dragClasses
        )}
        style={position}
      >
        <AgendaTaskCheck item={item} onToggle={onToggleTask} className="h-3 w-3 mt-px" />
        <span className="text-[9px] font-semibold shrink-0 mt-px">{formatMinutes(startMin)}</span>
        <span
          className={cn('text-[10px] font-medium leading-tight truncate', item.done && 'line-through')}
        >
          {item.title}
        </span>
      </div>
    )
  }

  const tipo = resolveEventType(eventTypes, item.event.type)
  // Pedaço de um evento que atravessa a meia-noite: o rótulo mostra o horário
  // real dele, não o recorte da coluna.
  const crossesMidnight = !(segment.isFirstDay && segment.isLastDay)
  const startLabel = crossesMidnight
    ? format(new Date(item.start_at), 'HH:mm')
    : formatMinutes(startMin)
  const rangeLabel = crossesMidnight
    ? `${startLabel} – ${format(new Date(item.end_at), 'HH:mm')}`
    : `${startLabel} – ${formatMinutes(endMin)}`

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      type="button"
      onClick={() => onItemClick(item)}
      title={`${eventRangeLabel(item.event)} · ${tipo.label} · ${item.title}`}
      className={cn(
        'group absolute z-10 rounded px-1.5 text-left text-white overflow-hidden shadow-sm hover:opacity-90 transition-opacity',
        // Abaixo de ~14px não sobra altura nem para o padding.
        heightPx < 16 ? 'py-0 leading-none' : 'py-0.5',
        dragClasses
      )}
      style={{ ...position, backgroundColor: tipo.color }}
    >
      {compact ? (
        // Sem altura para duas linhas: hora e título na mesma.
        <span className="flex items-baseline gap-1 min-w-0">
          <span className="text-[9px] font-semibold opacity-90 shrink-0">{startLabel}</span>
          <span className="text-[10px] leading-tight truncate">{item.title}</span>
        </span>
      ) : (
        <>
          <span className="block text-[11px] font-medium leading-tight truncate">
            {item.title}
          </span>
          {/* O término exibido é o mesmo que o bloco desenha: sem término
              informado, a hora implícita. */}
          <span className="block text-[9px] opacity-90 leading-tight">{rangeLabel}</span>
        </>
      )}
      {/* O término está no pedaço do último dia. Bloco baixo não ganha alça:
          não sobra onde pegar para mover sem pegar a alça por engano. */}
      {draggable && segment.isLastDay && heightPx >= RESIZE_MIN_HEIGHT_PX && (
        <ResizeHandle segment={segment} startMin={startMin} endMin={endMin} />
      )}
    </button>
  )
}

/** Altura mínima de um bloco para ter a alça de redimensionar. */
const RESIZE_MIN_HEIGHT_PX = 24

/**
 * Alça na borda de baixo de um evento: arrastar muda o término.
 *
 * Fica dentro do bloco, e o dnd-kit dá o arraste a quem recebe o mousedown
 * primeiro — a alça, que está mais por dentro. `span`: um botão não pode ter
 * `div` dentro.
 */
function ResizeHandle({
  segment,
  startMin,
  endMin,
}: {
  segment: DaySegment
  startMin: number
  endMin: number
}) {
  const source: ResizeDragSource = { type: 'agenda-resize', segment, startMin, endMin }
  const { setNodeRef, listeners } = useAgendaResizeDrag(source)

  return (
    <span
      ref={setNodeRef}
      {...listeners}
      aria-hidden
      className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize items-end justify-center pb-0.5 opacity-0 transition-opacity group-hover:opacity-100"
    >
      <span className="h-0.5 w-4 rounded-full bg-white/80" />
    </span>
  )
}

/** Onde o item arrastado vai cair: encaixado no passo de 15 min, com o novo
 * horário escrito. Não recebe o mouse — o alvo continua sendo a coluna. */
function DragGhost({
  preview,
  eventTypes,
}: {
  preview: Extract<AgendaDragPreview, { kind: 'grid' }>
  eventTypes: Map<string, EventTypeRecord>
}) {
  const { item, topMin, heightMin, label } = preview
  const position = {
    top: `${(topMin / FULL_DAY.spanMin) * 100}%`,
    height: `${Math.max((heightMin / FULL_DAY.spanMin) * 100, MIN_HEIGHT_PCT)}%`,
  }
  const color = item.kind === 'event' ? resolveEventType(eventTypes, item.event.type).color : null

  return (
    <div
      aria-hidden
      className={cn(
        'absolute inset-x-0.5 z-20 pointer-events-none overflow-hidden rounded border-2 border-dashed px-1.5 py-0.5 shadow-md',
        !color && 'border-info bg-info/15 text-info'
      )}
      style={color ? { ...position, borderColor: color, backgroundColor: `${color}33`, color } : position}
    >
      <span className="block text-[10px] font-semibold leading-tight">{label}</span>
      {heightMin >= 30 && (
        <span className="block text-[10px] leading-tight truncate">{item.title}</span>
      )}
    </div>
  )
}

/** Faixa sendo desenhada para criar um evento, com o intervalo escrito. */
function CreateRangeGhost({ range }: { range: MinuteRange }) {
  return (
    <div
      aria-hidden
      className="absolute inset-x-0.5 z-20 pointer-events-none overflow-hidden rounded border border-primary/60 bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
      style={{
        top: `${(range.startMin / FULL_DAY.spanMin) * 100}%`,
        height: `${((range.endMin - range.startMin) / FULL_DAY.spanMin) * 100}%`,
      }}
    >
      {formatMinutes(range.startMin)} – {formatMinutes(range.endMin)}
    </div>
  )
}

/** Coluna de um dia: cria no clique ou arrastando no vazio, recebe o item
 * arrastado e mostra a sombra. */
function DayColumn({
  day,
  segments,
  eventTypes,
  canDragItem,
  onSlotClick,
  onRangeSelect,
  onItemClick,
  onToggleTask,
}: {
  day: Date
  segments: DaySegment[]
  eventTypes: Map<string, EventTypeRecord>
  canDragItem?: (item: AgendaItem) => boolean
  onSlotClick: (day: Date, hour: number) => void
  onRangeSelect?: (day: Date, range: MinuteRange) => void
  onItemClick: (item: AgendaItem) => void
  onToggleTask?: (item: TaskAgendaItem) => void
}) {
  const dayKey = format(day, 'yyyy-MM-dd')
  const columnRef = useRef<HTMLDivElement | null>(null)
  const getTop = () => columnRef.current?.getBoundingClientRect().top ?? 0
  const dropZone: GridDropZone = { type: 'grid-day', day, hourHeight: HOUR_HEIGHT, getTop }
  const { setNodeRef } = useDroppable({ id: `grid-day:${dayKey}`, data: dropZone })
  const { preview } = useAgendaDrag()
  const { range, handleMouseDown } = useCreateRange({
    getTop,
    hourHeight: HOUR_HEIGHT,
    onSelect: onRangeSelect ? (selected) => onRangeSelect(day, selected) : undefined,
  })

  const { timed } = layoutDayEvents(segments, FULL_DAY, { minHeightPct: MIN_HEIGHT_PCT })

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        columnRef.current = node
      }}
      className={cn('relative flex-1 min-w-0 border-r last:border-r-0', isToday(day) && 'bg-primary/[0.03]')}
    >
      {/* Alvos de clique por hora — e o começo de uma faixa arrastada */}
      {HOURS.map((h) => (
        <button
          key={h}
          type="button"
          aria-label={`Criar em ${format(day, "dd 'de' MMMM", { locale: ptBR })} às ${h}h`}
          onMouseDown={handleMouseDown}
          onClick={() => onSlotClick(day, h)}
          className="absolute inset-x-0 hover:bg-accent/30 transition-colors"
          style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
        />
      ))}

      {timed.map((positioned) => (
        <TimedBlock
          key={positioned.item.id}
          positioned={positioned}
          eventTypes={eventTypes}
          draggable={canDragItem?.(positioned.item) ?? false}
          onItemClick={onItemClick}
          onToggleTask={onToggleTask}
        />
      ))}

      {preview?.kind === 'grid' && preview.dayKey === dayKey && (
        <DragGhost preview={preview} eventTypes={eventTypes} />
      )}
      {range && <CreateRangeGhost range={range} />}
    </div>
  )
}

/** Célula de um dia na faixa "Dia todo": recebe o item arrastado. */
function StripCell({ day, children }: { day: Date; children: React.ReactNode }) {
  const dayKey = format(day, 'yyyy-MM-dd')
  const dropZone: DayDropZone = { type: 'day-cell', day, area: 'strip' }
  const { setNodeRef } = useDroppable({ id: `strip:${dayKey}`, data: dropZone })
  const { preview } = useAgendaDrag()

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 min-w-0 min-h-7 p-1 flex flex-col gap-1 border-r last:border-r-0 transition-colors',
        isDayHighlighted(preview, 'strip', dayKey) && 'bg-primary/10 ring-2 ring-inset ring-primary/40'
      )}
    >
      {children}
    </div>
  )
}

export function TimeGrid({
  days,
  getItemsForDay,
  eventTypes,
  onSlotClick,
  onRangeSelect,
  onItemClick,
  onToggleTask,
  canDragItem,
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Abre na altura do primeiro item do período — ou às 7h quando não há
  // nenhum. Começar à meia-noite deixaria a tela vazia na maioria dos dias.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const starts = days
      .flatMap(getItemsForDay)
      .filter((segment) => !belongsToAllDayStrip(segment.item))
      .map((segment) => Math.floor(segmentMinutes(segment).startMin / 60))

    const firstHour = starts.length > 0 ? Math.min(...starts) : 7
    container.scrollTop = Math.max(0, (firstHour - 1) * HOUR_HEIGHT)
    // Só ao trocar de período — rolar de novo a cada refetch tiraria o usuário
    // de onde ele estava.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]?.toISOString(), days.length])

  // Dia inteiro, eventos de 24h+ e tarefas sem hora — repetidos em cada dia
  // que cobrem.
  const allDayByColumn = days.map((day) =>
    getItemsForDay(day)
      .filter((segment) => belongsToAllDayStrip(segment.item))
      .sort(compareDaySegments)
  )
  const hasAllDay = allDayByColumn.some((list) => list.length > 0)

  return (
    <div className="rounded-xl border overflow-hidden">
      {/*
        Cabeçalho, faixa de dia todo e eixo de horas vivem no MESMO container
        rolável, com os dois primeiros fixos no topo. Antes o cabeçalho ficava
        fora dele: como só o eixo tinha barra de rolagem, as colunas de cima
        ficavam mais largas que as de baixo pela largura da barra. Dentro do
        mesmo container, todos compartilham a mesma largura útil — e de quebra
        os dias continuam visíveis ao rolar, como no Google Calendar.
      */}
      {/* select-none: arrastar um bloco não pode sair selecionando o texto da grade. */}
      <div ref={scrollRef} className="overflow-y-auto max-h-[620px] select-none">
        <div className="sticky top-0 z-30 bg-card">
          {/* Cabeçalho dos dias */}
          <div className="flex border-b bg-muted/30">
            <div className="w-14 shrink-0 border-r" />
            {days.map((day) => {
              const today = isToday(day)
              return (
                <div key={day.toISOString()} className="flex-1 min-w-0 py-2 text-center">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    {format(day, 'EEE', { locale: ptBR })}
                  </p>
                  <p
                    className={cn(
                      'mx-auto mt-0.5 h-7 w-7 flex items-center justify-center rounded-full text-sm font-semibold',
                      today ? 'bg-primary text-primary-foreground' : 'text-foreground'
                    )}
                  >
                    {format(day, 'd')}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Faixa de dia inteiro — fora do eixo de horas, como no Google
              Calendar. Fica mesmo vazia quando dá para arrastar: é o alvo
              para tornar um item "dia inteiro", e surgir no meio do arraste
              empurraria a grade para baixo do ponteiro. */}
          {(hasAllDay || canDragItem) && (
            <div className="flex border-b bg-card">
              <div className="w-14 shrink-0 border-r px-1 py-1.5 text-right">
                <span className="text-[9px] font-medium text-muted-foreground uppercase">
                  Dia todo
                </span>
              </div>
              {allDayByColumn.map((list, i) => (
                <StripCell key={days[i].toISOString()} day={days[i]}>
                  {list.map((segment) => (
                    <AllDayChip
                      key={segment.item.id}
                      segment={segment}
                      eventTypes={eventTypes}
                      draggable={canDragItem?.(segment.item) ?? false}
                      onItemClick={onItemClick}
                      onToggleTask={onToggleTask}
                    />
                  ))}
                </StripCell>
              ))}
            </div>
          )}
        </div>

        <div className="flex" style={{ height: TOTAL_HEIGHT }}>
          {/* Régua das horas */}
          <div className="w-14 shrink-0 border-r relative">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
                style={{ top: h * HOUR_HEIGHT }}
              >
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          {/* Colunas dos dias */}
          <div className="relative flex-1 min-w-0 flex">
            {/* Linhas de hora, atrás de tudo */}
            <div className="absolute inset-0 pointer-events-none">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-border/60"
                  style={{ top: h * HOUR_HEIGHT }}
                />
              ))}
            </div>

            {days.map((day) => (
              <DayColumn
                key={day.toISOString()}
                day={day}
                segments={getItemsForDay(day)}
                eventTypes={eventTypes}
                canDragItem={canDragItem}
                onSlotClick={onSlotClick}
                onRangeSelect={onRangeSelect}
                onItemClick={onItemClick}
                onToggleTask={onToggleTask}
              />
            ))}

            <NowIndicator days={days} />
          </div>
        </div>
      </div>
    </div>
  )
}
