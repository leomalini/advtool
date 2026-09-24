'use client'

import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CheckCircle2, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useReplayRejectedWebhooks,
  type ReplayRoundResult,
  type WebhookHealth,
} from '../hooks/useWebhookEvents'

/**
 * Situação real do recebimento: a última entrega da BuscaProcessos e as
 * recusas que ainda esperam reprocessamento.
 *
 * O painel de cima diz o que está CONFIGURADO. Entre 10 e 23/09/2026 ele dizia
 * "token aceito como alternativa" enquanto toda entrega voltava 401 — a
 * variável existia, só estava sem o primeiro caractere. Configurado não é
 * funcionando; quem responde isso é a última entrega.
 */

const REPLAY_STATUS_LABEL: Record<string, string> = {
  processed: 'gravadas',
  duplicate: 'já existiam',
  unmatched: 'sem processo cadastrado',
  ignored: 'ignoradas',
  error: 'com erro',
}

function formatDateTime(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yy 'às' HH:mm", { locale: ptBR })
  } catch {
    return '—'
  }
}

function describeRound(result: ReplayRoundResult): string {
  const total = result.outcomes.length
  if (total === 0) return 'Nenhuma recusa pendente.'

  const parts = Object.entries(result.byStatus).map(
    ([status, count]) => `${count} ${REPLAY_STATUS_LABEL[status] ?? status}`,
  )
  const remaining = result.remaining > 0 ? ` Restam ${result.remaining}.` : ''
  return `${total} reprocessada(s): ${parts.join(', ')}.${remaining}`
}

export function WebhookHealthPanel({ health }: { health: WebhookHealth }) {
  const replay = useReplayRejectedWebhooks()
  const { lastDelivery, pendingReplay } = health

  const rejected = lastDelivery?.status === 'invalid'
  const pendingCount = pendingReplay.available ? pendingReplay.count : 0

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Situação agora
      </p>

      {lastDelivery ? (
        <div
          className={cn(
            'rounded-md border p-3',
            rejected ? 'border-destructive/30 bg-destructive/5' : 'border-success/30 bg-success/5',
          )}
        >
          <p
            className={cn(
              'flex items-center gap-1.5 text-sm font-medium',
              rejected ? 'text-destructive' : 'text-success',
            )}
          >
            {rejected ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {rejected
              ? 'A última entrega da BuscaProcessos foi recusada'
              : 'A última entrega da BuscaProcessos foi aceita'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDateTime(lastDelivery.receivedAt)}
            {lastDelivery.event ? ` · ${lastDelivery.event}` : ''}
          </p>
          {rejected && lastDelivery.error && (
            <p className="mt-2 break-words font-mono text-[10.5px] leading-relaxed text-destructive/90">
              {lastDelivery.error}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nenhuma entrega da BuscaProcessos registrada ainda.
        </p>
      )}

      {pendingReplay.available ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant={pendingCount > 0 ? 'default' : 'outline'}
            onClick={() => replay.mutate()}
            disabled={replay.isPending || pendingCount === 0}
          >
            {replay.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            )}
            {pendingCount > 0
              ? `Reprocessar ${pendingCount} recusada${pendingCount > 1 ? 's' : ''}`
              : 'Nenhuma recusa pendente'}
          </Button>

          {/* Largura mínima: sem ela, no celular o texto vira uma coluna de uma palavra
              ao lado do botão, em vez de descer para a linha de baixo. */}
          <p className="min-w-[14rem] flex-1 text-xs text-muted-foreground">
            {replay.data
              ? describeRound(replay.data)
              : 'Entregas recusadas guardam o corpo inteiro. Reprocessar passa cada uma pelo ' +
                'mesmo tratamento da entrega aceita — o que já existe vira duplicata, nada se repete.'}
          </p>
        </div>
      ) : (
        <p className="text-xs text-warning">
          Reprocessar pela tela precisa da migration 65 (
          <code className="rounded bg-muted px-1">npm run db:push</code>). Até lá, use{' '}
          <code className="rounded bg-muted px-1">npm run webhook:replay</code>.
        </p>
      )}
    </div>
  )
}
