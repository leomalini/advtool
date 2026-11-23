import { NextResponse } from 'next/server'
import { hasOfficeSession } from '@/lib/auth/hasOfficeSession'
import { getPublicBillingView } from '@/lib/billing/checkout'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'

/**
 * POST /api/pagar/<token> — o que a página da cobrança mostra.
 *
 * Pública: a autorização é o token (256 bits, derivado do id da cobrança). A
 * service_role lê porque não há sessão, e devolve só o que a página mostra —
 * nada do cliente nem do processo, porque a URL pode ser encaminhada.
 *
 * POST, e não GET, de propósito: quem chama é a página já renderizada, e é isso
 * que conta como "o cliente abriu". A pré-visualização do WhatsApp só faz GET
 * na página e não executa o script.
 */

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Página indisponível no momento.' },
      { status: 503, headers: NO_STORE },
    )
  }

  const { token } = await params
  try {
    const view = await getPublicBillingView(createAdminClient(), {
      token,
      recordView: !(await hasOfficeSession()),
    })
    return NextResponse.json(view, {
      status: view.status === 'not_found' ? 404 : 200,
      headers: NO_STORE,
    })
  } catch (error) {
    console.error('[billing] página da cobrança falhou:', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar a cobrança agora.' },
      { status: 500, headers: NO_STORE },
    )
  }
}
