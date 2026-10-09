'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { format, parseISO, startOfDay, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CheckCheck, ExternalLink, FileWarning, Radar } from 'lucide-react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/utils/date'
import { useNow } from '@/hooks/useNow'
import { usePermissions } from '@/hooks/usePermissions'
import { useUnreadPublicationCount } from '@/features/publicacoes/hooks/usePublications'
import {
  useProcessCounts,
  useUnreadOrphanPublicationCount,
  useUnreadPublicationsPreview,
  useWebhookMovements,
} from '../hooks/useDashboardStats'
import { useReadPublication } from '../hooks/useReadPublication'
import {
  MONITORING_WINDOW_DAYS,
  type ProcessCounts,
  type PublicationPreview,
  type WebhookMovement,
} from '../services/dashboard.service'
import { groupProcessNews, type ProcessNews } from '../utils/groupProcessNews'
import { formatCount, pluralize } from '../utils/format'
import { registerProcessHref } from '../utils/links'
import { CardLink } from './CardLink'
import { CreditBalancePill } from './CreditBalancePill'
import { DashboardCard } from './DashboardCard'
import { EmptyLine } from './EmptyLine'
import { MiniColumns } from './MicroCharts'
import { SegmentedControl, type SegmentedOption } from './SegmentedControl'
import { WebhookRefusedAlert, WebhookStatusPill } from './WebhookStatus'

type MonitoringTab = 'movements' | 'publications' | 'orphans'

/** Processos (or publications) per tab. */
const ROWS = 5

const ROW =
  'group/row relative flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50 ' +
  'has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring'
/** Row actions show on hover where there is a mouse; on touch they stay. */
const ROW_ACTIONS =
  'relative z-10 flex shrink-0 items-center gap-0.5 transition-opacity pointer-fine:opacity-0 ' +
  'pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100'
const ICON_ACTION =
  'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors ' +
  'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** 'yyyy-MM-dd' → '06/10', in the local day — parseISO keeps a date-only
 * string on its own day, where `new Date()` would read it as UTC midnight. */
function formatDay(iso: string): string {
  return format(parseISO(iso), 'dd/MM', { locale: ptBR })
}

/** Why nothing arrived: no processo, none monitored, or a quiet week. */
function monitoringCoverage({ active, monitored }: ProcessCounts): string {
  if (active === 0) return 'Nenhum processo ativo cadastrado.'
  if (monitored === 0) {
    return `Nenhum dos ${pluralize(active, 'processo ativo', 'processos ativos')} tem monitoramento.`
  }
  return `${formatCount(monitored)} de ${pluralize(active, 'processo ativo', 'processos ativos')} com monitoramento.`
}

/** Arrivals per local day over the window, today last. */
function arrivalsPerDay(movements: readonly WebhookMovement[], now: Date) {
  const today = startOfDay(now)
  const counts = new Map<string, number>()
  for (const movement of movements) {
    const key = format(parseISO(movement.created_at), 'yyyy-MM-dd')
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from({ length: MONITORING_WINDOW_DAYS }, (_, index) => {
    const day = subDays(today, MONITORING_WINDOW_DAYS - 1 - index)
    const key = format(day, 'yyyy-MM-dd')
    const value = counts.get(key) ?? 0
    return {
      key,
      value,
      label: `${format(day, 'EEE, dd/MM', { locale: ptBR })}: ${pluralize(value, 'movimentação', 'movimentações')}`,
    }
  })
}

function RowSkeletons() {
  return (
    <div className="space-y-2 px-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  )
}

// ── Movimentações ────────────────────────────────────────────────────────────

/** What arrived in the last day reads as new. */
const FRESH_MS = 24 * 60 * 60 * 1000

function ProcessNewsRow({ news, now }: { news: ProcessNews; now: Date }) {
  const meta = [news.clientName, news.court].filter(Boolean).join(' · ')
  const fresh = now.getTime() - parseISO(news.latest.receivedAt).getTime() < FRESH_MS

  return (
    <HoverCard openDelay={250} closeDelay={80}>
      <HoverCardTrigger asChild>
        <Link
          href={`/processos/${news.legalProcessId}`}
          className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* Minimum width: "+42" and "+1" misaligned the CNJs of the rows. */}
          <span className="mt-0.5 flex h-6 min-w-10 shrink-0 items-center justify-center rounded-md bg-info/12 px-1.5 text-xs font-bold tabular-nums text-info">
            +{formatCount(news.count)}
          </span>
          <span className="min-w-0 flex-1">
            {/* The CNJ gets the whole line — it is what identifies the row. */}
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'truncate text-sm font-semibold text-foreground',
                  news.cnjNumber && 'font-mono text-[13px] font-medium'
                )}
              >
                {news.cnjNumber ?? news.title ?? 'Processo sem número'}
              </span>
              {fresh && (
                <span
                  aria-label="chegou nas últimas 24 horas"
                  className="size-1.5 shrink-0 rounded-full bg-accent-foreground"
                />
              )}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {meta && `${meta} · `}
              <time dateTime={news.latest.receivedAt}>{formatRelative(news.latest.receivedAt)}</time>
            </span>
            <span className="mt-0.5 line-clamp-2 text-[13px] text-foreground/80">
              {news.latest.text} — {formatDay(news.latest.actDate)}
            </span>
          </span>
        </Link>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">
          {news.count > news.recent.length
            ? `Os ${news.recent.length} atos mais recentes de ${news.count}`
            : 'Atos que chegaram'}
        </p>
        <ul className="space-y-1.5">
          {news.recent.map((item) => (
            <li key={`${item.receivedAt}-${item.text}`} className="flex gap-2.5 text-xs">
              <span className="w-10 shrink-0 tabular-nums text-muted-foreground">
                {formatDay(item.actDate)}
              </span>
              <span className="line-clamp-2">{item.text}</span>
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  )
}

// ── Publicações ──────────────────────────────────────────────────────────────

function PublicationRow({
  publication,
  canCreateProcess,
  onRead,
}: {
  publication: PublicationPreview
  canCreateProcess: boolean
  /** Absent without `publicacoes:update`. */
  onRead?: (publication: PublicationPreview) => void
}) {
  const orphan = !publication.legal_process_id
  const cnj = publication.cnj_number
  const meta = [publication.diario_sigla, formatDay(publication.publication_date)]
    .filter(Boolean)
    .join(' · ')
  const href = `/publicacoes/${publication.id}`

  // Stretched link: the title covers the row with `::after`, and the actions
  // and "Cadastrar" sit above it (`relative`). A link inside a link would not
  // be valid HTML.
  return (
    <div className={ROW}>
      <span
        aria-hidden
        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', orphan ? 'bg-warning' : 'bg-info')}
      />
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="block truncate text-sm font-semibold after:absolute after:inset-0 focus-visible:outline-none"
        >
          {publication.title ?? 'Publicação sem título'}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {meta} · <span className="font-mono">{cnj ?? 'sem CNJ'}</span>
        </p>
        {orphan && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-warning">
            <FileWarning className="h-3 w-3 shrink-0" />
            Processo não cadastrado
            {cnj && canCreateProcess && (
              <Link
                href={registerProcessHref(cnj)}
                className="relative z-10 underline underline-offset-2 hover:text-foreground"
              >
                Cadastrar
              </Link>
            )}
          </p>
        )}
      </div>
      <div className={ROW_ACTIONS}>
        {onRead && (
          <button
            type="button"
            onClick={() => onRead(publication)}
            aria-label={`Marcar "${publication.title ?? 'publicação'}" como lida`}
            title="Marcar como lida"
            className={ICON_ACTION}
          >
            <CheckCheck className="size-4" />
          </button>
        )}
        <Link
          href={href}
          aria-label={`Abrir "${publication.title ?? 'publicação'}"`}
          title="Abrir"
          className={ICON_ACTION}
        >
          <ExternalLink className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}

function PublicationsPanel({
  orphansOnly,
  canCreateProcess,
  canMarkRead,
}: {
  orphansOnly: boolean
  canCreateProcess: boolean
  canMarkRead: boolean
}) {
  const { data: rows, isLoading, isError } = useUnreadPublicationsPreview({ orphansOnly })
  const readPublication = useReadPublication()

  if (isLoading) return <RowSkeletons />
  if (isError) {
    return <p className="px-2 py-3 text-sm text-muted-foreground">Não foi possível carregar as publicações.</p>
  }
  if (!rows || rows.length === 0) {
    return orphansOnly ? (
      <EmptyLine
        icon={CheckCheck}
        tone="success"
        title="Nenhuma publicação órfã"
        description="Toda publicação não lida tem processo cadastrado."
      />
    ) : (
      <EmptyLine
        icon={CheckCheck}
        tone="success"
        title="Fila em dia"
        description="Nenhuma publicação esperando leitura."
      />
    )
  }

  return (
    <ul className="space-y-0.5">
      {rows.map((publication) => (
        <li key={publication.id}>
          <PublicationRow
            publication={publication}
            canCreateProcess={canCreateProcess}
            onRead={canMarkRead ? readPublication : undefined}
          />
        </li>
      ))}
    </ul>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

interface MonitoringCardProps {
  className?: string
}

/**
 * What the BuscaProcessos monitoring brought in: the processos with news, the
 * unread publications queue and the orphans of it, one tab each, with the
 * count on the tab. Each tab carries the permission of its own table; the
 * delivery health is a pill in the header, for whoever sees Configurações.
 */
export function MonitoringCard({ className }: MonitoringCardProps) {
  const id = useId()
  const now = useNow()
  const { can } = usePermissions()
  const showMovements = can('processos', 'view')
  const showPublications = can('publicacoes', 'view')
  const canCreateProcess = can('processos', 'create')
  const canMarkRead = can('publicacoes', 'update')

  const movements = useWebhookMovements({ enabled: showMovements })
  const { data: processCounts } = useProcessCounts()
  const unread = useUnreadPublicationCount({ enabled: showPublications })
  const orphans = useUnreadOrphanPublicationCount({ enabled: showPublications })
  const news = movements.data ? groupProcessNews(movements.data.movements) : []

  const options: SegmentedOption<MonitoringTab>[] = [
    ...(showMovements
      ? [{ value: 'movements' as const, label: 'Movimentações', count: news.length, countTone: 'info' as const }]
      : []),
    ...(showPublications
      ? [
          { value: 'publications' as const, label: 'Publicações', count: unread.data ?? 0, countTone: 'info' as const },
          {
            value: 'orphans' as const,
            label: 'Sem processo',
            count: orphans.data ?? 0,
            countTone: (orphans.data ?? 0) > 0 ? ('warning' as const) : undefined,
          },
        ]
      : []),
  ]

  // Opens where there is news: the movements while they load or when there
  // are any, the queue otherwise.
  const [picked, setPicked] = useState<MonitoringTab | null>(null)
  const fallback: MonitoringTab =
    showMovements && (movements.isLoading || news.length > 0) ? 'movements' : 'publications'
  const tab = picked ?? fallback
  // A tab the role can't see falls back to the first one it can.
  const current = options.some((option) => option.value === tab) ? tab : options[0]?.value

  const footer =
    current === 'movements' ? (
      <>
        <span>{processCounts ? monitoringCoverage(processCounts) : null}</span>
        <CardLink href="/processos" strong>
          Ver processos
        </CardLink>
      </>
    ) : (
      <>
        <span className={cn((orphans.data ?? 0) > 0 && current === 'publications' && 'text-warning')}>
          {current === 'publications' && (orphans.data ?? 0) > 0
            ? pluralize(orphans.data ?? 0, 'sem processo cadastrado', 'sem processo cadastrado')
            : null}
        </span>
        <CardLink href="/publicacoes" strong>
          Ver fila{unread.data !== undefined && ` (${formatCount(unread.data)})`}
        </CardLink>
      </>
    )

  return (
    <DashboardCard
      icon={Radar}
      tone="info"
      title="Monitoramento"
      action={
        can('configuracoes', 'view') && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <CreditBalancePill />
            <WebhookStatusPill canCreateProcess={canCreateProcess} />
          </div>
        )
      }
      className={className}
      bodyClassName="space-y-2 px-2 pb-2"
      footer={footer}
    >
      <WebhookRefusedAlert />

      {options.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-2">
          <SegmentedControl
            kind="tabs"
            id={id}
            stackOnNarrow
            label="Monitoramento"
            options={options}
            value={current ?? 'movements'}
            onChange={setPicked}
          />
          {current === 'movements' && movements.data && news.length > 0 && (
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-24">
                <MiniColumns
                  label={`Movimentações por dia, ${MONITORING_WINDOW_DAYS} dias`}
                  columns={arrivalsPerDay(movements.data.movements, now)}
                />
              </div>
              <span>
                <strong className="font-semibold text-foreground">
                  {formatCount(movements.data.movements.length)}
                </strong>{' '}
                em {MONITORING_WINDOW_DAYS} dias
              </span>
            </div>
          )}
        </div>
      )}

      <div
        role={options.length > 1 ? 'tabpanel' : undefined}
        id={`${id}-panel`}
        aria-labelledby={options.length > 1 ? `${id}-tab-${current}` : undefined}
      >
        {current === 'movements' && (
          <>
            {movements.isLoading && <RowSkeletons />}
            {movements.isError && (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                Não foi possível carregar as movimentações.
              </p>
            )}
            {movements.data && news.length === 0 && (
              <EmptyLine
                icon={Radar}
                title={`Nada novo em ${MONITORING_WINDOW_DAYS} dias`}
                description={processCounts ? monitoringCoverage(processCounts) : undefined}
              />
            )}
            {news.length > 0 && (
              <ul className="space-y-0.5">
                {news.slice(0, ROWS).map((item) => (
                  <li key={item.legalProcessId}>
                    <ProcessNewsRow news={item} now={now} />
                  </li>
                ))}
              </ul>
            )}
            {(news.length > ROWS || movements.data?.truncated) && (
              <p className="px-2 pt-1 text-xs text-muted-foreground">
                {news.length > ROWS && `e mais ${pluralize(news.length - ROWS, 'processo', 'processos')}`}
                {news.length > ROWS && movements.data?.truncated && ' · '}
                {movements.data?.truncated &&
                  `contando as ${formatCount(movements.data.movements.length)} mais recentes`}
              </p>
            )}
          </>
        )}
        {(current === 'publications' || current === 'orphans') && (
          <PublicationsPanel
            orphansOnly={current === 'orphans'}
            canCreateProcess={canCreateProcess}
            canMarkRead={canMarkRead}
          />
        )}
      </div>
    </DashboardCard>
  )
}
