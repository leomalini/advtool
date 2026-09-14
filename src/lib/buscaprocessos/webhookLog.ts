import type { SupabaseClient } from '@supabase/supabase-js'
import type { WebhookDestination, WebhookStatus } from './webhook'

/**
 * Registro do que chegou pelo webhook e do que foi feito com aquilo.
 *
 * O endpoint responde 200 mesmo quando não processa nada — de propósito, para
 * a BuscaProcessos não ficar retentando o que nunca vai dar certo. O efeito é
 * que ele era invisível: não havia como responder "chegou?", "a assinatura
 * conferiu?", "para onde foi o dado?". Cada requisição vira uma linha em
 * `webhook_events`, e é essa linha que a tela de Configurações mostra.
 *
 * Best-effort: falhar ao registrar não pode derrubar a entrega. Uma
 * movimentação gravada e não registrada é melhor que uma entrega recusada.
 */

export interface WebhookEventLog {
  event?: string | null
  externalId?: string | null
  /** Null quando não havia segredo configurado para conferir. */
  signatureValid?: boolean | null
  isTest?: boolean
  dryRun?: boolean
  status: WebhookStatus | 'received' | 'invalid'
  destinations?: WebhookDestination[]
  reason?: string | null
  error?: string | null
  payload?: unknown
  headers?: Record<string, string | null>
  durationMs?: number
}

export async function recordWebhookEvent(
  supabase: SupabaseClient,
  log: WebhookEventLog,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('webhook_events')
    .insert({
      provider: 'busca_processos',
      event: log.event ?? null,
      external_id: log.externalId ?? null,
      signature_valid: log.signatureValid ?? null,
      is_test: log.isTest ?? false,
      dry_run: log.dryRun ?? false,
      status: log.status,
      destinations: log.destinations ?? [],
      reason: log.reason ?? null,
      error: log.error ?? null,
      payload: log.payload ?? null,
      headers: log.headers ?? null,
      duration_ms: log.durationMs ?? null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[buscaprocessos/webhook] log não gravado:', error.message)
    return null
  }

  return data.id as string
}

/**
 * Só o que serve para diagnosticar. A assinatura entra como presença, não como
 * valor: guardar o HMAC de cada entrega num log legível pela tela não ajuda
 * ninguém a depurar e amplia o que vaza se o log vazar.
 */
export function diagnosticHeaders(headers: Headers): Record<string, string | null> {
  return {
    event: headers.get('x-buscaprocessos-event'),
    signature_present: headers.get('x-buscaprocessos-signature') ? 'true' : 'false',
    content_type: headers.get('content-type'),
    user_agent: headers.get('user-agent'),
    // NOMES, não valores. É o que responde "a origem manda assinatura com outro
    // nome?" — pergunta que `signature_present: false` deixa aberta e que, sem
    // isto, só se responde adivinhando nomes de cabeçalho.
    header_names: [...headers.keys()].sort().join(', '),
  }
}
