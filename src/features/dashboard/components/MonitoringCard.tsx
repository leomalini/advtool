'use client'

import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowRight, FileWarning, Radar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/utils/date'
import { usePermissions } from '@/hooks/usePermissions'
import { useUnreadPublicationCount } from '@/features/publicacoes/hooks/usePublications'
import {
  useProcessCounts,
  useUnreadOrphanPublicationCount,
  useUnreadPublicationsPreview,
  useWebhookMovements,
} from '../hooks/useDashboardStats'
import { MONITORING_WINDOW_DAYS, type PublicationPreview } from '../services/dashboard.service'
import { groupProcessNews, type ProcessNews } from '../utils/groupProcessNews'
import { formatCount, pluralize } from '../utils/format'
import { registerProcessHref } from '../utils/links'
import { WebhookHealthStrip } from './WebhookHealthStrip'

/** Processos (and publications) per column. */
const ROWS = 5

const ROW_LINK =
  'flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** 'yyyy-MM-dd' → '06/10', in the local day — parseISO keeps a date-only
 * string on its own day, where `new Date()` would read it as UTC midnight. */
function formatDay(iso: string): string {
  return format(parseISO(iso), 'dd/MM', { locale: ptBR })
}

function ColumnHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  )
}

function ColumnMessage({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-4 text-sm text-muted-foreground">{children}</p>
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

function ProcessNewsRow({ news }: { news: ProcessNews }) {
  const meta = [news.clientName, news.court].filter(Boolean).join(' · ')

  return (
    <Link href={`/processos/${news.legalProcessId}`} className={ROW_LINK}>
      {/* Largura mínima: "+42" e "+1" desalinhavam os CNJs das linhas. */}
      <span className="mt-0.5 min-w-9 shrink-0 rounded-md bg-info/12 px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums text-info">
        +{formatCount(news.count)}
      </span>
      <div className="min-w-0 flex-1">
        {/* The CNJ gets the whole line — it is what identifies the row. */}
        <p
          className={cn(
            'truncate text-[13px] font-semibold text-foreground',
            news.cnjNumber && 'font-mono text-xs'
          )}
        >
          {news.cnjNumber ?? news.title ?? 'Processo sem número'}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {meta && `${meta} · `}
          <time dateTime={news.latest.receivedAt}>
            {formatRelative(news.latest.receivedAt)}
          </time>
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-foreground/80">{news.latest.text}</p>
      </div>
    </Link>
  )
}

/** Processos with movements the webhook delivered in the window — grouped,
 * because one processo can get dozens in a burst. */
function ProcessNewsColumn() {
  const { data, isLoading, isError } = useWebhookMovements()
  const { data: processCounts } = useProcessCounts()
  const news = data ? groupProcessNews(data.movements) : []

  return (
    <section className="min-w-0 space-y-2">
      <ColumnHeading>Movimentações · {MONITORING_WINDOW_DAYS} dias</ColumnHeading>

      {isLoading && <RowSkeletons />}
      {isError && <ColumnMessage>Não foi possível carregar as movimentações.</ColumnMessage>}
      {data && news.length === 0 && (
        <ColumnMessage>Nenhuma movimentação nova em {MONITORING_WINDOW_DAYS} dias.</ColumnMessage>
      )}

      {news.length > 0 && (
        <ul className="space-y-1">
          {news.slice(0, ROWS).map((item) => (
            <li key={item.legalProcessId}>
              <ProcessNewsRow news={item} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-muted-foreground">
        {news.length > ROWS && (
          <span>e mais {pluralize(news.length - ROWS, 'processo', 'processos')}</span>
        )}
        {data?.truncated && (
          <span>contando as {formatCount(data.movements.length)} mais recentes</span>
        )}
        {processCounts && (
          <Link href="/processos" className="hover:text-foreground hover:underline">
            {formatCount(processCounts.monitored)} de{' '}
            {pluralize(processCounts.active, 'processo ativo', 'processos ativos')} com
            monitoramento
          </Link>
        )}
      </div>
    </section>
  )
}

// ── Publicações ──────────────────────────────────────────────────────────────

function PublicationRow({
  publication,
  canCreateProcess,
}: {
  publication: PublicationPreview
  canCreateProcess: boolean
}) {
  const orphan = !publication.legal_process_id
  const cnj = publication.cnj_number
  const meta = [publication.diario_sigla, formatDay(publication.publication_date)]
    .filter(Boolean)
    .join(' · ')

  // Link esticado: o título cobre a linha inteira com o `::after`, e o
  // "Cadastrar" fica por cima (`relative`). Um link dentro do outro não seria
  // HTML válido, e um botão ao lado roubava a largura do CNJ.
  return (
    <div className="relative flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring">
      <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warning" />
      <div className="min-w-0 flex-1">
        <Link
          href={`/publicacoes/${publication.id}`}
          className="block truncate text-sm font-medium after:absolute after:inset-0 focus-visible:outline-none"
        >
          {publication.title ?? 'Publicação sem título'}
        </Link>
        <p className="truncate text-[11px] text-muted-foreground">
          {meta} · <span className="font-mono">{cnj ?? 'sem CNJ'}</span>
        </p>
        {orphan && (
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-warning">
            <FileWarning className="h-3 w-3 shrink-0" />
            Processo não cadastrado
            {cnj && canCreateProcess && (
              <Link
                href={registerProcessHref(cnj)}
                className="relative underline underline-offset-2 hover:text-foreground"
              >
                Cadastrar
              </Link>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

/** The head of the unread queue — the work list of `/publicacoes`, not news:
 * a publication stays here until someone reads it. */
function PublicationQueueColumn({ canCreateProcess }: { canCreateProcess: boolean }) {
  const { data: preview, isLoading, isError } = useUnreadPublicationsPreview()
  const { data: unread } = useUnreadPublicationCount()
  const { data: orphans = 0 } = useUnreadOrphanPublicationCount()

  return (
    <section className="min-w-0 space-y-2">
      <ColumnHeading>Publicações não lidas</ColumnHeading>

      {isLoading && <RowSkeletons />}
      {isError && <ColumnMessage>Não foi possível carregar as publicações.</ColumnMessage>}
      {preview && preview.length === 0 && (
        <ColumnMessage>Nenhuma publicação não lida.</ColumnMessage>
      )}

      {preview && preview.length > 0 && (
        <ul className="space-y-1">
          {preview.map((publication) => (
            <li key={publication.id}>
              <PublicationRow publication={publication} canCreateProcess={canCreateProcess} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs">
        <Link
          href="/publicacoes"
          className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
        >
          Ver fila{unread !== undefined && ` (${formatCount(unread)})`}
          <ArrowRight className="h-3 w-3" />
        </Link>
        {orphans > 0 && (
          <span className="text-warning">
            {pluralize(orphans, 'sem processo cadastrado', 'sem processo cadastrado')}
          </span>
        )}
      </div>
    </section>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

interface MonitoringCardProps {
  /** Placement in the dashboard grid (`lg:col-span-N`). */
  className?: string
}

/**
 * What the BuscaProcessos monitoring brought in: movements of registered
 * processos and the publications queue, plus the delivery health for whoever
 * sees Configurações. Each column carries the permission of its own table.
 */
export function MonitoringCard({ className }: MonitoringCardProps) {
  const { can } = usePermissions()
  const showMovements = can('processos', 'view')
  const showPublications = can('publicacoes', 'view')
  const canCreateProcess = can('processos', 'create')

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Radar className="h-4 w-4 text-info" />
          Monitoramento de processos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={cn('grid gap-6', showMovements && showPublications && 'md:grid-cols-2')}
        >
          {showMovements && <ProcessNewsColumn />}
          {showPublications && <PublicationQueueColumn canCreateProcess={canCreateProcess} />}
        </div>
        {can('configuracoes', 'view') && (
          <WebhookHealthStrip canCreateProcess={canCreateProcess} />
        )}
      </CardContent>
    </Card>
  )
}
