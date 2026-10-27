import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { AI_ERROR_MESSAGES } from '@/features/ia/errorMessages'
import { createAssistantModel } from '@/features/ia/model'
import { providerErrorKind } from '@/features/ia/providerErrors'
import { checkAiBudget } from '@/features/ia/usage/budget'
import { generateProcessSummary } from '@/features/processos/summary/generateProcessSummary'
import { loadSummaryData } from '@/features/processos/summary/loadSummaryData'
import type { ProcessSummaryRecord } from '@/features/processos/summary/summarySchema'

/** Segundos. Um resumo leva de 10 a 25 s; processo grande, mais. */
export const maxDuration = 120

const paramsSchema = z.object({ id: z.string().uuid() })

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

/**
 * POST /api/processos/<id>/resumo — gera (ou refaz) o resumo do processo pelo
 * Claude e o grava em `legal_process_summaries` (migration 82).
 *
 * Permissão de editar o processo, porque grava; conferida ANTES do modelo,
 * como o teto do mês. Dados lidos e resumo gravado com o client de quem pede:
 * a RLS decide o que entra no contexto e quem pode salvar.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermissionApi('processos', 'update')
  if (!guard.ok) return guard.response

  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) return jsonError('Processo inválido.', 400)
  const { id } = parsed.data

  const assistantModel = createAssistantModel('process_summary', { userId: guard.userId })
  if (!assistantModel.ok) {
    console.error('[resumo] IA indisponível:', assistantModel.reason)
    return jsonError('A IA não está configurada neste ambiente.', 503)
  }
  const budget = await checkAiBudget()
  if (!budget.ok) {
    return jsonError(
      budget.reason === 'exceeded' ? AI_ERROR_MESSAGES.budget : AI_ERROR_MESSAGES.unavailable,
      503,
    )
  }

  const supabase = await createClient()

  let data: Awaited<ReturnType<typeof loadSummaryData>>
  try {
    data = await loadSummaryData(supabase, id)
  } catch (loadError) {
    console.error('[resumo] leitura do processo falhou:', loadError)
    return jsonError('Não foi possível ler os dados do processo.', 500)
  }
  if (!data) return jsonError('Processo não encontrado.', 404)

  let generated: Awaited<ReturnType<typeof generateProcessSummary>>
  try {
    generated = await generateProcessSummary({
      model: assistantModel.model,
      providerOptions: assistantModel.providerOptions,
      data,
      now: new Date(),
    })
  } catch (modelError) {
    console.error(`[resumo] geração (${assistantModel.provider}) falhou:`, modelError)
    switch (providerErrorKind(modelError)) {
      case 'rate_limit':
        return jsonError(AI_ERROR_MESSAGES.rateLimit, 429)
      case 'credits':
        return jsonError(AI_ERROR_MESSAGES.credits, 402)
      case 'auth':
        return jsonError(AI_ERROR_MESSAGES.auth, 503)
      case 'overloaded':
        return jsonError(AI_ERROR_MESSAGES.overloaded, 503)
      default:
        return jsonError('A IA não conseguiu resumir o processo agora. Tente de novo.', 502)
    }
  }
  if (generated.problems.length > 0) {
    // O resumo vai assim mesmo, sem as referências inexistentes; o log mostra
    // o que conferir se a tela parecer estranha.
    console.warn('[resumo] citações conferidas:', id, generated.problems)
  }

  const { data: saved, error: saveError } = await supabase
    .from('legal_process_summaries')
    .upsert(
      {
        legal_process_id: id,
        summary: generated.summary,
        sources: generated.sources,
        model: generated.modelId,
        generated_by: guard.userId,
        generated_at: new Date().toISOString(),
        // Uma atualização automática em andamento perde a vez: este já é o novo.
        refreshing_since: null,
      },
      { onConflict: 'legal_process_id' },
    )
    .select()
    .single()
  if (saveError) {
    console.error('[resumo] gravação falhou:', saveError.code, saveError.message)
    return jsonError('O resumo foi gerado, mas não pôde ser salvo. Tente de novo.', 500)
  }

  return NextResponse.json(saved as ProcessSummaryRecord)
}
