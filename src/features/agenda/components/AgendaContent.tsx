'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  addMonths,
  addWeeks,
  addDays,
  min as minDate,
  max as maxDate,
  parseISO,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, AlertCircle, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import { resolveEventType } from '@/types/event.types'
import type { CalendarEvent, EventTypeRecord } from '@/types/event.types'
import { useTasksInRange } from '@/features/tarefas/hooks/useTasks'
import { useToggleTaskDone } from '@/features/tarefas/hooks/useTaskMutations'
import { TaskDetailModal } from '@/features/tarefas/components/TaskDetailModal'
import { useEvents } from '../hooks/useEvents'
import { useEventTypes, useEventTypeMap } from '../hooks/useEventTypes'
import { EventDetailModal } from './EventDetailModal'
import { AgendaCreateDialog, type AgendaCreateTarget } from './AgendaCreateDialog'
import { MonthGrid } from './MonthGrid'
import { TimeGrid } from './TimeGrid'
import { effectiveEnd, indexEventsByDay, type DaySegment } from '../utils/daySpan'
import {
  agendaItemWhenLabel,
  eventToAgendaItem,
  taskToAgendaItem,
  type AgendaItem,
  type TaskAgendaItem,
} from '../utils/agendaItem'

type CalendarView = 'month' | 'week' | 'day'

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: 'month', label: 'Mês' },
  { id: 'week', label: 'Semana' },
  { id: 'day', label: 'Dia' },
]

/** O que a grade mostra — as "agendas" que o Google deixa ligar e desligar. */
interface AgendaVisibility {
  events: boolean
  tasks: boolean
  doneTasks: boolean
}

// ── Próximos 7 dias (sidebar) ──────────────────────────────────

interface ProximosItensProps {
  items: AgendaItem[]
  isLoading: boolean
  eventTypes: Map<string, EventTypeRecord>
  onItemClick: (item: AgendaItem) => void
}

function ProximosItens({ items, isLoading, eventTypes, onItemClick }: ProximosItensProps) {
  const hoje = new Date()
  const inicioDeHoje = startOfDay(hoje)
  const em7dias = endOfDay(addDays(hoje, 7))

  const proximos = items
    .filter((item) => {
      if (parseISO(item.start_at) > em7dias) return false
      // Tarefa pendente fica até ser concluída — passar da hora dela não a
      // resolve. Evento sai quando termina: o filtro por início tirava da lista
      // o de hoje assim que a hora passava, inclusive o de dia inteiro.
      if (item.kind === 'task') return !item.done && parseISO(item.start_at) >= inicioDeHoje
      return effectiveEnd(item) > hoje
    })
    .sort((a, b) => a.start_at.localeCompare(b.start_at))

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Próximos 7 dias
        </p>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : proximos.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">Nada nos próximos 7 dias.</p>
        </div>
      ) : (
        <div className="divide-y">
          {proximos.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onItemClick(item)}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
            >
              {item.kind === 'task' ? (
                <Circle className="h-2.5 w-2.5 mt-1 shrink-0 text-info" aria-label="Tarefa" />
              ) : (
                <div
                  className="h-2 w-2 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: resolveEventType(eventTypes, item.event.type).color }}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{item.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {agendaItemWhenLabel(item)}
                </p>
              </div>
              {item.kind === 'event' && item.event.fatal_deadline && (
                <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Filtros (legenda) ──────────────────────────────────────────

function VisibilityToggle({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'px-2.5 py-0.5 rounded-md text-[11px] font-medium border transition-colors disabled:opacity-40',
        active
          ? 'bg-primary/10 text-primary border-primary/20'
          : 'text-muted-foreground border-border/60 hover:bg-muted/50'
      )}
    >
      {active && '✓ '}
      {children}
    </button>
  )
}

// ── Main Component ─────────────────────────────────────────────

export function AgendaContent() {
  const { can } = usePermissions()
  const canViewTasks = can('tarefas', 'view')
  const canToggleTasks = can('tarefas', 'update')
  const canCreate = can('agenda', 'create') || can('tarefas', 'create')

  const [view, setView] = useState<CalendarView>('month')
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [visibility, setVisibility] = useState<AgendaVisibility>({
    events: true,
    tasks: true,
    doneTasks: true,
  })
  const [selectedEvento, setSelectedEvento] = useState<CalendarEvent | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createTarget, setCreateTarget] = useState<AgendaCreateTarget>({ withTime: false })

  // Dias visíveis, por visão. No mês a grade cobre semanas inteiras, incluindo
  // as bordas do mês vizinho.
  const days = useMemo(() => {
    if (view === 'day') return [currentDate]
    if (view === 'week') {
      return eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 0 }),
        end: endOfWeek(currentDate, { weekStartsOn: 0 }),
      })
    }
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 }),
      end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 }),
    })
  }, [view, currentDate])

  // Uma consulta cobre as duas superfícies: a grade visível e a barra lateral
  // de "próximos 7 dias", que pode ultrapassar a grade em qualquer visão.
  // Instantes, não strings sem fuso: a coluna é timestamptz e uma borda ingênua
  // recortaria as primeiras e últimas horas do período.
  const hoje = new Date()
  const rangeStart = startOfDay(minDate([days[0], hoje]))
  const rangeEnd = endOfDay(maxDate([days[days.length - 1], addDays(hoje, 7)]))

  const { data: eventos = [], isLoading: eventsLoading } = useEvents(
    rangeStart.toISOString(),
    rangeEnd.toISOString()
  )
  // Tarefa é `date` sem fuso: o período vai como dia, não como instante.
  const { data: tarefas = [], isLoading: tasksLoading } = useTasksInRange(
    format(rangeStart, 'yyyy-MM-dd'),
    format(rangeEnd, 'yyyy-MM-dd'),
    { enabled: canViewTasks }
  )
  const { data: tipos = [] } = useEventTypes()
  const eventTypes = useEventTypeMap()
  const toggleTaskDone = useToggleTaskDone()

  const showTasks = canViewTasks && visibility.tasks

  const items = useMemo(() => {
    const list: AgendaItem[] = []
    if (visibility.events) list.push(...eventos.map(eventToAgendaItem))
    if (showTasks) {
      for (const tarefa of tarefas) {
        const item = taskToAgendaItem(tarefa)
        if (item && (visibility.doneTasks || !item.done)) list.push(item)
      }
    }
    return list
  }, [eventos, tarefas, visibility, showTasks])

  // Cada item entra em TODOS os dias locais que cobre — antes só no de início,
  // e "Férias de 1 a 5" sumia dos dias 2 a 5.
  const itemsByDay = useMemo(
    () => indexEventsByDay(items, days[0], days[days.length - 1]),
    [items, days]
  )

  const getItemsForDay = useCallback(
    (day: Date): DaySegment[] => itemsByDay.get(format(day, 'yyyy-MM-dd')) ?? [],
    [itemsByDay]
  )

  // O detalhe lê da lista viva: concluir ou editar ali reflete sem reabrir.
  const selectedTask = selectedTaskId
    ? (tarefas.find((t) => t.id === selectedTaskId) ?? null)
    : null

  function handleItemClick(item: AgendaItem) {
    if (item.kind === 'event') setSelectedEvento(item.event)
    else setSelectedTaskId(item.task.id)
  }

  function handleToggleTask(item: TaskAgendaItem) {
    toggleTaskDone.mutate({ id: item.task.id, done: !item.done })
  }

  /** Um passo para trás ou para frente, na unidade da visão atual. */
  function shift(direction: 1 | -1) {
    setCurrentDate((current) => {
      if (view === 'day') return addDays(current, direction)
      if (view === 'week') return addWeeks(current, direction)
      return addMonths(current, direction)
    })
  }

  const periodLabel =
    view === 'day'
      ? format(currentDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })
      : view === 'week'
        ? `${format(days[0], "d 'de' MMM", { locale: ptBR })} – ${format(days[days.length - 1], "d 'de' MMM 'de' yyyy", { locale: ptBR })}`
        : format(currentDate, 'MMMM yyyy', { locale: ptBR })

  function openCreate(target: AgendaCreateTarget) {
    if (!canCreate) return
    setCreateTarget(target)
    setCreateOpen(true)
  }

  function handleDayClick(day: Date) {
    openCreate({ at: day, withTime: false })
  }

  /** Clique num intervalo da grade de horas: já abre o formulário naquele horário. */
  function handleSlotClick(day: Date, hour: number) {
    const at = new Date(day)
    at.setHours(hour, 0, 0, 0)
    openCreate({ at, withTime: true })
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-base font-semibold capitalize min-w-[240px] text-center">
            {periodLabel}
          </h2>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Próximo">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Hoje
          </Button>
        </div>

        <div className="flex items-center gap-3">
          {/* Seletor de visão */}
          <div className="flex rounded-lg border p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  view === v.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          {canCreate && (
            <Button size="sm" onClick={() => openCreate({ withTime: false })}>
              <Plus className="h-4 w-4 mr-1.5" />
              Novo
            </Button>
          )}
        </div>
      </div>

      {/* Legenda + o que mostrar */}
      <div className="flex items-center gap-4 flex-wrap">
        {tipos.map((tipo) => (
          <div key={tipo.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: tipo.color }} />
            {tipo.label}
          </div>
        ))}
        {canViewTasks && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Circle className="h-2.5 w-2.5 text-info" />
            Tarefa
          </div>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          <VisibilityToggle
            active={visibility.events}
            onClick={() => setVisibility((v) => ({ ...v, events: !v.events }))}
          >
            Eventos
          </VisibilityToggle>
          {canViewTasks && (
            <>
              <VisibilityToggle
                active={visibility.tasks}
                onClick={() => setVisibility((v) => ({ ...v, tasks: !v.tasks }))}
              >
                Tarefas
              </VisibilityToggle>
              <VisibilityToggle
                active={visibility.doneTasks}
                disabled={!visibility.tasks}
                onClick={() => setVisibility((v) => ({ ...v, doneTasks: !v.doneTasks }))}
              >
                Concluídas
              </VisibilityToggle>
            </>
          )}
        </div>
      </div>

      {/* Layout principal: calendário + sidebar */}
      <div className="grid grid-cols-[1fr_240px] gap-4 items-start">
        {/* Calendário */}
        {view === 'month' ? (
          <MonthGrid
            days={days}
            currentDate={currentDate}
            getItemsForDay={getItemsForDay}
            eventTypes={eventTypes}
            onDayClick={handleDayClick}
            onItemClick={handleItemClick}
            onToggleTask={canToggleTasks ? handleToggleTask : undefined}
          />
        ) : (
          <TimeGrid
            days={days}
            getItemsForDay={getItemsForDay}
            eventTypes={eventTypes}
            onSlotClick={handleSlotClick}
            onItemClick={handleItemClick}
            onToggleTask={canToggleTasks ? handleToggleTask : undefined}
          />
        )}

        {/* Sidebar — próximos 7 dias */}
        <ProximosItens
          items={items}
          isLoading={eventsLoading || (showTasks && tasksLoading)}
          eventTypes={eventTypes}
          onItemClick={handleItemClick}
        />
      </div>

      {/* Modal de detalhe do evento (inclui edição e exclusão) */}
      <EventDetailModal
        event={selectedEvento}
        open={!!selectedEvento}
        onClose={() => setSelectedEvento(null)}
      />

      {/* Detalhe da tarefa — o mesmo do quadro de Tarefas */}
      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTaskId(null)}
      />

      <AgendaCreateDialog open={createOpen} onOpenChange={setCreateOpen} target={createTarget} />
    </div>
  )
}
