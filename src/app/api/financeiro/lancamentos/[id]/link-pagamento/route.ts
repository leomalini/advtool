import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { publicAppBaseUrl } from '@/lib/appUrl'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { issueCharge } from '@/lib/infinitepay/charges'

/**
 * POST /api/financeiro/lancamentos/<id>/link-pagamento — gera o link de
 * pagamento da InfinitePay para uma receita pendente.
 *
 * `financeiro:create` conferido com a sessão; a gravação vai pela service_role,
 * porque `payment_charges` não tem policy de escrita (migration 67). As regras
 * — receita, pendente, conta configurada, um link vivo por vez — moram em
 * `issueCharge`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireApiPermission('financeiro', 'create')
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Cobrança indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada.' },
      { status: 503 },
    )
  }

  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Lançamento inválido.' }, { status: 400 })
  }

  try {
    const result = await issueCharge(createAdminClient(), {
      entryId: id,
      userId: guard.userId,
      // O retorno do cliente é aberto no navegador dele: em desenvolvimento,
      // a origem local serve (ver `infinitePayWebhookUrl` para o webhook).
      returnBaseUrl: publicAppBaseUrl() ?? request.nextUrl.origin,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code, actionUrl: result.actionUrl },
        { status: result.status },
      )
    }
    return NextResponse.json({ charge: result.charge })
  } catch (error) {
    console.error('[infinitepay] geração do link falhou:', error)
    return NextResponse.json(
      { error: 'Não foi possível gerar o link agora. Tente de novo em instantes.' },
      { status: 500 },
    )
  }
}
