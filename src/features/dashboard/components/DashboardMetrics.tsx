'use client'

import { AlarmClock, Briefcase, Newspaper, Scale, Wallet } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissions } from '@/hooks/usePermissions'
import { useCrmItemCounts } from '@/features/crm/hooks/useCrmItems'
import { useFinancialSummary } from '@/features/financeiro/hooks/useFinancialEntries'
import { useUnreadPublicationCount } from '@/features/publicacoes/hooks/usePublications'
import {
  useProcessCounts,
  useTaskCounts,
  useUnreadOrphanPublicationCount,
} from '../hooks/useDashboardStats'
import { formatCount, formatWholeBRL } from '../utils/format'
import { DashboardRow } from './DashboardRow'
import { MetricCard } from './MetricCard'

const NEGOCIACAO_WORKFLOW = 'wf-negociacao'

/** What a tile shows: the number once it arrives, a dash if the query failed,
 * `null` (the skeleton) while it loads. A refetch that fails after a success
 * keeps showing the last number. */
function displayValue<T>(
  data: T | undefined,
  isError: boolean,
  format: (data: T) => string
): string | null {
  if (data !== undefined) return format(data)
  return isError ? '—' : null
}

function ProcessesMetric() {
  const { data, isError } = useProcessCounts()

  return (
    <MetricCard
      label="Processos ativos"
      value={displayValue(data, isError, (counts) => formatCount(counts.active))}
      hint={
        data &&
        (data.monitored === 0
          ? 'nenhum com monitoramento'
          : `${formatCount(data.monitored)} com monitoramento`)
      }
      icon={Scale}
      variant="accent"
      href="/processos"
    />
  )
}

/** The number is the same query as the sidebar badge, so the two never
 * disagree. `/publicacoes` opens on the unread queue. */
function PublicationsMetric() {
  const unread = useUnreadPublicationCount()
  const { data: orphans = 0 } = useUnreadOrphanPublicationCount()

  return (
    <MetricCard
      label="Publicações não lidas"
      value={displayValue(unread.data, unread.isError, formatCount)}
      hint={orphans > 0 ? `${formatCount(orphans)} sem processo cadastrado` : null}
      hintTone="warning"
      icon={Newspaper}
      variant="info"
      href="/publicacoes"
    />
  )
}

function OverdueTasksMetric() {
  const { data, isError } = useTaskCounts()

  return (
    <MetricCard
      label="Tarefas atrasadas"
      value={displayValue(data, isError, (counts) => formatCount(counts.overdue))}
      valueTone={data && data.overdue > 0 ? 'danger' : undefined}
      hint={
        data &&
        (data.dueToday === 0
          ? 'nenhuma para hoje'
          : `${formatCount(data.dueToday)} para hoje`)
      }
      icon={AlarmClock}
      variant="warning"
      href="/tarefas"
    />
  )
}

/** "A receber" is the whole bucket — a vencer + vencido + condição especial —
 * the same `getFinancialSummary` the Financeiro page shows. */
function ReceivableMetric() {
  const { data: summary, isError } = useFinancialSummary()
  const overdue = summary?.receivableOverdue ?? 0

  return (
    <MetricCard
      label="A receber"
      value={displayValue(summary, isError, (s) => formatWholeBRL(s.receivableTotal))}
      hint={summary && (overdue > 0 ? `${formatWholeBRL(overdue)} vencido` : 'nada vencido')}
      hintTone={overdue > 0 ? 'danger' : 'muted'}
      icon={Wallet}
      variant="success"
      href="/financeiro?situacao=a_receber"
    />
  )
}

/** Stand-in for "A receber" when the role can't see the Financeiro. Same query
 * as the CRM tab badges. */
function NegotiationsMetric() {
  const { data: counts, isError } = useCrmItemCounts()

  return (
    <MetricCard
      label="Em negociação"
      value={displayValue(counts, isError, (c) => formatCount(c[NEGOCIACAO_WORKFLOW] ?? 0))}
      icon={Briefcase}
      variant="chart2"
      href="/crm"
    />
  )
}

/**
 * The indicators row. Each tile is its own component so its query only runs
 * when the tile renders — a role without the permission doesn't fetch a count
 * the RLS would answer with zero.
 */
export function DashboardMetrics() {
  const { can, isLoading } = usePermissions()

  // `can()` answers false for everything while the matrix loads; rendering then
  // would flash "Em negociação" before "A receber" shows up.
  if (isLoading) {
    return (
      <DashboardRow className="grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </DashboardRow>
    )
  }

  return (
    <DashboardRow className="grid-cols-2">
      {can('processos', 'view') && <ProcessesMetric />}
      {can('publicacoes', 'view') && <PublicationsMetric />}
      {can('tarefas', 'view') && <OverdueTasksMetric />}
      {can('financeiro', 'view') ? (
        <ReceivableMetric />
      ) : (
        can('crm', 'view') && <NegotiationsMetric />
      )}
    </DashboardRow>
  )
}
