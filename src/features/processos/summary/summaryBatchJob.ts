import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BatchJob } from '@/features/ia/batch/types'
import { loadSummaryData } from './loadSummaryData'
import { buildSummaryInput, cleanCitations } from './summaryInput'
import { PROCESS_SUMMARY_SYSTEM_PROMPT } from './summaryPrompt'
import { processSummarySchema, type ProcessSummary, type SummarySource } from './summarySchema'

/** Intervalo mínimo entre duas atualizações automáticas do mesmo processo (2b). */
export const AUTO_REFRESH_INTERVAL_MINUTES = 15

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

interface SummaryContext {
  /** As fontes numeradas do pedido (M1, P2…): é por elas que as citações
   * voltam a apontar para as movimentações. */
  sources: SummarySource[]
}

/**
 * A atualização automática do resumo do processo, em lote (fase 5). As mesmas
 * condições da 2b: só processo que já tem resumo, com novidade e com o último
 * resumo de mais de 15 minutos. O "Atualizar" da tela continua na hora.
 */
export const processSummaryBatchJob: BatchJob<ProcessSummary> = {
  kind: 'process_summary',
  route: 'process_summary',
  instructions: PROCESS_SUMMARY_SYSTEM_PROMPT,
  toolName: 'registrar_resumo',
  toolDescription: 'Registra o resumo do processo.',
  schema: processSummarySchema,
  maxOutputTokens: 16_000,

  async prepare(admin, legalProcessId) {
    const { data: current, error } = await admin
      .from('legal_process_summaries')
      .select('generated_at')
      .eq('legal_process_id', legalProcessId)
      .maybeSingle()
    if (error) throw error
    if (!current) return null
    if ((await countNewSince(admin, legalProcessId, current.generated_at)) === 0) return null
    if (Date.now() - Date.parse(current.generated_at) < AUTO_REFRESH_INTERVAL_MINUTES * 60_000) {
      return null
    }

    const data = await loadSummaryData(admin, legalProcessId)
    if (!data) return null
    const { text, sources } = buildSummaryInput(data, new Date())
    const context: SummaryContext = { sources }
    return {
      userText: text,
      inputHash: createHash('sha256').update(text).digest('hex'),
      context,
    }
  },

  async apply(admin, legalProcessId, output, meta) {
    const sources = (meta.context as SummaryContext | null)?.sources ?? []
    const { summary, problems } = cleanCitations(output, sources)
    if (problems.length > 0) {
      console.warn('[resumo-lote] citações conferidas:', legalProcessId, problems)
    }

    // O resumo vale até quando foi pedido: o que chegou depois tem
    // `created_at` maior e dispara a próxima atualização. E não passa por cima
    // de um resumo mais novo (o "Atualizar" da tela, no meio do caminho).
    const { data, error } = await admin
      .from('legal_process_summaries')
      .update({
        summary,
        sources,
        model: meta.modelId,
        generated_by: null,
        generated_at: meta.requestedAt,
        refreshing_since: null,
      })
      .eq('legal_process_id', legalProcessId)
      .lt('generated_at', meta.requestedAt)
      .select('legal_process_id')
    if (error) throw error
    return data && data.length > 0 ? 'applied' : 'stale'
  },
}
