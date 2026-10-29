import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { refreshProcessSummary } from '@/features/processos/summary/refreshProcessSummary'

/** Segundos. Quando refaz, o resumo leva de 10 a 25 s. */
export const maxDuration = 120

const paramsSchema = z.object({ id: z.string().uuid() })

/**
 * POST /api/processos/<id>/resumo/atualizar — o caminho automático ao abrir
 * o processo (fase 2b). A página chama quando vê movimentações ou publicações
 * mais novas que o resumo.
 *
 * Basta poder ver o processo: quem decide se gasta é `refreshProcessSummary`
 * — só processo que já tem resumo, só com novidade, no máximo uma vez a cada
 * 15 minutos, um chamador por vez. A resposta é o desfecho; com `refreshed`,
 * traz o resumo novo.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermissionApi('processos', 'view')
  if (!guard.ok) return guard.response

  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) return NextResponse.json({ error: 'Processo inválido.' }, { status: 400 })

  return NextResponse.json(await refreshProcessSummary(parsed.data.id, 'page'))
}
