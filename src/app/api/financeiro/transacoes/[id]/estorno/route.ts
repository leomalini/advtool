import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { refundTransaction } from '@/lib/infinitepay/charges'

/**
 * POST /api/financeiro/transacoes/<id>/estorno — registra um estorno feito no
 * app da InfinitePay. A API não estorna; isto só anota o que já aconteceu lá e
 * devolve o lançamento a pendente quando era este pagamento que o quitava.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireApiPermission('financeiro', 'update')
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Estorno indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada.' },
      { status: 503 },
    )
  }

  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Pagamento inválido.' }, { status: 400 })
  }

  try {
    const result = await refundTransaction(createAdminClient(), {
      transactionId: id,
      userId: guard.userId,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ entryReopened: result.entryReopened })
  } catch (error) {
    console.error('[infinitepay] registro de estorno falhou:', error)
    return NextResponse.json(
      { error: 'Não foi possível registrar o estorno agora. Tente de novo em instantes.' },
      { status: 500 },
    )
  }
}
