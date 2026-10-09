'use client'

import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlarmClock,
  Briefcase,
  CircleCheck,
  FileWarning,
  Newspaper,
  Scale,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import { useCrmItemCounts } from '@/features/crm/hooks/useCrmItems'
import { useFinancialSummary } from '@/features/financeiro/hooks/useFinancialEntries'
import type { FinancialSummary } from '@/features/financeiro/services/financialEntries.service'
import type { FinancialSituationFilter } from '@/features/financeiro/utils/filterFinancialEntries'
import { useUnreadPublicationCount } from '@/features/publicacoes/hooks/usePublications'
import {
  useProcessCounts,
  usePublicationsPerDay,
  useTaskCounts,
  useUnreadOrphanPublicationCount,
} from '../hooks/useDashboardStats'
import { PUBLICATION_DAYS } from '../services/dashboard.service'
import { formatCount, formatWholeBRL, pluralize } from '../utils/format'
import { enterDelay } from '../utils/motion'
import { Meter, MiniColumns, SegmentBar } from './MicroCharts'
import { StatTile } from './StatTile'

const NEGOCIACAO_WORKFLOW = 'wf-negociacao'

/** A number, or `null` (skeleton) while it loads. A refetch that fails after
 * a success keeps the last number; a first load that fails shows a dash. */
function valueOf<T>(data: T | undefined, pick: (data: T) => number): number | null {
  return data === undefined ? null : pick(data)
}

function ProcessesMetric({ step }: { step: number }) {
  const { data, isError } = useProcessCounts()
  const coverage = data
    ? data.active === 0
      ? 'nenhum processo ativo'
      : data.monitored === 0
        ? 'nenhum com monitoramento'
        : `${formatCount(data.monitored)} de ${formatCount(data.active)} com monitoramento`
    : null

  return (
    <StatTile
      label="Processos ativos"
      icon={Scale}
      tone="accent"
      href="/processos"
      value={valueOf(data, (counts) => counts.active)}
      isError={isError}
      chart={data && data.active > 0 && (
        <Meter value={data.monitored} max={data.active} label={coverage ?? ''} />
      )}
      foot={coverage}
      className={enterDelay(step)}
    />
  )
}

/** The number is the same query as the sidebar badge, so the two never
 * disagree. The columns are the arrivals per day behind it. */
function PublicationsMetric({ step }: { step: number }) {
  const unread = useUnreadPublicationCount()
  const { data: orphans = 0 } = useUnreadOrphanPublicationCount()
  const { data: perDay } = usePublicationsPerDay()

  return (
    <StatTile
      label="Publicações não lidas"
      icon={Newspaper}
      tone="info"
      href="/publicacoes"
      value={valueOf(unread.data, (count) => count)}
      isError={unread.isError}
      chart={perDay && (
        <MiniColumns
          label={`Publicações por dia, ${PUBLICATION_DAYS} dias: ${pluralize(
            perDay.reduce((sum, day) => sum + day.count, 0),
            'publicação',
            'publicações'
          )}`}
          columns={perDay.map((day) => ({
            key: day.day,
            value: day.count,
            label: `${format(parseISO(day.day), 'EEE, dd/MM', { locale: ptBR })}: ${pluralize(day.count, 'publicação', 'publicações')}`,
          }))}
        />
      )}
      foot={
        orphans > 0 ? (
          <>
            <FileWarning aria-hidden className="size-3.5 shrink-0" />
            {pluralize(orphans, 'sem processo cadastrado', 'sem processo cadastrado')}
          </>
        ) : (
          `chegadas por dia · ${PUBLICATION_DAYS} dias`
        )
      }
      footTone={orphans > 0 ? 'warning' : 'muted'}
      className={enterDelay(step)}
    />
  )
}

function OverdueTasksMetric({ step }: { step: number }) {
  const { data, isError } = useTaskCounts()
  const late = data?.overdue ?? 0

  const today = data && (data.dueToday === 0 ? 'nenhuma para hoje' : `${formatCount(data.dueToday)} para hoje`)
  const oldest =
    data?.oldestOverdueDays != null && ` · mais antiga há ${pluralize(data.oldestOverdueDays, 'dia', 'dias')}`

  return (
    <StatTile
      label="Tarefas atrasadas"
      icon={AlarmClock}
      tone="warning"
      href="/tarefas"
      value={valueOf(data, (counts) => counts.overdue)}
      isError={isError}
      danger={late > 0}
      // One hue, lighter to darker: how late, not which kind.
      chart={data && late > 0 && (
        <SegmentBar
          label={`Atrasadas por tempo: ${data.overdueByAge.week} até 7 dias, ${data.overdueByAge.month} de 8 a 30 dias, ${data.overdueByAge.older} há mais de 30 dias`}
          segments={[
            { key: 'week', value: data.overdueByAge.week, className: 'bg-destructive/35', label: `Até 7 dias: ${data.overdueByAge.week}` },
            { key: 'month', value: data.overdueByAge.month, className: 'bg-destructive/65', label: `8 a 30 dias: ${data.overdueByAge.month}` },
            { key: 'older', value: data.overdueByAge.older, className: 'bg-destructive', label: `Mais de 30 dias: ${data.overdueByAge.older}` },
          ]}
        />
      )}
      foot={
        data &&
        (late > 0 ? (
          <>
            {today}
            {oldest}
          </>
        ) : (
          <>
            <CircleCheck aria-hidden className="size-3.5 shrink-0" />
            {data.dueToday > 0 ? `${today} · nada atrasado` : 'tudo em dia'}
          </>
        ))
      }
      footTone={late > 0 ? 'muted' : 'success'}
      className={enterDelay(step)}
    />
  )
}

/** The three parts of "A receber", each opening the Financeiro on its slice.
 * Blue in the middle: amber beside red sits at the edge of telling apart, even
 * for full colour vision (ΔE 15 — docs/dashboard-visual.md, "Cores"). */
const RECEIVABLE_PARTS: {
  situation: FinancialSituationFilter
  label: string
  className: string
  value: (summary: FinancialSummary) => number
}[] = [
  { situation: 'a_vencer', label: 'A vencer', className: 'bg-warning', value: (s) => s.receivableUpcoming },
  { situation: 'condicao_especial', label: 'Condição especial', className: 'bg-info', value: (s) => s.receivableConditional },
  { situation: 'vencido', label: 'Vencido', className: 'bg-destructive', value: (s) => s.receivableOverdue },
]

/** "A receber" is the whole bucket — a vencer + condição especial + vencido —
 * the same `getFinancialSummary` the Financeiro page shows. */
function ReceivableMetric({ step }: { step: number }) {
  const { data: summary, isError } = useFinancialSummary()
  const overdue = summary?.receivableOverdue ?? 0

  return (
    <StatTile
      label="A receber"
      icon={Wallet}
      tone="success"
      href="/financeiro?situacao=a_receber"
      value={valueOf(summary, (s) => Math.round(s.receivableTotal))}
      isError={isError}
      prefix="R$"
      chart={summary && (
        <SegmentBar
          label={RECEIVABLE_PARTS.map((part) => `${part.label}: ${formatWholeBRL(part.value(summary))}`).join(', ')}
          segments={RECEIVABLE_PARTS.map((part) => ({
            key: part.situation,
            value: part.value(summary),
            className: part.className,
            label: `${part.label}: ${formatWholeBRL(part.value(summary))}`,
            href: `/financeiro?situacao=${part.situation}`,
          }))}
        />
      )}
      foot={
        summary &&
        (overdue > 0 ? (
          <>
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            {formatWholeBRL(overdue)} vencido
          </>
        ) : (
          'nada vencido'
        ))
      }
      footTone={overdue > 0 ? 'danger' : 'muted'}
      className={enterDelay(step)}
    />
  )
}

/** Stand-in for "A receber" when the role can't see the Financeiro. Same query
 * as the CRM tab badges; the meter is its share of every case on the board. */
function NegotiationsMetric({ step }: { step: number }) {
  const { data: counts, isError } = useCrmItemCounts()
  const negotiating = counts?.[NEGOCIACAO_WORKFLOW] ?? 0
  const total = counts ? Object.values(counts).reduce((sum, count) => sum + count, 0) : 0
  const share = `${formatCount(negotiating)} de ${pluralize(total, 'caso', 'casos')} do CRM`

  return (
    <StatTile
      label="Em negociação"
      icon={Briefcase}
      tone="violet"
      href="/crm"
      value={valueOf(counts, () => negotiating)}
      isError={isError}
      chart={counts && total > 0 && <Meter value={negotiating} max={total} label={share} />}
      foot={counts && (total > 0 ? share : 'nenhum caso no CRM')}
      className={enterDelay(step)}
    />
  )
}

/**
 * The indicators row. Each tile is its own component so its query only runs
 * when the tile renders — a role without the permission doesn't fetch a count
 * the RLS would answer with zero. Two per line on a phone, four when the
 * dashboard is wide; a hidden tile leaves no hole (the columns follow the
 * tiles that render).
 */
export function DashboardMetrics({ className }: { className?: string }) {
  const { can, isLoading } = usePermissions()
  const grid = cn(
    'grid grid-cols-2 gap-3 @3xl/dashboard:grid-flow-col @3xl/dashboard:grid-cols-none @3xl/dashboard:auto-cols-fr',
    className
  )

  // `can()` answers false for everything while the matrix loads; rendering then
  // would flash "Em negociação" before "A receber" shows up.
  if (isLoading) {
    return (
      <div className={grid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className={grid}>
      {can('processos', 'view') && <ProcessesMetric step={1} />}
      {can('publicacoes', 'view') && <PublicationsMetric step={1} />}
      {can('tarefas', 'view') && <OverdueTasksMetric step={2} />}
      {can('financeiro', 'view') ? (
        <ReceivableMetric step={2} />
      ) : (
        can('crm', 'view') && <NegotiationsMetric step={2} />
      )}
    </div>
  )
}
