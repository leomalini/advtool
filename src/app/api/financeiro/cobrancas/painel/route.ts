import { NextRequest, NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { loadBillingPanel } from '@/lib/billing/panel'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'

/**
 * GET /api/financeiro/cobrancas/painel — a aba Cobranças: todas as cobranças,
 * com a URL de cada uma e a régua de hoje (o aviso devido, o próximo, a
 * situação). A mesma conta que o cron diário faz (`lib/billing/schedule.ts`).
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
    const panel = await loadBillingPanel(createAdminClient(), {
      requestOrigin: request.nextUrl.origin,
    })
    return NextResponse.json(panel)
  } catch (error) {
    console.error('[billing] painel de cobranças falhou:', error)
    return NextResponse.json({ error: 'Não foi possível carregar as cobranças.' }, { status: 500 })
  }
}
