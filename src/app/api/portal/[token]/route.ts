import { NextRequest, NextResponse } from 'next/server'
import { hasServiceRoleKey } from '@/lib/supabase/admin'
import {
  INVALID_LINK_MESSAGE,
  clientDisplayName,
  clientIpFrom,
  documentKindFor,
  hashIp,
  logPortalAttempt,
  resolvePortalLink,
  touchPortalLink,
} from '@/lib/clientPortal/access'
import { getPortalProcesses } from '@/lib/clientPortal/data'
import {
  PORTAL_SESSION_COOKIE,
  verifyPortalSessionCookie,
} from '@/lib/clientPortal/session'
import type { PortalChallenge, PortalPayload } from '@/types/clientPortal.types'

/**
 * GET /api/portal/<token> — o andamento, para quem já provou o documento.
 *
 * É a única rota do produto que responde sem sessão e devolve dado do
 * escritório. Três camadas a separam de um vazamento, nesta ordem:
 *
 *   1. o token, que precisa existir, não estar revogado nem expirado;
 *   2. o cookie de sessão, que prova que ESTE navegador digitou o documento
 *      DESTE link (`POST .../verificar`);
 *   3. o payload montado campo a campo em `clientPortal/data.ts`.
 *
 * Sem o cookie, responde 401 com `needs_document` — que é um convite a digitar
 * o CPF, não um erro. A página usa isso para decidir qual tela mostrar.
 *
 * `no-store` porque a resposta é dado de um cliente específico: cache
 * compartilhado no caminho poderia entregá-la a outro.
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
  const ipHash = await hashIp(clientIpFrom(request.headers))
  const userAgent = request.headers.get('user-agent')

  const resolved = await resolvePortalLink(token)

  if (!resolved.ok) {
    await logPortalAttempt({
      outcome: resolved.outcome,
      linkId: resolved.linkId,
      clientId: resolved.clientId,
      ipHash,
      userAgent,
    })
    return NextResponse.json({ error: INVALID_LINK_MESSAGE }, { status: 404 })
  }

  const { link, client } = resolved

  const hasSession = await verifyPortalSessionCookie(
    request.cookies.get(PORTAL_SESSION_COOKIE)?.value,
    link.id
  )

  if (!hasSession) {
    // Não é log de tentativa: ninguém tentou nada ainda. Quem abre o link pela
    // primeira vez cai aqui, e registrar isso como recusa encheria o histórico
    // de ruído e ainda alimentaria o rate limit contra o cliente legítimo.
    const challenge: PortalChallenge = {
      needs_document: true,
      document_kind: documentKindFor(client),
    }
    return NextResponse.json(challenge, { status: 401, headers: noStore() })
  }

  try {
    const payload: PortalPayload = {
      client_name: clientDisplayName(client),
      processes: await getPortalProcesses(client.id),
      generated_at: new Date().toISOString(),
    }

    await touchPortalLink(link)

    return NextResponse.json(payload, { headers: noStore() })
  } catch (error) {
    console.error('[portal] montagem do payload falhou:', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar seus processos agora.' },
      { status: 500 }
    )
  }
}

function noStore(): HeadersInit {
  return { 'Cache-Control': 'no-store, private' }
}
