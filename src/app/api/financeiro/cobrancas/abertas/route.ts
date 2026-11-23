import { NextRequest, NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { listOpenBillings } from '@/lib/billing/billings'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'

/**
 * GET /api/financeiro/cobrancas/abertas — as cobranças no ar de receitas
 * pendentes, com a URL de cada uma: o card do dashboard. A URL só sai do
 * servidor, que deriva o token de um segredo (`lib/billing/token.ts`).
 *
 * `abertas` é segmento fixo: convive com `cobrancas/<id>`, o id de um link da
 * InfinitePay (`payment_charges`), sem confusão.
 */
export async function GET(request: NextRequest) {
  const guard = await requireApiPermission('financeiro', 'view')
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Cobrança indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada.' },
      { status: 503 },
    )
  }

  try {
    const billings = await listOpenBillings(createAdminClient(), request.nextUrl.origin)
    return NextResponse.json({ billings })
  } catch (error) {
    console.error('[billing] lista de cobranças abertas falhou:', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar as cobranças.' },
      { status: 500 },
    )
  }
}
