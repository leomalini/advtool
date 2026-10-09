'use client'

import Link from 'next/link'
import { CircleAlert, CircleCheck, ClipboardList } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import { useClientesPendencies } from '@/features/clientes/hooks/useClientes'
import { useLegalProcessesPendencies } from '@/features/processos/hooks/useLegalProcesses'
import { formatCount, pluralize } from '../utils/format'
import { CardLink } from './CardLink'
import { DashboardCard } from './DashboardCard'
import { EmptyLine } from './EmptyLine'

interface PendencyTileProps {
  label: string
  total: number | undefined
  /** Issues with `severity: 'high'` — what blocks the work or may cost a deadline. */
  high: number
  highLabel: string
  isLoading: boolean
}

function PendencyTile({ label, total, high, highLabel, isLoading }: PendencyTileProps) {
  if (isLoading) return <Skeleton className="h-[72px] w-full rounded-lg" />

  return (
    <Link
      href="/pendencias"
      className="block rounded-lg bg-muted/60 px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cn(
          'block text-xl leading-tight font-bold',
          !total && 'text-muted-foreground'
        )}
      >
        {total === undefined ? '—' : formatCount(total)}
      </span>
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      {high > 0 && (
        <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-destructive">
          <CircleAlert aria-hidden className="size-3 shrink-0" />
          {highLabel}
        </span>
      )}
    </Link>
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
    <DashboardCard
      icon={ClipboardList}
      tone="warning"
      title="Pendências de cadastro"
      action={allClear ? undefined : <CardLink href="/pendencias">Ver</CardLink>}
      className={className}
    >
      {allClear ? (
        <EmptyLine
          icon={CircleCheck}
          tone="success"
          title="Cadastros em dia"
          description="Nenhum dado faltando em clientes e processos."
        />
      ) : (
        <div className={cn('grid gap-2 px-2 pb-1', showClients && showProcesses && 'grid-cols-2')}>
          {showClients && (
            <PendencyTile
              label={clients.data?.length === 1 ? 'cliente' : 'clientes'}
              total={clients.data?.length}
              high={clientHigh}
              highLabel={`${pluralize(clientHigh, 'trava', 'travam')} o trabalho`}
              isLoading={clients.isLoading}
            />
          )}
          {showProcesses && (
            <PendencyTile
              label={processes.data?.length === 1 ? 'processo' : 'processos'}
              total={processes.data?.length}
              high={processHigh}
              highLabel={`${pluralize(processHigh, 'pode', 'podem')} custar um prazo`}
              isLoading={processes.isLoading}
            />
          )}
        </div>
      )}
    </DashboardCard>
  )
}
