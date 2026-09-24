// Server-side. O client é o `service_role` da rota de administração: o log e as
// tabelas de destino só aceitam escrita por ele.
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleBpWebhook, HANDLED_WEBHOOK_EVENTS } from './webhook'
import { markReplayed, recordWebhookEvent } from './webhookLog'
import type { BpWebhookPayload } from './types'

/**
 * Reprocessa entregas que o endpoint recusou.
 *
 * A recusa guarda o corpo inteiro em `webhook_events` — é isso que torna a
 * recuperação possível. Aqui o corpo guardado volta a passar por
 * `handleBpWebhook`, o mesmo caminho da entrega aceita, então a deduplicação
 * decide o que é novo exatamente como decidiria na hora.
 *
 * Sem HTTP e sem assinatura, ao contrário de `scripts/replay-webhooks.mjs`: quem
 * chama já passou pela autorização de admin, e o corpo foi registrado pelo
 * próprio endpoint. Reassinar seria provar a nós mesmos algo que já sabemos.
 *
 * Depende da migration 65 (`replayed_at`/`replay_of`). Sem ela a fila de
 * pendentes não existe e as funções respondem `unavailable`, em vez de
 * reprocessar tudo de novo a cada clique.
 */

/** Por rodada. Cada entrega leva algumas consultas; mais que isso arrisca o
 * tempo máximo da função na Vercel. A tela oferece a próxima rodada. */
export const REPLAY_BATCH_SIZE = 25

/** Coluna ausente: a migration 65 não foi aplicada nesta base. */
const UNDEFINED_COLUMN = '42703'

interface PendingRow {
  id: string
  received_at: string
  event: string | null
  payload: unknown
  headers: Record<string, string | null> | null
}

export type PendingCount = { available: true; count: number } | { available: false }

/**
 * Recusas reais que ainda não foram recuperadas, só dos eventos com tratamento.
 *
 * O evento é lido do CORPO (`payload->>event`), não da coluna: as recusas de
 * antes de 14/09/2026 não tinham o evento gravado na coluna, e as entregas sem
 * o cabeçalho `x-buscaprocessos-event` também não têm.
 */
function pendingQuery(supabase: SupabaseClient, columns: string, head = false) {
  return supabase
    .from('webhook_events')
    .select(columns, head ? { count: 'exact', head: true } : undefined)
    .eq('status', 'invalid')
    .eq('is_test', false)
    .is('replayed_at', null)
    .in('payload->>event', [...HANDLED_WEBHOOK_EVENTS])
}

export async function countPendingRejections(supabase: SupabaseClient): Promise<PendingCount> {
  const { count, error } = await pendingQuery(supabase, 'id', true)

  if (error) {
    if (error.code === UNDEFINED_COLUMN) return { available: false }
    throw new Error(`Contagem das recusas falhou: ${error.message}`)
  }

  return { available: true, count: count ?? 0 }
}

export interface ReplayOutcome {
  /** A linha recusada. */
  rejectedId: string
  receivedAt: string
  event: string | null
  status: string
  reason?: string
}

export type ReplayResult =
  | { available: false }
  | {
      available: true
      outcomes: ReplayOutcome[]
      byStatus: Record<string, number>
      /** Pendentes que sobraram para a próxima rodada. */
      remaining: number
    }

export async function replayRejectedDeliveries(supabase: SupabaseClient): Promise<ReplayResult> {
  const { data, error } = await pendingQuery(supabase, 'id, received_at, event, payload, headers')
    .order('received_at', { ascending: true })
    .limit(REPLAY_BATCH_SIZE)

  if (error) {
    if (error.code === UNDEFINED_COLUMN) return { available: false }
    throw new Error(`Leitura das recusas falhou: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as PendingRow[]
  const outcomes: ReplayOutcome[] = []

  // Em sequência, de propósito: duas entregas da mesma publicação no mesmo lote
  // em paralelo passariam juntas pela checagem de duplicata antes de gravar.
  for (const row of rows) {
    outcomes.push(await replayOne(supabase, row))
  }

  const byStatus: Record<string, number> = {}
  for (const outcome of outcomes) byStatus[outcome.status] = (byStatus[outcome.status] ?? 0) + 1

  const pending = await countPendingRejections(supabase)

  return {
    available: true,
    outcomes,
    byStatus,
    remaining: pending.available ? pending.count : 0,
  }
}

async function replayOne(supabase: SupabaseClient, row: PendingRow): Promise<ReplayOutcome> {
  const startedAt = Date.now()
  const payload = row.payload as BpWebhookPayload
  const base = { rejectedId: row.id, receivedAt: row.received_at }

  try {
    const result = await handleBpWebhook(supabase, payload, {
      eventOverride: row.headers?.['event'] ?? null,
    })

    await recordWebhookEvent(supabase, {
      event: result.event,
      externalId: payload.id ?? payload.uuid ?? null,
      // Não houve conferência: o corpo veio do nosso próprio registro.
      signatureValid: null,
      status: result.status,
      destinations: result.destinations,
      reason: result.reason,
      payload,
      headers: { origin: 'reprocessamento', replay_of: row.id },
      durationMs: Date.now() - startedAt,
      replayOf: row.id,
    })
    await markReplayed(supabase, row.id)

    return { ...base, event: result.event, status: result.status, reason: result.reason }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha inesperada'
    console.error('[buscaprocessos/webhook] reprocessamento falhou:', err)

    // A recusa continua pendente: sem `markReplayed`, ela volta na próxima rodada.
    await recordWebhookEvent(supabase, {
      event: payload.event ?? row.event ?? null,
      externalId: payload.id ?? payload.uuid ?? null,
      signatureValid: null,
      status: 'error',
      error: message,
      payload,
      headers: { origin: 'reprocessamento', replay_of: row.id },
      durationMs: Date.now() - startedAt,
      replayOf: row.id,
    })

    return { ...base, event: payload.event ?? row.event ?? null, status: 'error', reason: message }
  }
}
