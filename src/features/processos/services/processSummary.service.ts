import { createClient } from '@/lib/supabase/client'
import type { RefreshOutcome } from '../summary/refreshProcessSummary'
import type { ProcessSummaryRecord } from '../summary/summarySchema'

const supabase = createClient()

/** O resumo gravado do processo, ou `null` se ainda não foi gerado. */
export async function getProcessSummary(legalProcessId: string): Promise<ProcessSummaryRecord | null> {
  const { data, error } = await supabase
    .from('legal_process_summaries')
    .select('legal_process_id, summary, sources, model, generated_by, generated_at')
    .eq('legal_process_id', legalProcessId)
    .maybeSingle()

  if (error) throw error
  return data as ProcessSummaryRecord | null
}

/**
 * Pede ao servidor um resumo novo — só o servidor tem a chave da IA. Cada
 * clique é uma chamada cobrada (R$ 0,18 a 0,44 na validação).
 */
export async function generateProcessSummaryFromApi(
  legalProcessId: string,
): Promise<ProcessSummaryRecord> {
  const res = await fetch(`/api/processos/${legalProcessId}/resumo`, { method: 'POST' })
  const json: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    const message =
      json && typeof json === 'object' && 'error' in json && typeof json.error === 'string'
        ? json.error
        : 'Não foi possível gerar o resumo.'
    throw new Error(message)
  }
  return json as ProcessSummaryRecord
}

/**
 * O caminho automático ao abrir o processo: o servidor decide se refaz
 * (só com novidade e no máximo a cada 15 minutos). Falha volta como `failed`
 * — a tela segue com o resumo que tem.
 */
export async function refreshProcessSummaryFromApi(legalProcessId: string): Promise<RefreshOutcome> {
  const res = await fetch(`/api/processos/${legalProcessId}/resumo/atualizar`, { method: 'POST' })
  if (!res.ok) return { status: 'failed' }
  return (await res.json()) as RefreshOutcome
}
