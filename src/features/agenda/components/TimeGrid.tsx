'use client'

import { useEffect, useRef, useState } from 'react'
import { format, isToday, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveEventType } from '@/types/event.types'
import type { CalendarEvent, EventTypeRecord } from '@/types/event.types'
import { layoutDayEvents, resolveEndMinutes } from '../utils/dayLayout'

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
  getEventosForDay: (day: Date) => CalendarEvent[]
  eventTypes: Map<string, EventTypeRecord>
  /** Clique num espaço vazio cria evento naquele dia e hora. */
  onSlotClick: (day: Date, hour: number) => void
  onEventClick: (ev: CalendarEvent) => void
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

export function TimeGrid({
  days,
  getEventosForDay,
  eventTypes,
  onSlotClick,
  onEventClick,
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Abre na altura do primeiro evento do período — ou às 7h quando não há
  // nenhum. Começar à meia-noite deixaria a tela vazia na maioria dos dias.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const starts = days
      .flatMap(getEventosForDay)
      .filter((ev) => !ev.all_day)
      .map((ev) => new Date(ev.start_at).getHours())

    const firstHour = starts.length > 0 ? Math.min(...starts) : 7
    container.scrollTop = Math.max(0, (firstHour - 1) * HOUR_HEIGHT)
    // Só ao trocar de período — rolar de novo a cada refetch tiraria o usuário
    // de onde ele estava.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]?.toISOString(), days.length])

  const allDayByColumn = days.map((day) => getEventosForDay(day).filter((ev) => ev.all_day))
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
      <div ref={scrollRef} className="overflow-y-auto max-h-[620px]">
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

          {/* Faixa de dia inteiro — fora do eixo de horas, como no Google Calendar */}
          {hasAllDay && (
            <div className="flex border-b bg-card">
              <div className="w-14 shrink-0 border-r px-1 py-1.5 text-right">
                <span className="text-[9px] font-medium text-muted-foreground uppercase">
                  Dia todo
                </span>
              </div>
              {allDayByColumn.map((list, i) => (
                <div key={i} className="flex-1 min-w-0 p-1 space-y-1 border-r last:border-r-0">
                  {list.map((ev) => {
                    const tipo = resolveEventType(eventTypes, ev.type)
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onEventClick(ev)}
                        title={`${tipo.label} · dia inteiro · ${ev.title}`}
                        className="w-full flex items-center gap-1 rounded px-1.5 py-1 text-left hover:brightness-95 transition-all"
                        style={{ backgroundColor: `${tipo.color}22`, color: tipo.color }}
                      >
                        <Sun className="h-2.5 w-2.5 shrink-0" />
                        <span className="text-[11px] font-medium truncate">{ev.title}</span>
                      </button>
                    )
                  })}
                </div>
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

            {days.map((day) => {
              const { timed } = layoutDayEvents(getEventosForDay(day), FULL_DAY, {
                minHeightPct: MIN_HEIGHT_PCT,
              })

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'relative flex-1 min-w-0 border-r last:border-r-0',
                    isToday(day) && 'bg-primary/[0.03]'
                  )}
                >
                  {/* Alvos de clique por hora */}
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      aria-label={`Criar evento em ${format(day, "dd 'de' MMMM", { locale: ptBR })} às ${h}h`}
                      onClick={() => onSlotClick(day, h)}
                      className="absolute inset-x-0 hover:bg-accent/30 transition-colors"
                      style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    />
                  ))}

                  {timed.map(({ event: ev, topPct, heightPct, leftPct, widthPct }) => {
                    const tipo = resolveEventType(eventTypes, ev.type)
                    const start = new Date(ev.start_at)
                    const heightPx = (heightPct / 100) * TOTAL_HEIGHT
                    const compact = heightPx < 34

                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onEventClick(ev)}
                        title={`${format(start, 'HH:mm')} · ${tipo.label} · ${ev.title}`}
                        className={cn(
                          'absolute z-10 rounded px-1.5 text-left text-white overflow-hidden shadow-sm hover:opacity-90 transition-opacity',
                          // Abaixo de ~14px não sobra altura nem para o padding.
                          heightPx < 16 ? 'py-0 leading-none' : 'py-0.5'
                        )}
                        style={{
                          top: `${topPct}%`,
                          height: `${heightPct}%`,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          backgroundColor: tipo.color,
                        }}
                      >
                        {compact ? (
                          // Sem altura para duas linhas: hora e título na mesma.
                          <span className="flex items-baseline gap-1 min-w-0">
                            <span className="text-[9px] font-semibold opacity-90 shrink-0">
                              {format(start, 'HH:mm')}
                            </span>
                            <span className="text-[10px] leading-tight truncate">{ev.title}</span>
                          </span>
                        ) : (
                          <>
                            <span className="block text-[11px] font-medium leading-tight truncate">
                              {ev.title}
                            </span>
                            {/* O término exibido é o mesmo que o bloco desenha:
                                sem término informado, a hora implícita. */}
                            <span className="block text-[9px] opacity-90 leading-tight">
                              {format(start, 'HH:mm')} – {formatMinutes(
                                resolveEndMinutes(ev, start.getHours() * 60 + start.getMinutes())
                              )}
                            </span>
                          </>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}

            <NowIndicator days={days} />
          </div>
        </div>
      </div>
    </div>
  )
}
