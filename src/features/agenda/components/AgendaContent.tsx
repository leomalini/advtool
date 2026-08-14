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
import { ChevronLeft, ChevronRight, Plus, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { resolveEventType } from '@/types/event.types'
import type { CalendarEvent } from '@/types/event.types'
import type { EventFormInput } from '@/schemas/event.schema'
import { useEvents } from '../hooks/useEvents'
import { useEventTypes, useEventTypeMap } from '../hooks/useEventTypes'
import { useCreateEvent } from '../hooks/useEventMutations'
import { EventForm } from './EventForm'
import { EventDetailModal } from './EventDetailModal'
import { MonthGrid } from './MonthGrid'
import { TimeGrid } from './TimeGrid'
import { localDayKey } from '../utils/datetime'

type CalendarView = 'month' | 'week' | 'day'

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: 'month', label: 'Mês' },
  { id: 'week', label: 'Semana' },
  { id: 'day', label: 'Dia' },
]

// ── Próximos Eventos (sidebar) ─────────────────────────────────

interface ProximosEventosProps {
  eventos: CalendarEvent[]
  isLoading: boolean
  onEventoClick: (ev: CalendarEvent) => void
}

function ProximosEventos({ eventos, isLoading, onEventoClick }: ProximosEventosProps) {
  const eventTypes = useEventTypeMap()
  const hoje = new Date()
  const em7dias = addDays(hoje, 7)

  const proximos = eventos
    .filter((ev) => {
      const d = parseISO(ev.start_at)
      return d >= hoje && d <= em7dias
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
          <p className="text-xs text-muted-foreground">Nenhum evento nos próximos 7 dias.</p>
        </div>
      ) : (
        <div className="divide-y">
          {proximos.map((ev) => (
            <button
              key={ev.id}
              type="button"
              onClick={() => onEventoClick(ev)}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
            >
              <div
                className="h-2 w-2 rounded-full mt-1.5 shrink-0"
                style={{ backgroundColor: resolveEventType(eventTypes, ev.type).color }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{ev.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {format(parseISO(ev.start_at), "dd 'de' MMM", { locale: ptBR })}
                  {!ev.all_day && ` · ${format(parseISO(ev.start_at), 'HH:mm')}`}
                </p>
              </div>
              {ev.fatal_deadline && (
                <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

export function AgendaContent() {
  const [view, setView] = useState<CalendarView>('month')
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [selectedEvento, setSelectedEvento] = useState<CalendarEvent | null>(null)
  const [novoEventoOpen, setNovoEventoOpen] = useState(false)
  const [novoEventoData, setNovoEventoData] = useState<Date | undefined>(undefined)

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
  const rangeFrom = startOfDay(minDate([days[0], hoje])).toISOString()
  const rangeTo = endOfDay(maxDate([days[days.length - 1], addDays(hoje, 7)])).toISOString()

  const { data: eventos = [], isLoading } = useEvents(rangeFrom, rangeTo)
  const { data: tipos = [] } = useEventTypes()
  const eventTypes = useEventTypeMap()
  const createEvent = useCreateEvent()

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of eventos) {
      // Dia local: `slice(0, 10)` daria o dia UTC, e um evento das 21h cairia
      // na célula do dia seguinte.
      const key = localDayKey(ev.start_at)
      const list = map.get(key)
      if (list) list.push(ev)
      else map.set(key, [ev])
    }
    return map
  }, [eventos])

  const getEventosForDay = useCallback(
    (day: Date): CalendarEvent[] => eventsByDay.get(format(day, 'yyyy-MM-dd')) ?? [],
    [eventsByDay]
  )

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

  function handleDayClick(day: Date) {
    setNovoEventoData(day)
    setNovoEventoOpen(true)
  }

  /** Clique num intervalo da grade de horas: já abre o formulário naquele horário. */
  function handleSlotClick(day: Date, hour: number) {
    const at = new Date(day)
    at.setHours(hour, 0, 0, 0)
    setNovoEventoData(at)
    setNovoEventoOpen(true)
  }

  function handleNovoEventoButton() {
    setNovoEventoData(undefined)
    setNovoEventoOpen(true)
  }

  async function handleCreate(data: EventFormInput) {
    await createEvent.mutateAsync(data)
    setNovoEventoOpen(false)
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

          <Button size="sm" onClick={handleNovoEventoButton}>
            <Plus className="h-4 w-4 mr-1.5" />
            Novo Evento
          </Button>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 flex-wrap">
        {tipos.map((tipo) => (
          <div key={tipo.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: tipo.color }} />
            {tipo.label}
          </div>
        ))}
        <span className="text-xs text-muted-foreground/50 ml-auto hidden sm:block">
          {view === 'month'
            ? 'Clique em um dia para criar um evento'
            : 'Clique em um horário para criar um evento'}
        </span>
      </div>

      {/* Layout principal: calendário + sidebar */}
      <div className="grid grid-cols-[1fr_240px] gap-4 items-start">
        {/* Calendário */}
        {view === 'month' ? (
          <MonthGrid
            days={days}
            currentDate={currentDate}
            getEventosForDay={getEventosForDay}
            eventTypes={eventTypes}
            onDayClick={handleDayClick}
            onEventClick={setSelectedEvento}
          />
        ) : (
          <TimeGrid
            days={days}
            getEventosForDay={getEventosForDay}
            eventTypes={eventTypes}
            onSlotClick={handleSlotClick}
            onEventClick={setSelectedEvento}
          />
        )}

        {/* Sidebar — próximos 7 dias */}
        <ProximosEventos
          eventos={eventos}
          isLoading={isLoading}
          onEventoClick={setSelectedEvento}
        />
      </div>

      {/* Modal de detalhe (inclui edição e exclusão) */}
      <EventDetailModal
        event={selectedEvento}
        open={!!selectedEvento}
        onClose={() => setSelectedEvento(null)}
      />

      {/* Modal de criação */}
      <Dialog open={novoEventoOpen} onOpenChange={setNovoEventoOpen}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-[560px] p-0 gap-0 overflow-hidden"
        >
          <EventForm
            defaultDate={novoEventoData}
            onSubmit={handleCreate}
            onCancel={() => setNovoEventoOpen(false)}
            isLoading={createEvent.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
