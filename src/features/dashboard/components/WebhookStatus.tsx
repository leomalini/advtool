'use client'

import Link from 'next/link'
import { AlertTriangle, ChevronDown, FileWarning, Webhook } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/utils/date'
import type { DashboardWebhookHealth } from '@/lib/buscaprocessos/webhookHealth'
import { useWebhookHealth } from '../hooks/useDashboardStats'
import { pluralize } from '../utils/format'
import { registerProcessHref } from '../utils/links'
import { CardLink } from './CardLink'

const WEBHOOKS_SETTINGS_PATH = '/configuracoes?aba=webhooks'

type StatusTone = 'success' | 'warning' | 'danger' | 'muted'

const PILL_TONES: Record<StatusTone, string> = {
  success: 'border-success/30 bg-success/8',
  warning: 'border-warning/35 bg-warning/10',
  danger: 'border-destructive/35 bg-destructive/10 text-destructive',
  muted: 'bg-card',
}

const DOT_TONES: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  muted: 'bg-muted-foreground/60',
}

function lastRefused(health: DashboardWebhookHealth): boolean {
  return health.lastDelivery?.status === 'invalid'
}

function pendingReplays(health: DashboardWebhookHealth): number {
  return health.pendingReplay.available ? health.pendingReplay.count : 0
}

/** One line for the pill: the worst thing going on, or that all is well. */
function summarize(health: DashboardWebhookHealth): { tone: StatusTone; label: string } {
  if (lastRefused(health)) return { tone: 'danger', label: 'Última entrega recusada' }
  const pending = pendingReplays(health)
  if (pending > 0) {
    return {
      tone: 'warning',
      label: pluralize(pending, 'recusada a reprocessar', 'recusadas a reprocessar'),
    }
  }
  if (health.unregistered.length > 0) {
    return {
      tone: 'warning',
      label: pluralize(
        health.unregistered.length,
        'monitorado sem cadastro',
        'monitorados sem cadastro'
      ),
    }
  }
  if (!health.lastDelivery) return { tone: 'muted', label: 'Sem entregas ainda' }
  return {
    tone: 'success',
    label: `Entregas em dia · ${formatRelative(health.lastDelivery.receivedAt)}`,
  }
}

function HealthDetails({
  health,
  canCreateProcess,
}: {
  health: DashboardWebhookHealth
  canCreateProcess: boolean
}) {
  const pending = pendingReplays(health)

  return (
    <div className="space-y-3 text-xs">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Webhook aria-hidden className="size-4 text-muted-foreground" />
        BuscaProcessos
      </p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
        <dt>Última entrega</dt>
        <dd className="text-foreground">
          {health.lastDelivery ? formatRelative(health.lastDelivery.receivedAt) : 'nenhuma ainda'}
        </dd>
        <dt>Em 24 h</dt>
        <dd className="text-foreground">
          {pluralize(health.deliveriesLast24h, 'entrega', 'entregas')}
        </dd>
        {pending > 0 && (
          <>
            <dt>A reprocessar</dt>
            <dd className="font-medium text-warning">
              {pluralize(pending, 'recusada', 'recusadas')}
            </dd>
          </>
        )}
      </dl>

      {lastRefused(health) && (
        <p className="flex items-start gap-1.5 font-medium text-destructive">
          <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" />
          A última entrega foi recusada. Confira a credencial em Configurações.
        </p>
      )}

      {health.unregistered.map((process) => (
        <div key={process.cnj} className="space-y-0.5 rounded-md bg-warning/8 px-2.5 py-2 text-warning">
          <p className="flex items-center gap-1.5 font-semibold">
            <FileWarning aria-hidden className="size-3.5 shrink-0" />
            Monitorado e não cadastrado
          </p>
          <p className="font-mono text-foreground">{process.cnj}</p>
          <p>
            {pluralize(process.deliveries, 'movimentação sem destino', 'movimentações sem destino')}{' '}
            em {health.unregisteredWindowDays} dias
            {canCreateProcess && (
              <>
                {' · '}
                <Link
                  href={registerProcessHref(process.cnj)}
                  className="font-semibold underline underline-offset-2"
                >
                  Cadastrar
                </Link>
              </>
            )}
          </p>
        </div>
      ))}

      <CardLink href={WEBHOOKS_SETTINGS_PATH} strong>
        Ver entregas
      </CardLink>
    </div>
  )
}

/**
 * The BuscaProcessos delivery health as a pill in the monitoring card's
 * header, details in a popover. Rendered only for `configuracoes:view` — the
 * RLS of `webhook_events` — so the query never runs for a role that would get
 * a 403.
 *
 * The last delivery is the line that matters most: from 10 to 23/09/2026 every
 * delivery was refused for a mistyped token, and only the log showed it. That
 * one also shows inside the card (`WebhookRefusedAlert`), not only on click.
 */
export function WebhookStatusPill({ canCreateProcess }: { canCreateProcess: boolean }) {
  const { data: health, isLoading, isError } = useWebhookHealth()

  if (isLoading) return <Skeleton className="h-7 w-44 rounded-full" />

  const { tone, label } = health
    ? summarize(health)
    : { tone: 'muted' as const, label: isError ? 'Entregas indisponíveis' : 'Sem dados' }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-7 max-w-[16rem] items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors hover:bg-muted',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            PILL_TONES[tone]
          )}
        >
          <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT_TONES[tone])} />
          <span className="truncate">{label}</span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {health ? (
          <HealthDetails health={health} canCreateProcess={canCreateProcess} />
        ) : (
          <p className="text-sm text-muted-foreground">Não foi possível ler as entregas do webhook.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** The one health problem that shouldn't wait for a click. */
export function WebhookRefusedAlert() {
  const { data: health } = useWebhookHealth()
  if (!health || !lastRefused(health)) return null

  return (
    <p className="mx-2 flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs font-medium text-destructive">
      <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
      A última entrega da BuscaProcessos foi recusada. Confira a credencial em Configurações.
    </p>
  )
}
