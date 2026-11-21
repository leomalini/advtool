import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { sendPaymentLinkEmail } from '@/lib/email/billing'

/**
 * POST /api/financeiro/cobrancas/<id>/email — manda o link de pagamento em
 * aberto para o e-mail do cliente do lançamento.
 *
 * `financeiro:create`, a mesma permissão de gerar o link: mandá-lo para fora
 * é parte de cobrar. Enviar por aqui liga, para esta cobrança, o lembrete e a
 * confirmação por e-mail (`lib/email/billing.ts`).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireApiPermission('financeiro', 'create')
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Envio indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada.' },
      { status: 503 },
    )
  }

  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Cobrança inválida.' }, { status: 400 })
  }

  try {
    const result = await sendPaymentLinkEmail(createAdminClient(), {
      chargeId: id,
      sentBy: guard.userId,
    })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, message: result.message },
        { status: result.status },
      )
    }
    return NextResponse.json({ message: result.message }, { status: 201 })
  } catch (error) {
    console.error('[cobranca/email] falhou:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Não foi possível enviar o link por e-mail agora.' },
      { status: 500 },
    )
  }
}
