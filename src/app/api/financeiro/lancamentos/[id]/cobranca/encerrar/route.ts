import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { closeBilling } from '@/lib/billing/billings'
import { billingPageUrl } from '@/lib/billing/urls'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'

/**
 * POST /api/financeiro/lancamentos/<id>/cobranca/encerrar — tira a cobrança do
 * ar. A página passa a dizer que não está disponível, e o link da InfinitePay
 * em aberto deixa de ser oferecido (⚠️ quem já abriu o checkout ainda paga até
 * ele vencer). Gerar de novo religa a mesma URL.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: 'Lançamento inválido.' }, { status: 400 })
  }

  try {
    const result = await closeBilling(createAdminClient(), { entryId: id, userId: guard.userId })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      )
    }
    return NextResponse.json({
      billing: result.billing,
      url: await billingPageUrl(result.billing.id, request.nextUrl.origin),
    })
  } catch (error) {
    console.error('[billing] encerramento da cobrança falhou:', error)
    return NextResponse.json(
      { error: 'Não foi possível encerrar a cobrança agora. Tente de novo em instantes.' },
      { status: 500 },
    )
  }
}
