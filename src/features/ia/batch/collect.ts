import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  type Experimental_BatchReference as BatchReference,
} from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { AI_ROUTE_SETTINGS, createAnthropicProvider } from '../model'
import { recordBatchUsage } from '../usage/recordUsage'
import { BATCH_JOBS, BATCH_TOOLS } from './jobs'
import type { BatchKind } from './types'

interface PendingRow {
  id: string
  kind: BatchKind
  entity_id: string
  batch_id: string
  batch_ref: BatchReference
  input_hash: string
  context: unknown
  created_at: string
  checked_at: string | null
}

export interface CollectSummary {
  applied: number
  stale: number
  failed: number
  /** Lotes que a Anthropic ainda está processando. */
  waiting: number
}

async function finish(
  admin: SupabaseClient,
  id: string,
  status: 'applied' | 'stale' | 'failed',
  error: string | null = null,
): Promise<void> {
  const { error: updateError } = await admin
    .from('ai_batch_items')
    .update({ status, error, finished_at: new Date().toISOString() })
    .eq('id', id)
  if (updateError) console.error('[ia-lote] baixa do item falhou:', updateError.code, updateError.message)
}

/**
 * Recolhe os lotes prontos e grava cada resultado pelo trabalho dele. Chamado
 * pelo cron diário e quando alguém abre uma tela que mostra o resultado
 * (Publicações, processo) — com `minIntervalMs`, para não consultar a
 * Anthropic a cada clique.
 *
 * Nunca lança: um lote ou um item com problema não para os outros.
 */
export async function collectBatches(
  options: { minIntervalMs?: number } = {},
): Promise<CollectSummary> {
  const summary: CollectSummary = { applied: 0, stale: 0, failed: 0, waiting: 0 }
  if (!hasServiceRoleKey()) return summary
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('ai_batch_items')
    .select('id, kind, entity_id, batch_id, batch_ref, input_hash, context, created_at, checked_at')
    .eq('status', 'pending')
  if (error) {
    console.error('[ia-lote] leitura dos pendentes falhou:', error.code, error.message)
    return summary
  }

  const byBatch = new Map<string, PendingRow[]>()
  for (const row of (data ?? []) as PendingRow[]) {
    byBatch.set(row.batch_id, [...(byBatch.get(row.batch_id) ?? []), row])
  }

  const provider = createAnthropicProvider()
  const now = Date.now()
  for (const [batchId, rows] of byBatch) {
    const lastCheck = Math.max(...rows.map((row) => (row.checked_at ? Date.parse(row.checked_at) : 0)))
    if (options.minIntervalMs && now - lastCheck < options.minIntervalMs) {
      summary.waiting++
      continue
    }

    try {
      await admin
        .from('ai_batch_items')
        .update({ checked_at: new Date().toISOString() })
        .eq('batch_id', batchId)
        .eq('status', 'pending')

      const batch = rows[0].batch_ref
      const status = await getBatchStatus({ provider, batch })
      if (status.status === 'pending') {
        summary.waiting++
        continue
      }
      if (status.status === 'failed') {
        for (const row of rows) {
          await finish(admin, row.id, 'failed', status.error?.message ?? 'o lote falhou')
          summary.failed++
        }
        continue
      }

      const byId = new Map(rows.map((row) => [row.id, row]))
      for await (const item of getBatchResults({ provider, batch, tools: BATCH_TOOLS })) {
        const row = byId.get(item.id)
        if (!row || item.type !== 'text') continue
        byId.delete(item.id)
        const job = BATCH_JOBS[row.kind]

        if (item.status !== 'succeeded') {
          await finish(admin, row.id, 'failed', item.error?.message ?? item.status)
          summary.failed++
          continue
        }

        const modelId = item.response?.modelId ?? AI_ROUTE_SETTINGS[job.route].anthropicModel
        await recordBatchUsage({
          route: job.route,
          model: modelId,
          usage: item.usage,
          finishReason: item.finishReason,
        })

        const call = item.content.find(
          (part) => part.type === 'tool-call' && part.toolName === job.toolName,
        )
        if (!call || call.type !== 'tool-call') {
          await finish(admin, row.id, 'failed', 'o modelo não chamou a tool do resultado')
          summary.failed++
          continue
        }

        const outcome = await job.applyRaw(admin, row.entity_id, call.input, {
          inputHash: row.input_hash,
          context: row.context,
          modelId,
          requestedAt: row.created_at,
        })
        if (outcome === 'invalid') {
          await finish(admin, row.id, 'failed', 'resposta fora do formato')
          summary.failed++
        } else {
          await finish(admin, row.id, outcome)
          summary[outcome]++
        }
      }

      // Pedido sem resultado num lote terminado não volta mais.
      for (const row of byId.values()) {
        await finish(admin, row.id, 'failed', 'sem resultado no lote')
        summary.failed++
      }
    } catch (batchError) {
      console.error(`[ia-lote] coleta do lote ${batchId} falhou:`, batchError)
    }
  }

  if (summary.applied + summary.stale + summary.failed > 0) {
    console.info('[ia-lote] coleta:', summary)
  }
  return summary
}
