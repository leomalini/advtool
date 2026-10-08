'use client'

import Link from 'next/link'
import { AlertTriangle, FileWarning, Webhook } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/utils/date'
import { useWebhookHealth } from '../hooks/useDashboardStats'
import { pluralize } from '../utils/format'
import { registerProcessHref } from '../utils/links'

const WEBHOOKS_SETTINGS_PATH = '/configuracoes?aba=webhooks'

interface WebhookHealthStripProps {
  canCreateProcess: boolean
}

/**
 * The BuscaProcessos delivery health, inside the monitoring card. Rendered only
 * for `configuracoes:view` — the RLS of `webhook_events` — so the query behind
 * it never runs for a role that would get a 403.
 *
 * The last delivery is the line that matters most: from 10 to 23/09/2026 every
 * delivery was refused for a mistyped token, and only the log showed it.
 */
export function WebhookHealthStrip({ canCreateProcess }: WebhookHealthStripProps) {
  const { data: health, isLoading, isError } = useWebhookHealth()

  if (isLoading) return <Skeleton className="h-9 w-full rounded-lg" />

  if (isError || !health) {
    return (
      <p className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
        Não foi possível ler as entregas do webhook.
      </p>
    )
  }

  const lastRefused = health.lastDelivery?.status === 'invalid'
  const pending = health.pendingReplay.available ? health.pendingReplay.count : 0
  const needsAttention = lastRefused || pending > 0 || health.unregistered.length > 0

  return (
    <div
      className={cn(
        'space-y-1.5 rounded-lg border px-3 py-2 text-xs',
        needsAttention ? 'border-warning/30 bg-warning/[0.04]' : 'bg-muted/30'
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <Webhook className="h-3.5 w-3.5" />
          BuscaProcessos
        </span>
        <span>
          {health.lastDelivery
            ? `última entrega ${formatRelative(health.lastDelivery.receivedAt)}`
            : 'nenhuma entrega recebida'}
        </span>
        <span>{pluralize(health.deliveriesLast24h, 'entrega em 24 h', 'entregas em 24 h')}</span>
        {pending > 0 && (
          <span className="font-medium text-warning">
            {pluralize(
              pending,
              'recusada esperando reprocessamento',
              'recusadas esperando reprocessamento'
            )}
          </span>
        )}
        <Link
          href={WEBHOOKS_SETTINGS_PATH}
          className="ml-auto font-medium text-foreground hover:underline"
        >
          Ver entregas
        </Link>
      </div>

      {lastRefused && (
        <p className="flex items-center gap-1.5 font-medium text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          A última entrega foi recusada. Confira a credencial em Configurações.
        </p>
      )}

      {health.unregistered.map((process) => (
        <p
          key={process.cnj}
          className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-warning"
        >
          <FileWarning className="h-3.5 w-3.5 shrink-0" />
          <span>Monitorado e não cadastrado:</span>
          <span className="font-mono">{process.cnj}</span>
          <span>
            ·{' '}
            {pluralize(
              process.deliveries,
              'movimentação sem destino',
              'movimentações sem destino'
            )}{' '}
            em {health.unregisteredWindowDays} dias
          </span>
          {canCreateProcess && (
            <Link
              href={registerProcessHref(process.cnj)}
              className="font-medium underline underline-offset-2"
            >
              Cadastrar
            </Link>
          )}
        </p>
      ))}
    </div>
  )
}
