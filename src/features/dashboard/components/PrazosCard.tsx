import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { PROXIMOS_PRAZOS, AREAS_JURIDICAS } from '@/data/mock'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AlertTriangle, Clock } from 'lucide-react'

function getInitials(nome: string): string {
  return nome
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function PrazosCard() {
  const hoje = new Date()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-500" />
          Próximos Prazos e Audiências
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {PROXIMOS_PRAZOS.map((prazo) => {
          const data = new Date(prazo.data + 'T00:00:00')
          const diffDias = Math.ceil(
            (data.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
          )
          const area = AREAS_JURIDICAS[prazo.areaJuridica]
          const iniciais = getInitials(prazo.advogado)

          return (
            <div
              key={prazo.id}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50',
                prazo.isFatal && 'border-red-200 bg-red-50/40'
              )}
            >
              {/* Data */}
              <div
                className={cn(
                  'flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 min-w-[44px] text-center',
                  prazo.isFatal ? 'bg-red-100' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'text-base font-bold leading-none',
                    prazo.isFatal ? 'text-red-700' : 'text-foreground'
                  )}
                >
                  {format(data, 'dd', { locale: ptBR })}
                </span>
                <span
                  className={cn(
                    'text-xs uppercase font-medium',
                    prazo.isFatal ? 'text-red-500' : 'text-muted-foreground'
                  )}
                >
                  {format(data, 'MMM', { locale: ptBR })}
                </span>
              </div>

              {/* Conteúdo */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium leading-snug truncate">
                    {prazo.titulo}
                  </span>
                  {prazo.isFatal && (
                    <Badge className="bg-red-100 text-red-700 border-0 animate-pulse text-xs px-1.5 py-0 h-4">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                      Prazo Fatal
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{prazo.clienteNome}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium',
                      area.bg,
                      area.color
                    )}
                  >
                    {area.label}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      diffDias <= 3
                        ? 'text-red-600'
                        : diffDias <= 7
                          ? 'text-amber-600'
                          : 'text-muted-foreground'
                    )}
                  >
                    {diffDias === 0
                      ? 'Hoje'
                      : diffDias === 1
                        ? 'Amanhã'
                        : `em ${diffDias} dias`}
                  </span>
                </div>
              </div>

              {/* Avatar do advogado */}
              <div
                title={prazo.advogado}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 text-xs font-semibold"
              >
                {iniciais}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
