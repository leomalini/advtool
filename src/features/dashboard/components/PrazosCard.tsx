'use client'

import Link from 'next/link'
import { CalendarCheck, Gavel } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { AREAS_JURIDICAS } from '@/data/mock'
import type { AreaJuridica } from '@/data/mock'
import { formatPrazo } from '@/features/crm/utils/prazo'
import { getInitials } from '@/utils/profile'
import { useUpcomingDeadlines } from '../hooks/useDashboardStats'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CardLink } from './CardLink'
import { DashboardCard } from './DashboardCard'
import { EmptyLine } from './EmptyLine'

const TONE_TEXT = {
  critical: 'text-destructive',
  warning: 'text-warning',
  neutral: 'text-muted-foreground',
} as const

interface PrazosCardProps {
  className?: string
}

/** The next deadlines of the cases, the overdue ones first — `next_deadline`
 * order puts them on top, which is what this card has that the agenda hasn't. */
export function PrazosCard({ className }: PrazosCardProps) {
  const { data: prazos, isLoading } = useUpcomingDeadlines(5)

  return (
    <DashboardCard
      icon={Gavel}
      tone="danger"
      title="Prazos"
      action={<CardLink href="/crm">Ver no CRM</CardLink>}
      className={className}
    >
      {isLoading && (
        <div className="space-y-2 px-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && prazos?.length === 0 && (
        <EmptyLine
          icon={CalendarCheck}
          tone="success"
          title="Nenhum prazo à vista"
          description="Os prazos dos casos aparecem aqui."
        />
      )}

      {prazos && prazos.length > 0 && (
        <ul>
          {prazos.map((prazo) => {
            const data = parseISO(prazo.next_deadline)
            const prazoInfo = formatPrazo(prazo.next_deadline)
            const area = prazo.legal_area
              ? AREAS_JURIDICAS[prazo.legal_area as AreaJuridica]
              : null
            const isCritical = prazoInfo.tone === 'critical'
            // Deadlines live on the crm_item, but when it belongs to a processo
            // the useful destination is the processo page. A plain CRM card has
            // no page of its own (it opens in a modal on the board), and neither
            // screen reads an `?id=` — that link used to land on the bare list.
            const href = prazo.legal_process_id
              ? `/processos/${prazo.legal_process_id}`
              : '/crm'

            return (
              <li key={prazo.crm_item_id}>
                <Link
                  href={href}
                  className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      'flex size-11 shrink-0 flex-col items-center justify-center rounded-lg',
                      isCritical ? 'bg-destructive/10 text-destructive' : 'bg-muted'
                    )}
                  >
                    <span className="text-base leading-none font-bold tabular-nums">
                      {format(data, 'dd', { locale: ptBR })}
                    </span>
                    <span
                      className={cn(
                        'text-[11px] font-semibold uppercase',
                        !isCritical && 'text-muted-foreground'
                      )}
                    >
                      {format(data, 'MMM', { locale: ptBR })}
                    </span>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {prazo.next_task_summary ?? prazo.title}
                    </span>
                    {prazo.client_name && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {prazo.client_name}
                      </span>
                    )}
                    <span className="mt-0.5 flex items-center gap-2.5 text-xs">
                      {area && (
                        <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
                          <span
                            aria-hidden
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: area.accent }}
                          />
                          {area.label}
                        </span>
                      )}
                      <span className={cn('font-semibold', TONE_TEXT[prazoInfo.tone])}>
                        {prazoInfo.label}
                      </span>
                    </span>
                  </span>

                  {prazo.assigned_name && (
                    <span
                      title={prazo.assigned_name}
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground"
                    >
                      {getInitials(prazo.assigned_name)}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </DashboardCard>
  )
}
