import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { hasServiceRoleKey } from '@/lib/supabase/admin'
import {
  INVALID_LINK_MESSAGE,
  clientIpFrom,
  documentMatches,
  hashIp,
  isRateLimited,
  logPortalAttempt,
  resolvePortalLink,
} from '@/lib/clientPortal/access'
import {
  PORTAL_SESSION_COOKIE,
  PORTAL_SESSION_COOKIE_OPTIONS,
  createPortalSessionCookie,
} from '@/lib/clientPortal/session'

/** Dígitos suficientes para ser CPF (11) ou CNPJ (14). A conferência real é
 * contra o cadastro; isto só recusa corpo obviamente inútil antes do banco. */
const verificarSchema = z.object({
  document: z.string().min(11).max(20),
})

/**
 * POST /api/portal/<token>/verificar — o segundo fator.
 *
 * O link circula por WhatsApp, e WhatsApp é encaminhado. Digitar o próprio
 * CPF/CNPJ é o que separa "quem recebeu o link" de "quem é o cliente".
 *
 * É a rota que um atacante usaria para adivinhar um documento, então é ela que
 * carrega o rate limit — 10 recusas por origem a cada 15 minutos, contadas no
 * banco (ver `isRateLimited`).
 *
 * Em caso de acerto devolve só `{ ok: true }` e o cookie: o dado em si sai
 * pelo GET, que revalida tudo. Duas rotas, uma porta.
 */
export async function POST(
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

  if (await isRateLimited(ipHash)) {
    await logPortalAttempt({ outcome: 'rate_limited', ipHash, userAgent })
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
      { status: 429 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = verificarSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Informe o documento completo.' }, { status: 400 })
  }

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

  if (!documentMatches(client, parsed.data.document)) {
    await logPortalAttempt({
      outcome: 'document_mismatch',
      linkId: link.id,
      clientId: client.id,
      ipHash,
      userAgent,
    })
    // Mensagem genérica: dizer "o cadastro não tem CPF" contaria ao atacante
    // que nenhum documento vai funcionar, e dizer "errado" para quem acertou o
    // formato já é o suficiente para quem é dono do próprio CPF.
    return NextResponse.json(
      { error: 'Documento não confere com o cadastro. Confira e tente de novo.' },
      { status: 401 }
    )
  }

  await logPortalAttempt({
    outcome: 'granted',
    linkId: link.id,
    clientId: client.id,
    ipHash,
    userAgent,
  })

  const response = NextResponse.json({ ok: true })
  response.cookies.set(
    PORTAL_SESSION_COOKIE,
    await createPortalSessionCookie(link.id),
    PORTAL_SESSION_COOKIE_OPTIONS
  )
  return response
}
