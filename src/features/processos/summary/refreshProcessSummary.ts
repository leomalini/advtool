import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { createAssistantModel } from '@/features/ia/model'
import { checkAiBudget } from '@/features/ia/usage/budget'
import { generateProcessSummary } from './generateProcessSummary'
import { loadSummaryData } from './loadSummaryData'
import type { ProcessSummaryRecord } from './summarySchema'

/** Intervalo mínimo entre duas atualizações automáticas do mesmo processo. */
export const AUTO_REFRESH_INTERVAL_MINUTES = 15

/** Reserva mais velha que isso foi abandonada (a função morreu no meio). */
const CLAIM_TIMEOUT_MINUTES = 5

export type RefreshTrigger = 'webhook' | 'sync' | 'page'

export type RefreshOutcome =
  | { status: 'refreshed'; record: ProcessSummaryRecord }
  | {
      status: 'skipped'
      reason: 'no_summary' | 'up_to_date' | 'too_soon' | 'busy' | 'budget' | 'unavailable'
    }
  | { status: 'failed' }

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

/** Quantas movimentações e publicações do processo foram gravadas depois de `since`. */
async function countNewSince(
  admin: SupabaseClient,
  legalProcessId: string,
  since: string,
): Promise<number> {
  const [movements, publications] = await Promise.all([
    admin
      .from('legal_process_movements')
      .select('id', { count: 'exact', head: true })
      .eq('legal_process_id', legalProcessId)
      .gt('created_at', since),
    admin
      .from('publications')
      .select('id', { count: 'exact', head: true })
      .eq('legal_process_id', legalProcessId)
      .gt('created_at', since),
  ])
  if (movements.error) throw movements.error
  if (publications.error) throw publications.error
  return (movements.count ?? 0) + (publications.count ?? 0)
}

async function releaseClaim(admin: SupabaseClient, legalProcessId: string) {
  const { error } = await admin
    .from('legal_process_summaries')
    .update({ refreshing_since: null })
    .eq('legal_process_id', legalProcessId)
  if (error) console.error('[resumo-auto] liberar a reserva falhou:', error.code, error.message)
}

/**
 * Refaz o resumo do processo SE ele já existe, ficou para trás e o último tem
 * mais de 15 minutos (fase 2b; migration 83). É o caminho automático: chamado
 * em segundo plano pelo webhook e pelo sync, e pela página quando alguém abre
 * um processo com novidades. A geração manual ("Atualizar") não passa por aqui.
 *
 * Pela service_role: o webhook não tem sessão, e o resumo é do escritório — o
 * mesmo para todos os que podem ver o processo. Nunca lança: o desfecho volta
 * em `RefreshOutcome`, e o motivo de uma falha fica no log `[resumo-auto]`.
 */
export async function refreshProcessSummary(
  legalProcessId: string,
  trigger: RefreshTrigger,
): Promise<RefreshOutcome> {
  if (!hasServiceRoleKey()) {
    console.error('[resumo-auto] SUPABASE_SERVICE_ROLE_KEY ausente.')
    return { status: 'skipped', reason: 'unavailable' }
  }
  const admin = createAdminClient()

  try {
    const { data: current, error } = await admin
      .from('legal_process_summaries')
      .select('generated_at')
      .eq('legal_process_id', legalProcessId)
      .maybeSingle()
    if (error) throw error
    // Só processo que alguém já resumiu entra no automático.
    if (!current) return { status: 'skipped', reason: 'no_summary' }

    if ((await countNewSince(admin, legalProcessId, current.generated_at)) === 0) {
      return { status: 'skipped', reason: 'up_to_date' }
    }
    const age = Date.now() - new Date(current.generated_at).getTime()
    if (age < AUTO_REFRESH_INTERVAL_MINUTES * 60_000) {
      return { status: 'skipped', reason: 'too_soon' }
    }

    // A reserva: só um dos chamadores simultâneos passa. `generated_at` igual
    // ao lido garante também que ninguém refez o resumo entre a leitura e aqui.
    const { data: claimed, error: claimError } = await admin
      .from('legal_process_summaries')
      .update({ refreshing_since: new Date().toISOString() })
      .eq('legal_process_id', legalProcessId)
      .eq('generated_at', current.generated_at)
      .or(`refreshing_since.is.null,refreshing_since.lt."${minutesAgo(CLAIM_TIMEOUT_MINUTES)}"`)
      .select('legal_process_id')
    if (claimError) throw claimError
    if (!claimed || claimed.length === 0) return { status: 'skipped', reason: 'busy' }

    const budget = await checkAiBudget()
    if (!budget.ok) {
      await releaseClaim(admin, legalProcessId)
      return { status: 'skipped', reason: budget.reason === 'exceeded' ? 'budget' : 'unavailable' }
    }
    const model = createAssistantModel('process_summary')
    if (!model.ok) {
      console.error('[resumo-auto] IA indisponível:', model.reason)
      await releaseClaim(admin, legalProcessId)
      return { status: 'skipped', reason: 'unavailable' }
    }

    const data = await loadSummaryData(admin, legalProcessId)
    if (!data) {
      await releaseClaim(admin, legalProcessId)
      return { status: 'skipped', reason: 'no_summary' }
    }

    const generated = await generateProcessSummary({
      model: model.model,
      providerOptions: model.providerOptions,
      data,
      now: new Date(),
    })
    if (generated.problems.length > 0) {
      console.warn('[resumo-auto] citações conferidas:', legalProcessId, generated.problems)
    }

    const { data: saved, error: saveError } = await admin
      .from('legal_process_summaries')
      .update({
        summary: generated.summary,
        sources: generated.sources,
        model: generated.modelId,
        generated_by: null,
        generated_at: new Date().toISOString(),
        refreshing_since: null,
      })
      .eq('legal_process_id', legalProcessId)
      .select('legal_process_id, summary, sources, model, generated_by, generated_at')
      .single()
    if (saveError) throw saveError

    console.info(`[resumo-auto] ${legalProcessId} atualizado (${trigger}).`)
    return { status: 'refreshed', record: saved as ProcessSummaryRecord }
  } catch (error) {
    console.error(`[resumo-auto] ${legalProcessId} (${trigger}) falhou:`, error)
    await releaseClaim(admin, legalProcessId)
    return { status: 'failed' }
  }
}

/**
 * Depois de uma entrega do webhook: os processos das movimentações e
 * publicações recém-gravadas, cada um pelo caminho automático, um por vez.
 */
export async function refreshSummariesForRows(rows: {
  movementIds: string[]
  publicationIds: string[]
}): Promise<void> {
  if (rows.movementIds.length === 0 && rows.publicationIds.length === 0) return
  if (!hasServiceRoleKey()) return
  const admin = createAdminClient()

  const [movements, publications] = await Promise.all([
    rows.movementIds.length
      ? admin.from('legal_process_movements').select('legal_process_id').in('id', rows.movementIds)
      : Promise.resolve({ data: [] as { legal_process_id: string | null }[], error: null }),
    rows.publicationIds.length
      ? admin.from('publications').select('legal_process_id').in('id', rows.publicationIds)
      : Promise.resolve({ data: [] as { legal_process_id: string | null }[], error: null }),
  ])
  if (movements.error || publications.error) {
    console.error('[resumo-auto] processos da entrega:', movements.error ?? publications.error)
    return
  }

  const processIds = new Set(
    [...(movements.data ?? []), ...(publications.data ?? [])]
      .map((row) => row.legal_process_id)
      .filter((id): id is string => Boolean(id)),
  )
  for (const id of processIds) await refreshProcessSummary(id, 'webhook')
}
