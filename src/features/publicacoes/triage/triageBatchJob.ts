import type { BatchJob } from '@/features/ia/batch/types'
import { buildTriageInput, loadTriageData, triageHash } from './triageInput'
import { TRIAGE_SYSTEM_PROMPT } from './triagePrompt'
import { triageResultSchema, type TriageResult } from './triageSchema'

interface TriageContext {
  /** Os candidatos mostrados ao modelo: o processo provável tem de ser um deles. */
  candidateIds: string[]
}

/**
 * A triagem de uma publicação (fase 5), em lote. Uma por publicação: a que já
 * foi triada não volta para o lote.
 */
export const triageBatchJob: BatchJob<TriageResult> = {
  kind: 'triage',
  route: 'triage',
  instructions: TRIAGE_SYSTEM_PROMPT,
  toolName: 'registrar_triagem',
  toolDescription: 'Registra a triagem da publicação.',
  schema: triageResultSchema,
  maxOutputTokens: 8_000,

  async prepare(admin, publicationId) {
    const { data: existing, error } = await admin
      .from('publication_triage')
      .select('publication_id')
      .eq('publication_id', publicationId)
      .maybeSingle()
    if (error) throw error
    if (existing) return null

    const data = await loadTriageData(admin, publicationId)
    if (!data) return null
    const context: TriageContext = { candidateIds: data.candidates.map((candidate) => candidate.id) }
    return { userText: buildTriageInput(data), inputHash: triageHash(data), context }
  },

  async apply(admin, publicationId, output, meta) {
    const { data: publication, error } = await admin
      .from('publications')
      .select('legal_process_id')
      .eq('id', publicationId)
      .maybeSingle()
    if (error) throw error
    if (!publication) return 'stale'

    const candidateIds = (meta.context as TriageContext | null)?.candidateIds ?? []
    // Processo provável só para publicação ainda sem processo, e só um dos
    // candidatos mostrados — nunca um id que o modelo tenha escrito.
    const probable =
      !publication.legal_process_id &&
      output.processo_provavel_id &&
      candidateIds.includes(output.processo_provavel_id)
        ? output.processo_provavel_id
        : null
    const rounded = output.prazo_dias === null ? null : Math.round(output.prazo_dias)
    const days = rounded !== null && rounded >= 1 && rounded <= 365 ? rounded : null

    const { error: saveError } = await admin.from('publication_triage').upsert(
      {
        publication_id: publicationId,
        act_type: output.tipo_do_ato.trim().slice(0, 120),
        urgency: output.urgencia,
        needs_action: output.pede_providencia,
        summary: output.resumo.trim(),
        suggested_task: output.pede_providencia ? output.tarefa_sugerida?.trim() || null : null,
        deadline_days: days,
        deadline_counting: days ? (output.prazo_contagem ?? 'uteis') : null,
        probable_process_id: probable,
        probable_reason: probable ? output.processo_provavel_motivo : null,
        model: meta.modelId,
        triaged_at: new Date().toISOString(),
      },
      { onConflict: 'publication_id' },
    )
    if (saveError) throw saveError
    return 'applied'
  },
}
