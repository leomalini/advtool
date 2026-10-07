// Server-side. O client é a service_role: `webhook_events` só aceita escrita
// por ela (migration 48).
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  WEBHOOK_PROVIDERS,
  type WebhookEventDestination,
  type WebhookEventStatus,
} from '@/types/webhookEvent.types'
import { confirmPayment, type ConfirmOutcome } from './confirm'
import { infinitePayWebhookSchema, type InfinitePayWebhook } from './schemas'

/**
 * As entregas do webhook da InfinitePay em `webhook_events`.
 *
 * Cada POST vira uma linha ANTES de qualquer processamento — é o que permite
 * responder 200 em menos de 1 s e confirmar depois (`after()`), e é o corpo cru
 * guardado que torna o reprocessamento possível. A mesma linha é atualizada
 * com o resultado: `processed`, `duplicate`, `invalid` ou `error`.
 */

export const INFINITEPAY_PAYMENT_EVENT = 'pagamento_aprovado'

/** Entrega parada há menos que isso pode estar sendo processada agora. */
const IN_FLIGHT_MS = 60_000

/** Por rodada de reprocessamento: cada entrega consulta a InfinitePay. */
export const REPROCESS_BATCH_SIZE = 20

/**
 * O que ajuda a diagnosticar, e nada que sirva de credencial. O token vem na
 * URL e não é gravado. Os NOMES dos cabeçalhos respondem a pergunta que a
 * documentação deixa aberta: a InfinitePay manda alguma assinatura?
 */
export function infinitePayDiagnosticHeaders(headers: Headers): Record<string, string | null> {
  return {
    content_type: headers.get('content-type'),
    user_agent: headers.get('user-agent'),
    header_names: [...headers.keys()].sort().join(', '),
  }
}

function toEventUpdate(outcome: ConfirmOutcome): {
  status: WebhookEventStatus
  reason: string | null
  error: string | null
  destinations: WebhookEventDestination[]
} {
  switch (outcome.status) {
    case 'processed':
    case 'duplicate':
      return {
        status: outcome.status,
        reason:
          outcome.reason ??
          (outcome.status === 'duplicate' && !outcome.settled ? 'Transação já registrada.' : null),
        error: null,
        destinations: outcome.destinations,
      }
    case 'invalid':
      return { status: 'invalid', reason: outcome.reason, error: null, destinations: [] }
    case 'error':
      return {
        status: 'error',
        reason: 'Falha ao confirmar — dá para reprocessar.',
        error: outcome.error,
        destinations: [],
      }
  }
}

/** Confirma uma entrega já gravada e anota o resultado na mesma linha. */
export async function processInfinitePayDelivery(
  supabase: SupabaseClient,
  eventId: string,
  delivery: InfinitePayWebhook,
  startedAt: number,
): Promise<ConfirmOutcome> {
  const outcome = await confirmPayment(supabase, {
    orderNsu: delivery.order_nsu,
    transactionNsu: delivery.transaction_nsu,
    slug: delivery.invoice_slug,
    receiptUrl: delivery.receipt_url,
    captureMethod: delivery.capture_method,
    via: 'webhook',
  })

  const { error } = await supabase
    .from('webhook_events')
    .update({ ...toEventUpdate(outcome), duration_ms: Date.now() - startedAt })
    .eq('id', eventId)
  if (error) console.error('[infinitepay/webhook] resultado não anotado:', eventId, error.message)

  return outcome
}

export interface ReprocessResult {
  processed: number
  settled: number
  stillFailing: number
  remaining: number
}

function pendingDeliveries(supabase: SupabaseClient, columns: string, head = false) {
  return supabase
    .from('webhook_events')
    .select(columns, head ? { count: 'exact', head: true } : undefined)
    .eq('provider', WEBHOOK_PROVIDERS.infinitePay)
    .eq('is_test', false)
    // Só o que passou pelo token na chegada: reprocessar não é lugar de
    // reavaliar uma entrega que nem era desta cobrança.
    .eq('signature_valid', true)
    .in('status', ['error', 'received'])
    .lt('received_at', new Date(Date.now() - IN_FLIGHT_MS).toISOString())
}

/**
 * Tenta de novo as entregas que pararam em `error` (a InfinitePay ou o banco
 * falharam) ou ficaram em `received` (a função terminou antes do `after()`).
 * O corpo guardado volta a passar por `confirmPayment`, que é idempotente.
 */
export async function reprocessInfinitePayDeliveries(
  supabase: SupabaseClient,
): Promise<ReprocessResult> {
  const { data, error } = await pendingDeliveries(supabase, 'id, payload')
    .order('received_at', { ascending: true })
    .limit(REPROCESS_BATCH_SIZE)
  if (error) throw error

  const result: ReprocessResult = { processed: 0, settled: 0, stillFailing: 0, remaining: 0 }

  for (const row of (data ?? []) as unknown as { id: string; payload: unknown }[]) {
    const startedAt = Date.now()
    const parsed = infinitePayWebhookSchema.safeParse(row.payload)
    const outcome: ConfirmOutcome = parsed.success
      ? await processInfinitePayDelivery(supabase, row.id, parsed.data, startedAt)
      : { status: 'invalid', reason: 'Corpo guardado fora do formato do webhook.' }

    const { error: markError } = await supabase
      .from('webhook_events')
      .update({
        replayed_at: new Date().toISOString(),
        ...(parsed.success ? {} : toEventUpdate(outcome)),
      })
      .eq('id', row.id)
    if (markError) {
      console.error('[infinitepay/webhook] reprocesso não marcado:', row.id, markError.message)
    }

    result.processed += 1
    if ('settled' in outcome && outcome.settled) result.settled += 1
    if (outcome.status === 'error') result.stillFailing += 1
  }

  const { count } = await pendingDeliveries(supabase, 'id', true)
  result.remaining = count ?? 0
  return result
}
