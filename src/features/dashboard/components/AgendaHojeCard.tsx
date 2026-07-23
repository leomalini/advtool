import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AGENDA_DO_DIA } from '@/data/mock'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, Gavel, Users, Clock, MapPin } from 'lucide-react'

type EventoTipo = 'audiencia' | 'reuniao' | 'prazo' | 'compromisso'

const TIPO_CONFIG: Record<EventoTipo, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  audiencia: {
    icon: Gavel,
    color: 'text-info',
    bg: 'bg-info/12',
    label: 'Audiência',
  },
  reuniao: {
    icon: Users,
    color: 'text-chart-2',
    bg: 'bg-chart-2/12',
    label: 'Reunião',
  },
  prazo: {
    icon: Clock,
    color: 'text-warning',
    bg: 'bg-warning/12',
    label: 'Prazo',
  },
  compromisso: {
    icon: CalendarDays,
    color: 'text-muted-foreground',
    bg: 'bg-muted',
    label: 'Compromisso',
  },
}

export function AgendaHojeCard() {
  // Ordena por data e hora
  const agendaOrdenada = [...AGENDA_DO_DIA].sort((a, b) => {
    const da = new Date(`${a.data}T${a.hora}`)
    const db = new Date(`${b.data}T${b.hora}`)
    return da.getTime() - db.getTime()
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-accent-foreground" />
          Próximos Eventos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {agendaOrdenada.map((evento, index) => {
          const config = TIPO_CONFIG[evento.tipo]
          const IconeEvento = config.icon
          const dataEvento = new Date(`${evento.data}T${evento.hora}`)

          return (
            <div key={evento.id} className="flex gap-3">
              {/* Linha de tempo */}
              <div className="flex flex-col items-center">
                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', config.bg)}>
                  <IconeEvento className={cn('h-4 w-4', config.color)} />
                </div>
                {index < agendaOrdenada.length - 1 && (
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
                    {config.label}
                  </span>
                  <time className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(dataEvento, "dd/MM · HH:mm", { locale: ptBR })}
                  </time>
                </div>
                <p className="text-sm font-medium mt-1 leading-snug">{evento.titulo}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{evento.cliente}</p>
                {evento.local && (
                  <div className="flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">{evento.local}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {agendaOrdenada.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum evento agendado.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
