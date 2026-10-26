// Server-side. O client é a service_role: `webhook_events` só aceita escrita
// por ela (migration 48).
//
// Cada aviso vira uma linha em `webhook_events` ANTES de qualquer
// processamento (a rota responde rápido); o que ele muda corre depois, em
// `after()`, e o resultado é anotado na mesma linha.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WebhookEventStatus } from '@/types/webhookEvent.types'
import { D4SignApiError, redactD4SignSecrets } from './client'
import {
  cancelFromD4Sign,
  finishRequest,
  markSignerFromNotice,
  parseD4SignDateTime,
  type ProcessOutcome,
} from './finish'
import { loadRequest } from './requests'
import type { D4SignDelivery } from './webhook'

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * O e-mail de quem o aviso fala. Na versão 1.0 vem em `email`; na 2.0, dentro
 * de `signer` — que num corpo urlencoded pode chegar como `signer[email]` ou
 * como JSON em texto. Ainda não visto num aviso real (só o de cancelamento).
 */
export function noticeEmail(fields: Record<string, unknown>): string | null {
  const direct = text(fields.email) ?? text(fields['signer[email]'])
  if (direct) return direct

  let signer = fields.signer
  if (typeof signer === 'string') {
    try {
      signer = JSON.parse(signer)
    } catch {
      return null
    }
  }
  return typeof signer === 'object' && signer !== null
    ? text((signer as Record<string, unknown>).email)
    : null
}

/** Processa um aviso já gravado e anota o resultado na mesma linha. */
export async function processD4SignDelivery(
  supabase: SupabaseClient,
  input: {
    eventId: string
    requestId: string
    delivery: D4SignDelivery
    fields: Record<string, unknown>
    startedAt: number
  },
): Promise<void> {
  const { delivery, fields } = input
  const at = parseD4SignDateTime(fields.event_datetime)

  let update: { status: WebhookEventStatus; reason: string | null; error: string | null; destinations: ProcessOutcome['destinations'] }
  try {
    const request = await loadRequest(supabase, input.requestId)
    if (!request) throw new Error('O envio sumiu entre a chegada do aviso e o processamento.')

    let outcome: ProcessOutcome
    switch (delivery.event) {
      case 'finalizado':
        outcome = await finishRequest(supabase, request, { signedAt: at, via: 'webhook' })
        break
      case 'cancelado':
        outcome = await cancelFromD4Sign(supabase, request, {
          reason: text(fields.cancellation_message),
          via: 'webhook',
        })
        break
      case 'assinado':
        outcome = await markSignerFromNotice(supabase, request, {
          email: noticeEmail(fields),
          event: 'signed',
          at,
          via: 'webhook',
        })
        break
      case 'email_nao_entregue':
        outcome = await markSignerFromNotice(supabase, request, {
          email: noticeEmail(fields),
          event: 'email_failed',
          at,
          via: 'webhook',
        })
        break
      default:
        outcome = {
          status: 'ignored',
          reason: `Evento ${delivery.typePost} não é tratado.`,
          destinations: [],
        }
    }
    update = { ...outcome, error: null }
  } catch (error) {
    const message =
      error instanceof D4SignApiError
        ? error.message
        : redactD4SignSecrets(error instanceof Error ? error.message : String(error))
    console.error('[d4sign/webhook] aviso não processado:', input.eventId, message)
    update = {
      status: 'error',
      reason: 'Falha ao processar — "Atualizar status" no contrato tenta de novo.',
      error: message,
      destinations: [],
    }
  }

  const { error } = await supabase
    .from('webhook_events')
    .update({ ...update, duration_ms: Date.now() - input.startedAt })
    .eq('id', input.eventId)
  if (error) console.error('[d4sign/webhook] resultado não anotado:', input.eventId, error.message)
}
