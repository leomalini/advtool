'use client'

import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Loader2, RotateCcw, Webhook } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissions } from '@/hooks/usePermissions'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/types/financialEntry.types'
import {
  WEBHOOK_PROVIDERS,
  type WebhookEvent,
  type WebhookEventStatus,
} from '@/types/webhookEvent.types'
import {
  useRealtimeWebhookEvents,
  useReprocessInfinitePayDeliveries,
  useWebhookEvents,
} from '../hooks/useWebhookEvents'

const LIST_LIMIT = 10

const STATUS_LABEL: Record<WebhookEventStatus, string> = {
  received: 'Recebida',
  processed: 'Processada',
  duplicate: 'Repetida',
  ignored: 'Ignorada',
  unmatched: 'Sem cobrança',
  invalid: 'Recusada',
  error: 'Erro',
}

const STATUS_CLASS: Record<WebhookEventStatus, string> = {
  received: 'bg-info/12 text-info',
  processed: 'bg-success/12 text-success',
  duplicate: 'bg-muted text-muted-foreground',
  ignored: 'bg-muted text-muted-foreground',
  unmatched: 'bg-warning/12 text-warning',
  invalid: 'bg-destructive/10 text-destructive',
  error: 'bg-destructive/10 text-destructive',
}

/** Valor que veio no corpo — só para reconhecer a linha; a baixa usa o do
 * `payment_check`. */
function payloadAmount(event: WebhookEvent): number | null {
  const amount = event.payload?.amount
  return typeof amount === 'number' ? amount : null
}

/** Pode voltar a ser processada: passou pelo token e parou no meio. */
function isRetryable(event: WebhookEvent): boolean {
  return event.signature_valid === true && (event.status === 'error' || event.status === 'received')
}

/**
 * As últimas entregas do webhook da InfinitePay: o que chegou, o que deu
 * baixa e o que foi recusado — e por quê. Atualiza sozinha (Realtime).
 */
export function InfinitePayDeliveries() {
  const { can } = usePermissions()
  const { data: events = [], isLoading } = useWebhookEvents({
    provider: WEBHOOK_PROVIDERS.infinitePay,
    limit: LIST_LIMIT,
  })
  useRealtimeWebhookEvents()
  const reprocess = useReprocessInfinitePayDeliveries()

  const canReprocess = can('configuracoes', 'manage') && events.some(isRetryable)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Webhook className="h-4 w-4 text-muted-foreground" />
          Avisos de pagamento
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          As últimas entregas do webhook da InfinitePay. Cada uma é conferida no{' '}
          <code className="rounded bg-muted px-1 py-0.5">payment_check</code> antes da baixa.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum aviso recebido ainda.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {events.map((event) => {
              const amount = payloadAmount(event)
              const detail = event.error ?? event.reason
              return (
                <li
                  key={event.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2"
                >
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {format(parseISO(event.received_at), 'dd/MM HH:mm', { locale: ptBR })}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                      STATUS_CLASS[event.status],
                    )}
                  >
                    {STATUS_LABEL[event.status]}
                  </span>
                  {amount !== null && (
                    <span className="text-sm tabular-nums">{formatCurrency(amount / 100)}</span>
                  )}
                  {detail && (
                    <span className="w-full text-xs text-muted-foreground">{detail}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {canReprocess && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={reprocess.isPending}
              onClick={() => reprocess.mutate()}
            >
              {reprocess.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Reprocessar as que falharam
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Consulta a InfinitePay de novo para as entregas que pararam em erro.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
