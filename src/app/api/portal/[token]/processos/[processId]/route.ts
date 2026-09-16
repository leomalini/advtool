import { NextRequest, NextResponse } from 'next/server'
import { hasServiceRoleKey } from '@/lib/supabase/admin'
import { NO_STORE, requirePortalSession } from '@/lib/clientPortal/access'
import { getPortalProcessTimeline } from '@/lib/clientPortal/data'

/**
 * GET /api/portal/<token>/processos/<id> — o andamento de um processo.
 *
 * Chamada quando o cliente abre um dos cards. Existe para que a lista não
 * precise carregar a timeline de todos: com muitos processos, isso era um
 * payload enorme para ler uma movimentação.
 *
 * ⚠️ O id do processo vem da URL, então o vínculo com o cliente do token é
 * reconferido no banco a cada chamada — ver `getPortalProcessTimeline`. Um
 * token válido dá acesso aos processos DAQUELE cliente, não a qualquer id que
 * caiba na barra de endereços. Processo de outro cliente responde 404, igual a
 * processo inexistente: a diferença entre os dois só serviria para mapear o
 * acervo do escritório.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; processId: string }> }
) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Acompanhamento indisponível no momento.' },
      { status: 503 }
    )
  }

  const { token, processId } = await params
  const guard = await requirePortalSession(request, token)
  if (!guard.ok) return guard.response

  try {
    const timeline = await getPortalProcessTimeline(guard.client.id, processId)

    if (!timeline) {
      return NextResponse.json({ error: 'Processo não encontrado.' }, { status: 404 })
    }

    return NextResponse.json(timeline, { headers: NO_STORE })
  } catch (error) {
    console.error('[portal] timeline falhou:', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar o andamento agora.' },
      { status: 500 }
    )
  }
}
