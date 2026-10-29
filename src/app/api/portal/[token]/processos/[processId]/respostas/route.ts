import { NextRequest, NextResponse } from 'next/server'
import { hasServiceRoleKey } from '@/lib/supabase/admin'
import { NO_STORE, requirePortalSession } from '@/lib/clientPortal/access'
import { isPortalProcessOfClient } from '@/lib/clientPortal/data'
import { ensurePortalAnswers } from '@/features/portal/answers/ensurePortalAnswers'
import {
  visibleAnswers,
  type PortalAnswersResponse,
} from '@/features/portal/answers/portalAnswersSchema'

/** Segundos. Quase sempre responde do banco; quando gera, leva de 5 a 20 s. */
export const maxDuration = 60

/**
 * POST /api/portal/<token>/processos/<id>/respostas — as respostas das
 * perguntas fixas de um processo (fase 3).
 *
 * Chamada quando o cliente escolhe o processo no chat de dúvidas. POST porque
 * pode gerar — e gerar é cobrado —, mas a geração só acontece quando muda o
 * que a página mostra (`ensurePortalAnswers`): escolher de novo, recarregar ou
 * clicar nas perguntas não gasta nada.
 * Por isso não há limite por link, como havia no chat livre.
 *
 * O vínculo processo × cliente do token é reconferido a cada chamada, e
 * processo de outro cliente responde 404, como na timeline.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; processId: string }> }
) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ status: 'unavailable' } satisfies PortalAnswersResponse, {
      headers: NO_STORE,
    })
  }

  const { token, processId } = await params
  const guard = await requirePortalSession(request, token)
  if (!guard.ok) return guard.response

  try {
    if (!(await isPortalProcessOfClient(guard.client.id, processId))) {
      return NextResponse.json({ error: 'Processo não encontrado.' }, { status: 404 })
    }

    const outcome = await ensurePortalAnswers(processId, 'page', { portalLinkId: guard.link.id })
    const body: PortalAnswersResponse =
      outcome.status === 'ready'
        ? { status: 'ready', answers: visibleAnswers(outcome.record) }
        : outcome.status === 'preparing'
          ? { status: 'preparing' }
          : { status: 'unavailable' }

    return NextResponse.json(body, { headers: NO_STORE })
  } catch (error) {
    console.error('[portal] respostas falharam:', error)
    return NextResponse.json({ status: 'unavailable' } satisfies PortalAnswersResponse, {
      headers: NO_STORE,
    })
  }
}
