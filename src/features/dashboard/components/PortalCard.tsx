'use client'

import Link from 'next/link'
import { Globe, ShieldAlert } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelative } from '@/utils/date'
import { usePortalAccessSummary } from '../hooks/useDashboardStats'
import { PORTAL_WINDOW_DAYS } from '../services/dashboard.service'
import { formatCount, pluralize } from '../utils/format'
import { DashboardCard } from './DashboardCard'
import { EmptyLine } from './EmptyLine'

interface PortalCardProps {
  className?: string
}

/**
 * How the clients use the follow-up link: accesses in the month, who entered
 * last, and the refused attempts — right link with the wrong document, or too
 * many tries, which is someone trying to get into another client's portal.
 */
export function PortalCard({ className }: PortalCardProps) {
  const { data, isLoading, isError } = usePortalAccessSummary()
  const quiet = data !== undefined && data.granted === 0 && data.refused === 0

  return (
    <DashboardCard icon={Globe} tone="info" title="Portal do cliente" className={className}>
      {isLoading && (
        <div className="px-2">
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      )}
      {isError && (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          Não foi possível carregar os acessos.
        </p>
      )}

      {quiet && (
        <EmptyLine
          icon={Globe}
          title={`Nenhum acesso em ${PORTAL_WINDOW_DAYS} dias`}
          description={`${pluralize(data.activeLinks, 'link ativo', 'links ativos')}. O link de acompanhamento sai da ficha do cliente.`}
        />
      )}

      {data && !quiet && (
        <div className="space-y-2">
          <div className="px-2">
            <p className="text-2xl font-bold tracking-tight">{formatCount(data.granted)}</p>
            <p className="text-xs text-muted-foreground">
              {data.granted === 1 ? 'acesso' : 'acessos'} em {PORTAL_WINDOW_DAYS} dias ·{' '}
              {pluralize(data.clients, 'cliente', 'clientes')} ·{' '}
              {pluralize(data.activeLinks, 'link ativo', 'links ativos')}
            </p>
          </div>

          {data.refused > 0 && (
            <p className="mx-2 flex items-start gap-1.5 rounded-lg bg-warning/8 px-2.5 py-2 text-xs text-warning">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {pluralize(data.refused, 'tentativa recusada', 'tentativas recusadas')}:
                documento errado ou tentativas demais.
              </span>
            </p>
          )}

          {data.recent.length > 0 && (
            <ul>
              {data.recent.map((access) => (
                <li key={`${access.clientId ?? 'sem-cliente'}-${access.at}`}>
                  <Link
                    href={access.clientId ? `/clientes/${access.clientId}` : '/clientes'}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate font-medium">
                      {access.clientName ?? 'Cliente removido'}
                    </span>
                    <time dateTime={access.at} className="shrink-0 text-xs text-muted-foreground">
                      {formatRelative(access.at)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </DashboardCard>
  )
}
