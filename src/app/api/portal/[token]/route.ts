import { NextRequest, NextResponse } from 'next/server'
import { hasServiceRoleKey } from '@/lib/supabase/admin'
import {
  NO_STORE,
  clientDisplayName,
  requirePortalSession,
  touchPortalLink,
} from '@/lib/clientPortal/access'
import { getPortalProcesses } from '@/lib/clientPortal/data'
import type { PortalPayload } from '@/types/clientPortal.types'

/**
 * GET /api/portal/<token> — a lista de processos, para quem já provou o
 * documento.
 *
 * É a única rota do produto que responde sem sessão e devolve dado do
 * escritório. Três camadas a separam de um vazamento, nesta ordem:
 *
 *   1. o token, que precisa existir, não estar revogado nem expirado;
 *   2. o cookie de sessão, que prova que ESTE navegador digitou o documento
 *      DESTE link (`POST .../verificar`);
 *   3. o payload montado campo a campo em `clientPortal/data.ts`.
 *
 * As duas primeiras moram em `requirePortalSession`. Sem o cookie, ela devolve
 * 401 com `needs_document` — que é um convite a digitar o CPF, não um erro; a
 * página usa isso para decidir qual tela mostrar.
 *
 * O ANDAMENTO não vem aqui: cada processo traz só o resumo, e a timeline chega
 * por `.../processos/<id>` quando o cliente abre um deles.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Acompanhamento indisponível no momento.' },
      { status: 503 }
    )
  }

  const { token } = await params
  const guard = await requirePortalSession(request, token)
  if (!guard.ok) return guard.response

  const { link, client } = guard

  try {
    const payload: PortalPayload = {
      client_name: clientDisplayName(client),
      processes: await getPortalProcesses(client.id),
      generated_at: new Date().toISOString(),
    }

    await touchPortalLink(link)

    return NextResponse.json(payload, { headers: NO_STORE })
  } catch (error) {
    console.error('[portal] montagem do payload falhou:', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar seus processos agora.' },
      { status: 500 }
    )
  }
}
