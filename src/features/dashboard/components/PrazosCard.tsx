'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { AREAS_JURIDICAS } from '@/data/mock'
import type { AreaJuridica } from '@/data/mock'
import { formatPrazo } from '@/features/crm/utils/prazo'
import { getInitials } from '@/utils/profile'
import { useUpcomingDeadlines } from '../hooks/useDashboardStats'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Clock } from 'lucide-react'

export function PrazosCard() {
  const { data: prazos, isLoading } = useUpcomingDeadlines(5)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 text-warning" />
          Próximos Prazos e Audiências
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] w-full rounded-lg" />
          ))}

        {!isLoading && prazos?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum prazo cadastrado.
          </p>
        )}

        {prazos?.map((prazo) => {
          const data = parseISO(prazo.next_deadline)
          const prazoInfo = formatPrazo(prazo.next_deadline)
          const area = prazo.legal_area
            ? AREAS_JURIDICAS[prazo.legal_area as AreaJuridica]
            : null
          const isCritical = prazoInfo.tone === 'critical'
          // Deadlines live on the crm_item, but when it belongs to a processo
          // the useful destination is the processo modal.
          const href = prazo.legal_process_id
            ? `/processos?id=${prazo.legal_process_id}`
            : `/crm?id=${prazo.crm_item_id}`

          return (
            <Link
              key={prazo.crm_item_id}
              href={href}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50',
                isCritical && 'border-destructive/25 bg-destructive/[0.05]'
              )}
            >
              {/* Data */}
              <div
                className={cn(
                  'flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 min-w-[44px] text-center',
                  isCritical ? 'bg-destructive/10' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'text-base font-bold leading-none tabular-nums',
                    isCritical ? 'text-destructive' : 'text-foreground'
                  )}
                >
                  {format(data, 'dd', { locale: ptBR })}
                </span>
                <span
                  className={cn(
                    'text-xs uppercase font-medium',
                    isCritical ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {format(data, 'MMM', { locale: ptBR })}
                </span>
              </div>

              {/* Conteúdo */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug truncate">
                  {prazo.next_task_summary ?? prazo.title}
                </p>
                {prazo.client_name && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {prazo.client_name}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  {area && (
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium',
                        area.bg,
                        area.color
                      )}
                    >
                      {area.label}
                    </span>
                  )}
                  <span
                    className={cn(
                      'text-xs font-medium',
                      prazoInfo.tone === 'critical' && 'text-destructive',
                      prazoInfo.tone === 'warning' && 'text-warning',
                      prazoInfo.tone === 'neutral' && 'text-muted-foreground'
                    )}
                  >
                    {prazoInfo.label}
                  </span>
                </div>
              </div>

              {/* Avatar do advogado */}
              {prazo.assigned_name && (
                <div
                  title={prazo.assigned_name}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-semibold"
                >
                  {getInitials(prazo.assigned_name)}
                </div>
              )}
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}
