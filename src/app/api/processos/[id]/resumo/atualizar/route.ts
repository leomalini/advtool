import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { refreshProcessSummaryOnOpen } from '@/features/processos/summary/refreshProcessSummary'

/** Segundos. Recolher os lotes prontos grava resultados de outros processos também. */
export const maxDuration = 60

const paramsSchema = z.object({ id: z.string().uuid() })

/**
 * POST /api/processos/<id>/resumo/atualizar — o caminho automático ao abrir
 * o processo (fase 2b; em lote desde a fase 5). A página chama quando vê
 * movimentações ou publicações mais novas que o resumo.
 *
 * Basta poder ver o processo: quem decide se gasta é o trabalho do lote — só
 * processo que já tem resumo, só com novidade, no máximo uma vez a cada 15
 * minutos. A resposta é o desfecho: `refreshed` traz o resumo que o lote
 * acabou de gravar; `queued`, que a atualização foi pedida.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermissionApi('processos', 'view')
  if (!guard.ok) return guard.response

  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) return NextResponse.json({ error: 'Processo inválido.' }, { status: 400 })

  return NextResponse.json(await refreshProcessSummaryOnOpen(parsed.data.id))
}
