'use client'

import Link from 'next/link'
import { Globe, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelative } from '@/utils/date'
import { usePortalAccessSummary } from '../hooks/useDashboardStats'
import { PORTAL_WINDOW_DAYS } from '../services/dashboard.service'
import { formatCount, pluralize } from '../utils/format'

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

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Globe className="h-4 w-4 text-info" />
          Portal do cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <Skeleton className="h-24 w-full rounded-lg" />}
        {isError && (
          <p className="text-sm text-muted-foreground">Não foi possível carregar os acessos.</p>
        )}

        {data && (
          <>
            <div>
              <p className="text-2xl font-bold tabular-nums">{formatCount(data.granted)}</p>
              <p className="text-xs text-muted-foreground">
                {data.granted === 1 ? 'acesso' : 'acessos'} em {PORTAL_WINDOW_DAYS} dias ·{' '}
                {pluralize(data.clients, 'cliente', 'clientes')}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {pluralize(data.activeLinks, 'link ativo', 'links ativos')}
              </p>
            </div>

            {data.refused > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-warning">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {pluralize(data.refused, 'tentativa recusada', 'tentativas recusadas')}:
                  documento errado ou tentativas demais.
                </span>
              </p>
            )}

            {data.recent.length > 0 && (
              <ul className="space-y-0.5">
                {data.recent.map((access) => (
                  <li key={`${access.clientId ?? 'sem-cliente'}-${access.at}`}>
                    <Link
                      href={access.clientId ? `/clientes/${access.clientId}` : '/clientes'}
                      className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-muted/50"
                    >
                      <span className="truncate font-medium">
                        {access.clientName ?? 'Cliente removido'}
                      </span>
                      <time dateTime={access.at} className="shrink-0 text-muted-foreground">
                        {formatRelative(access.at)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
