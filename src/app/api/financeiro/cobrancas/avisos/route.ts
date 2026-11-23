import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { recordReminder } from '@/lib/billing/reminders'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'

/**
 * POST /api/financeiro/cobrancas/avisos — registra o que o escritório fez com
 * o aviso de uma etapa: abriu no WhatsApp (`manual`) ou pulou (`skipped`).
 * Registrar de novo a mesma etapa devolve o primeiro registro.
 */

const bodySchema = z.object({
  billingId: z.uuid(),
  step: z.string().regex(/^(created|resend|d0|d[+-]\d{1,3})$/),
  dueDate: z.iso.date(),
  status: z.enum(['manual', 'skipped']),
})

export async function POST(request: NextRequest) {
  const guard = await requireApiPermission('financeiro', 'update')
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Cobrança indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada.' },
      { status: 503 },
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })

  try {
    const result = await recordReminder(createAdminClient(), {
      ...parsed.data,
      userId: guard.userId,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
    }
    return NextResponse.json({ message: result.message, duplicate: result.duplicate })
  } catch (error) {
    console.error('[billing] aviso não registrado:', error)
    return NextResponse.json(
      { error: 'Não foi possível registrar o aviso agora. Tente de novo em instantes.' },
      { status: 500 },
    )
  }
}
