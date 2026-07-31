'use client'

import { useMemo, useState } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  isToday,
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
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_COLORS,
  type EventType,
} from '@/types/event.types'
import type { CalendarEvent } from '@/types/event.types'
import type { EventFormInput } from '@/schemas/event.schema'
import { useEvents } from '../hooks/useEvents'
import { useCreateEvent } from '../hooks/useEventMutations'
import { EventForm } from './EventForm'
import { EventDetailModal } from './EventDetailModal'

const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as EventType[]

// ── Próximos Eventos (sidebar) ─────────────────────────────────

interface ProximosEventosProps {
  eventos: CalendarEvent[]
  isLoading: boolean
  onEventoClick: (ev: CalendarEvent) => void
}

function ProximosEventos({ eventos, isLoading, onEventoClick }: ProximosEventosProps) {
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
                style={{ backgroundColor: EVENT_TYPE_COLORS[ev.type] }}
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
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [selectedEvento, setSelectedEvento] = useState<CalendarEvent | null>(null)
  const [novoEventoOpen, setNovoEventoOpen] = useState(false)
  const [novoEventoData, setNovoEventoData] = useState<Date | undefined>(undefined)

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  // One query covers both surfaces: the visible grid and the "next 7 days"
  // sidebar, which can reach past the grid when the month is nearly over.
  const hoje = new Date()
  const rangeFrom = format(minDate([calStart, hoje]), "yyyy-MM-dd'T'00:00:00")
  const rangeTo = format(maxDate([calEnd, addDays(hoje, 7)]), "yyyy-MM-dd'T'23:59:59")

  const { data: eventos = [], isLoading } = useEvents(rangeFrom, rangeTo)
  const createEvent = useCreateEvent()

  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of eventos) {
      const key = ev.start_at.slice(0, 10)
      const list = map.get(key)
      if (list) list.push(ev)
      else map.set(key, [ev])
    }
    return map
  }, [eventos])

  function getEventosForDay(day: Date): CalendarEvent[] {
    return eventsByDay.get(format(day, 'yyyy-MM-dd')) ?? []
  }

  function handleDayClick(day: Date) {
    setNovoEventoData(day)
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
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-base font-semibold capitalize w-40 text-center">
            {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Hoje
          </Button>
        </div>
        <Button size="sm" onClick={handleNovoEventoButton}>
          <Plus className="h-4 w-4 mr-1.5" />
          Novo Evento
        </Button>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 flex-wrap">
        {EVENT_TYPES.map((tipo) => (
          <div key={tipo} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: EVENT_TYPE_COLORS[tipo] }}
            />
            {EVENT_TYPE_LABELS[tipo]}
          </div>
        ))}
        <span className="text-xs text-muted-foreground/50 ml-auto hidden sm:block">
          Clique em um dia para criar um evento
        </span>
      </div>

      {/* Layout principal: calendário + sidebar */}
      <div className="grid grid-cols-[1fr_240px] gap-4 items-start">
        {/* Calendário */}
        <div className="rounded-xl border overflow-hidden">
          {/* Dias da semana */}
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {weekdays.map((day) => (
              <div
                key={day}
                className="py-2.5 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Grade de dias */}
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const dayEventos = getEventosForDay(day)
              const isCurrentMonth = isSameMonth(day, currentDate)
              const isTodayDay = isToday(day)

              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`Criar evento em ${format(day, "dd 'de' MMMM", { locale: ptBR })}`}
                  onClick={() => handleDayClick(day)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleDayClick(day)
                  }}
                  className={cn(
                    'min-h-[96px] p-1.5 border-b border-r transition-colors cursor-pointer select-none',
                    !isCurrentMonth && 'bg-muted/15',
                    isTodayDay && 'bg-primary/5',
                    'hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  )}
                >
                  {/* Número do dia */}
                  <div
                    className={cn(
                      'h-6 w-6 flex items-center justify-center rounded-full text-xs font-medium mb-1',
                      isTodayDay
                        ? 'bg-primary text-primary-foreground'
                        : !isCurrentMonth
                          ? 'text-muted-foreground/40'
                          : 'text-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </div>

                  {/* Eventos do dia */}
                  <div className="space-y-0.5">
                    {dayEventos.slice(0, 3).map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation() // impede abrir o modal de criação
                          setSelectedEvento(ev)
                        }}
                        className="w-full rounded px-1 py-0.5 text-[11px] text-white text-left truncate hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: EVENT_TYPE_COLORS[ev.type] }}
                      >
                        {ev.title}
                      </button>
                    ))}
                    {dayEventos.length > 3 && (
                      <p className="text-[10px] text-muted-foreground pl-1">
                        +{dayEventos.length - 3} mais
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

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
          className="sm:max-w-[500px] p-0 gap-0 overflow-hidden"
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
