'use client'

import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Webhook } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { D4SIGN_WEBHOOK_EVENT_LABELS, type D4SignWebhookEvent } from '@/types/d4sign.types'
import {
  WEBHOOK_PROVIDERS,
  type WebhookEvent,
  type WebhookEventStatus,
} from '@/types/webhookEvent.types'
import { useRealtimeWebhookEvents, useWebhookEvents } from '../hooks/useWebhookEvents'

const LIST_LIMIT = 10

const STATUS_LABEL: Record<WebhookEventStatus, string> = {
  received: 'Recebido',
  processed: 'Processado',
  duplicate: 'Repetido',
  ignored: 'Ignorado',
  unmatched: 'Sem envio',
  invalid: 'Recusado',
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

function isKnownEvent(value: string): value is D4SignWebhookEvent {
  return value in D4SIGN_WEBHOOK_EVENT_LABELS
}

/** O evento como a tela fala; um `type_post` desconhecido aparece pelo número. */
function eventLabel(event: WebhookEvent): string | null {
  if (!event.event) return null
  return isKnownEvent(event.event)
    ? D4SIGN_WEBHOOK_EVENT_LABELS[event.event]
    : `Evento ${event.event}`
}

/**
 * As últimas entregas do webhook da D4Sign — registrado em cada documento, no
 * envio: o que chegou, o que foi recusado e por quê. Atualiza sozinha
 * (Realtime).
 *
 * Nesta fase nada é processado: a lista mostra se os avisos chegam e se o HMAC
 * confere — o que o spike precisa ver.
 */
export function D4SignDeliveries() {
  const { data: events = [], isLoading } = useWebhookEvents({
    provider: WEBHOOK_PROVIDERS.d4sign,
    limit: LIST_LIMIT,
  })
  useRealtimeWebhookEvents()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Webhook className="h-4 w-4 text-muted-foreground" />
          Avisos da D4Sign
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          As últimas entregas do webhook, cada uma com o HMAC conferido. Só chegam avisos dos
          documentos que o app enviou.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum aviso recebido ainda.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {events.map((event) => {
              const label = eventLabel(event)
              // O motivo diz o que fazer; o erro cru, o que o banco respondeu.
              const detail = [event.reason, event.error && `(${event.error})`]
                .filter(Boolean)
                .join(' ')
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
                  {label && <span className="text-sm">{label}</span>}
                  {event.is_test && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Sandbox
                    </span>
                  )}
                  {detail && (
                    <span className="w-full text-xs text-muted-foreground">{detail}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
