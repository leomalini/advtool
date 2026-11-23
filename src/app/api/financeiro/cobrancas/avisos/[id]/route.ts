import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { undoReminder } from '@/lib/billing/reminders'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'

/**
 * DELETE /api/financeiro/cobrancas/avisos/<id> — desfaz um registro da fila
 * (o clique errado no WhatsApp ou no "Pular"). Só o da própria pessoa, de até
 * 12 horas: o histórico dos outros não se apaga daqui.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: 'Registro inválido.' }, { status: 400 })
  }

  try {
    const result = await undoReminder(createAdminClient(), { messageId: id, userId: guard.userId })
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[billing] registro não desfeito:', error)
    return NextResponse.json(
      { error: 'Não foi possível desfazer agora. Tente de novo em instantes.' },
      { status: 500 },
    )
  }
}
