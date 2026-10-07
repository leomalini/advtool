import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { cancelCharge } from '@/lib/infinitepay/charges'

/**
 * POST /api/financeiro/cobrancas/<id>/cancelar — deixa de oferecer um link.
 *
 * ⚠️ A InfinitePay não cancela link: quem já o tem ainda consegue pagar. O que
 * muda é o lado de cá — a cobrança sai de `open`, libera um link novo e destrava
 * o valor e a baixa manual do lançamento.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireApiPermission('financeiro', 'update')
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Cobrança indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada.' },
      { status: 503 },
    )
  }

  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Cobrança inválida.' }, { status: 400 })
  }

  try {
    const result = await cancelCharge(createAdminClient(), { chargeId: id, userId: guard.userId })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      )
    }
    return NextResponse.json({ charge: result.charge })
  } catch (error) {
    console.error('[infinitepay] cancelamento do link falhou:', error)
    return NextResponse.json(
      { error: 'Não foi possível cancelar o link agora. Tente de novo em instantes.' },
      { status: 500 },
    )
  }
}
