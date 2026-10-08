'use client'

import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import { useClientesPendencies } from '@/features/clientes/hooks/useClientes'
import { useLegalProcessesPendencies } from '@/features/processos/hooks/useLegalProcesses'
import { formatCount, pluralize } from '../utils/format'

interface PendencyLineProps {
  label: string
  total: number | undefined
  /** Issues with `severity: 'high'` — what blocks the work or may cost a deadline. */
  high: number
  highLabel: string
  isLoading: boolean
}

function PendencyLine({ label, total, high, highLabel, isLoading }: PendencyLineProps) {
  if (isLoading) return <Skeleton className="h-10 w-full rounded-lg" />

  return (
    <div className="flex items-baseline justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {high > 0 && <p className="text-[11px] text-destructive">{highLabel}</p>}
      </div>
      <span
        className={cn(
          'text-lg font-bold tabular-nums',
          total ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {total === undefined ? '—' : formatCount(total)}
      </span>
    </div>
  )
}

interface PendenciesCardProps {
  className?: string
}

/** How many registrations the Pendências page lists — the same two queries,
 * counted. Each half only with the permission of what it reads. */
export function PendenciesCard({ className }: PendenciesCardProps) {
  const { can } = usePermissions()
  const clients = useClientesPendencies()
  const processes = useLegalProcessesPendencies()

  const showClients = can('clientes', 'view')
  const showProcesses = can('processos', 'view')
  const clientHigh = (clients.data ?? []).filter((p) => p.issues.some((i) => i.severity === 'high')).length
  const processHigh = (processes.data ?? []).filter((p) => p.issues.some((i) => i.severity === 'high')).length
  const allClear =
    (!showClients || clients.data?.length === 0) && (!showProcesses || processes.data?.length === 0)

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-warning" />
          Pendências de cadastro
        </CardTitle>
        <CardAction>
          <Link
            href="/pendencias"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Ver
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {allClear ? (
          <p className="text-sm text-muted-foreground">Cadastros em dia.</p>
        ) : (
          <>
            {showClients && (
              <PendencyLine
                label="Clientes"
                total={clients.data?.length}
                high={clientHigh}
                highLabel={`${pluralize(clientHigh, 'trava', 'travam')} o trabalho`}
                isLoading={clients.isLoading}
              />
            )}
            {showProcesses && (
              <PendencyLine
                label="Processos"
                total={processes.data?.length}
                high={processHigh}
                highLabel={`${pluralize(processHigh, 'pode', 'podem')} custar um prazo`}
                isLoading={processes.isLoading}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
