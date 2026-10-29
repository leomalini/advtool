import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { collectBatches } from '@/features/ia/batch/collect'
import { enqueueBatch } from '@/features/ia/batch/enqueue'
import type { ProcessSummaryRecord } from './summarySchema'

/** Ao abrir, recolher no máximo a cada minuto: a página não consulta a
 * Anthropic a cada visita. */
const OPEN_COLLECT_INTERVAL_MS = 60_000

export type RefreshOutcome =
  | { status: 'refreshed'; record: ProcessSummaryRecord }
  | { status: 'queued' }
  | { status: 'skipped'; reason: 'no_summary' | 'up_to_date' | 'unavailable' }
  | { status: 'failed' }

const RECORD_COLUMNS = 'legal_process_id, summary, sources, model, generated_by, generated_at'

/**
 * A atualização automática ao abrir um processo com novidades (fase 2b) — em
 * lote desde a fase 5. Recolhe os lotes prontos: se o resumo deste processo
 * estava entre eles, devolve o novo. Senão, pede a atualização no lote (o
 * trabalho confere novidade e o intervalo de 15 minutos). O "Atualizar" da
 * tela continua na hora.
 *
 * Pela service_role: o resumo é do escritório, o mesmo para todos. Nunca
 * lança.
 */
export async function refreshProcessSummaryOnOpen(legalProcessId: string): Promise<RefreshOutcome> {
  if (!hasServiceRoleKey()) return { status: 'skipped', reason: 'unavailable' }
  const admin = createAdminClient()

  try {
    const read = async () => {
      const { data, error } = await admin
        .from('legal_process_summaries')
        .select(RECORD_COLUMNS)
        .eq('legal_process_id', legalProcessId)
        .maybeSingle()
      if (error) throw error
      return (data as ProcessSummaryRecord | null) ?? null
    }

    const before = await read()
    if (!before) return { status: 'skipped', reason: 'no_summary' }

    await collectBatches({ minIntervalMs: OPEN_COLLECT_INTERVAL_MS })
    const after = await read()
    if (after && after.generated_at !== before.generated_at) {
      return { status: 'refreshed', record: after }
    }

    const { sent, waiting } = await enqueueBatch([
      { kind: 'process_summary', entityId: legalProcessId },
    ])
    return sent > 0 || waiting > 0 ? { status: 'queued' } : { status: 'skipped', reason: 'up_to_date' }
  } catch (error) {
    console.error(`[resumo-auto] ${legalProcessId} ao abrir falhou:`, error)
    return { status: 'failed' }
  }
}
