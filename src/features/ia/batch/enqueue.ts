import {
  experimental_startBatch as startBatch,
  type Experimental_TextBatchRequest as TextBatchRequest,
} from 'ai'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { AI_ROUTE_SETTINGS, createAnthropicProvider } from '../model'
import { checkAiBudget } from '../usage/budget'
import { BATCH_JOBS, type RegisteredBatchJob } from './jobs'
import type { BatchKind } from './types'

export interface EnqueueResult {
  sent: number
  /** Pedidos que já esperavam resultado e não foram mandados de novo. */
  waiting: number
}

export interface BatchWork {
  kind: BatchKind
  entityId: string
}

/** Um pedido do lote: as instruções do trabalho, os dados do registro e a
 * tool que leva a resposta. */
export function toBatchRequest(
  id: string,
  job: RegisteredBatchJob,
  userText: string,
): TextBatchRequest {
  const settings = AI_ROUTE_SETTINGS[job.route]
  return {
    id,
    type: 'text',
    model: settings.anthropicModel,
    instructions: job.instructions,
    messages: [{ role: 'user', content: userText }],
    tools: { [job.toolName]: job.tool },
    // Forçar a tool é 400 no Opus 5.5: `auto` e a instrução.
    toolChoice: 'auto',
    maxOutputTokens: job.maxOutputTokens,
    providerOptions: {
      anthropic: { thinking: { type: 'adaptive' }, effort: settings.effort },
    },
  }
}

/** O lote só existe na Anthropic; com o Gemini (`AI_ASSISTANT_PROVIDER`), nada sai. */
function batchAvailable(): boolean {
  const provider = (process.env.AI_ASSISTANT_PROVIDER ?? 'anthropic').trim().toLowerCase()
  return provider === 'anthropic' && Boolean(process.env.ANTHROPIC_API_KEY)
}

/**
 * Manda para a Batch API o que ainda não está esperando resultado: um pedido
 * por trabalho e registro (o índice único de `ai_batch_items` garante). O
 * resultado é gravado depois, por `collectBatches`.
 *
 * Pela service_role, sem sessão: quem chama é o webhook, o sync ou a tela
 * depois de responder. Nunca lança; o motivo de uma falha fica no log
 * `[ia-lote]`.
 */
export async function enqueueBatch(work: BatchWork[]): Promise<EnqueueResult> {
  if (work.length === 0 || !hasServiceRoleKey() || !batchAvailable()) return { sent: 0, waiting: 0 }
  const admin = createAdminClient()

  try {
    const budget = await checkAiBudget()
    if (!budget.ok) {
      console.warn('[ia-lote] fora do teto ou indisponível: nada enviado.')
      return { sent: 0, waiting: 0 }
    }

    const unique = [...new Map(work.map((w) => [`${w.kind}:${w.entityId}`, w])).values()]
    const { data: pending, error } = await admin
      .from('ai_batch_items')
      .select('kind, entity_id')
      .eq('status', 'pending')
      .in('entity_id', unique.map((w) => w.entityId))
    if (error) throw error
    const waiting = new Set((pending ?? []).map((row) => `${row.kind}:${row.entity_id}`))

    const requests: TextBatchRequest[] = []
    const rows: Record<string, unknown>[] = []
    for (const item of unique) {
      if (waiting.has(`${item.kind}:${item.entityId}`)) continue
      const job = BATCH_JOBS[item.kind]
      try {
        const prepared = await job.prepare(admin, item.entityId)
        if (!prepared) continue
        // O id do pedido é o da linha: liga resultado e registro, e cabe no
        // formato da Anthropic (letras, dígitos, hífen; até 64).
        const id = crypto.randomUUID()
        requests.push(toBatchRequest(id, job, prepared.userText))
        rows.push({
          id,
          kind: item.kind,
          entity_id: item.entityId,
          custom_id: id,
          input_hash: prepared.inputHash,
          context: prepared.context ?? null,
        })
      } catch (prepareError) {
        console.error(`[ia-lote] preparar ${item.kind} ${item.entityId} falhou:`, prepareError)
      }
    }
    const skipped = unique.filter((w) => waiting.has(`${w.kind}:${w.entityId}`)).length
    if (requests.length === 0) return { sent: 0, waiting: skipped }

    const batch = await startBatch({ provider: createAnthropicProvider(), requests })
    for (const warning of batch.warnings ?? []) console.warn('[ia-lote] aviso do lote:', warning)

    const reference = { version: batch.version, id: batch.id, provider: batch.provider }
    const { error: insertError } = await admin
      .from('ai_batch_items')
      .insert(rows.map((row) => ({ ...row, batch_id: batch.id, batch_ref: reference })))
    // O lote já saiu: sem as linhas, os resultados dele são ignorados na
    // coleta e o próximo gatilho pede de novo.
    if (insertError) {
      console.error('[ia-lote] registro do lote falhou:', insertError.code, insertError.message)
      return { sent: 0, waiting: 0 }
    }

    console.info(`[ia-lote] ${requests.length} pedido(s) no lote ${batch.id}.`)
    return { sent: requests.length, waiting: skipped }
  } catch (error) {
    console.error('[ia-lote] envio falhou:', error)
    return { sent: 0, waiting: 0 }
  }
}
