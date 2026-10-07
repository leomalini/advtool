import { NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { reprocessInfinitePayDeliveries } from '@/lib/infinitepay/deliveries'

/**
 * POST /api/financeiro/infinitepay/reprocessar — tenta de novo as entregas do
 * webhook que pararam em erro (InfinitePay ou banco fora do ar) ou que ficaram
 * sem resultado. Mora em Configurações → Pagamentos, então segue
 * `configuracoes:manage`.
 */
export async function POST() {
  const guard = await requireApiPermission('configuracoes', 'manage')
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Reprocessamento indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada.' },
      { status: 503 },
    )
  }

  try {
    return NextResponse.json(await reprocessInfinitePayDeliveries(createAdminClient()))
  } catch (error) {
    console.error('[infinitepay] reprocessamento falhou:', error)
    return NextResponse.json(
      { error: 'Não foi possível reprocessar agora. Tente de novo em instantes.' },
      { status: 500 },
    )
  }
}
