import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { enableRemindersBatch } from '@/lib/billing/reminders'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'

/**
 * POST /api/financeiro/cobrancas/lote — põe no ar a cobrança de vários
 * lançamentos e liga os lembretes de todos: o lote da aba Cobranças e da
 * prévia do contrato. Cada um responde por si; um recusado não para os outros.
 */

const MAX_ENTRIES = 100

const bodySchema = z.object({
  entryIds: z.array(z.uuid()).min(1).max(MAX_ENTRIES),
})

export async function POST(request: NextRequest) {
  const guard = await requireApiPermission('financeiro', 'create')
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Cobrança indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada.' },
      { status: 503 },
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Escolha de 1 a ${MAX_ENTRIES} lançamentos.` },
      { status: 400 },
    )
  }

  try {
    const results = await enableRemindersBatch(createAdminClient(), {
      entryIds: [...new Set(parsed.data.entryIds)],
      userId: guard.userId,
    })
    return NextResponse.json({ results })
  } catch (error) {
    console.error('[billing] lote de lembretes falhou:', error)
    return NextResponse.json(
      { error: 'Não foi possível ligar os lembretes agora. Tente de novo em instantes.' },
      { status: 500 },
    )
  }
}
