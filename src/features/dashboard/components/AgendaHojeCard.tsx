'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { EVENT_TYPE_LABELS } from '@/types/event.types'
import type { EventType } from '@/types/event.types'
import { useUpcomingEvents } from '../hooks/useDashboardStats'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, Gavel, Users, Clock, MapPin } from 'lucide-react'

const TIPO_CONFIG: Record<EventType, { icon: React.ElementType; color: string; bg: string }> = {
  hearing: { icon: Gavel, color: 'text-info', bg: 'bg-info/12' },
  meeting: { icon: Users, color: 'text-chart-2', bg: 'bg-chart-2/12' },
  deadline: { icon: Clock, color: 'text-warning', bg: 'bg-warning/12' },
  appointment: { icon: CalendarDays, color: 'text-muted-foreground', bg: 'bg-muted' },
}

/** The event carries a client relation only when one was linked. */
function clientName(event: { client?: { type: string; name: string | null; company_name: string | null; trade_name: string | null } | null }): string | null {
  const c = event.client
  if (!c) return null
  return c.type === 'individual' ? c.name : (c.trade_name ?? c.company_name)
}

export function AgendaHojeCard() {
  const { data: eventos, isLoading } = useUpcomingEvents(6)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-accent-foreground" />
          Próximos Eventos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}

        {!isLoading && eventos?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum evento agendado.
          </p>
        )}

        {eventos?.map((evento, index) => {
          const config = TIPO_CONFIG[evento.type] ?? TIPO_CONFIG.appointment
          const IconeEvento = config.icon
          const dataEvento = parseISO(evento.start_at)
          const cliente = clientName(evento as Parameters<typeof clientName>[0])

          return (
            <div key={evento.id} className="flex gap-3">
              {/* Linha de tempo */}
              <div className="flex flex-col items-center">
                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', config.bg)}>
                  <IconeEvento className={cn('h-4 w-4', config.color)} />
                </div>
                {index < eventos.length - 1 && (
                  <div className="mt-1 w-px flex-1 bg-border min-h-[20px]" />
                )}
              </div>

              {/* Conteúdo */}
              <div className="flex-1 pb-3 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium',
                      config.bg,
                      config.color
                    )}
                  >
                    {EVENT_TYPE_LABELS[evento.type]}
                  </span>
                  <time className="text-xs text-muted-foreground whitespace-nowrap">
                    {evento.all_day
                      ? format(dataEvento, 'dd/MM', { locale: ptBR })
                      : format(dataEvento, "dd/MM · HH:mm", { locale: ptBR })}
                  </time>
                </div>
                <p className="text-sm font-medium mt-1 leading-snug">{evento.title}</p>
                {cliente && <p className="text-xs text-muted-foreground mt-0.5 truncate">{cliente}</p>}
                {evento.location && (
                  <div className="flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">{evento.location}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
