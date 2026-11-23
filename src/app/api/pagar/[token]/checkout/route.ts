import { NextRequest, NextResponse } from 'next/server'
import { hasOfficeSession } from '@/lib/auth/hasOfficeSession'
import { startBillingCheckout } from '@/lib/billing/checkout'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'

/**
 * POST /api/pagar/<token>/checkout — o clique em "Pagar". Devolve o checkout
 * da InfinitePay com o valor de hoje (`{ status: 'redirect', url }`), ou o
 * estado que impediu: pago, encerrada, não encontrada.
 *
 * Pública, como a página: o token autoriza. O link nasce aqui, e não quando o
 * escritório põe a cobrança no ar — é o que permite o valor mudar (fase 3) e o
 * link vencer sem a mensagem enviada deixar de valer.
 */

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Pagamento indisponível no momento.' },
      { status: 503, headers: NO_STORE },
    )
  }

  const { token } = await params
  try {
    const outcome = await startBillingCheckout(createAdminClient(), {
      token,
      requestOrigin: request.nextUrl.origin,
      recordClick: !(await hasOfficeSession()),
    })

    if (outcome.status === 'error') {
      return NextResponse.json(
        { error: outcome.message },
        { status: outcome.httpStatus, headers: NO_STORE },
      )
    }
    return NextResponse.json(outcome, {
      status: outcome.status === 'not_found' ? 404 : 200,
      headers: NO_STORE,
    })
  } catch (error) {
    console.error('[billing] clique em Pagar falhou:', error)
    return NextResponse.json(
      { error: 'Não foi possível abrir o pagamento agora. Tente de novo em instantes.' },
      { status: 500, headers: NO_STORE },
    )
  }
}
