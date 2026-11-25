import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { loadOffice } from '@/lib/billing/panel'
import { setSeriesState, updateSeries, type SeriesResult } from '@/lib/billing/series'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { billingTermsSchema } from '@/schemas/billingTerms.schema'
import {
  SERIES_CLIENT_DESCRIPTION_MAX,
  SERIES_DESCRIPTION_MAX,
} from '@/types/billingSeries.types'

/**
 * PATCH /api/financeiro/mensalidades/<id> — troca valor, descrições, fim,
 * lembretes e percentuais (valem para os próximos ciclos), ou pausa, retoma e
 * encerra (`financeiro:update`).
 */

const patchSchema = z
  .object({
    action: z.enum(['pause', 'resume', 'end']).optional(),
    description: z.string().max(SERIES_DESCRIPTION_MAX).optional(),
    clientDescription: z.string().max(SERIES_CLIENT_DESCRIPTION_MAX).optional(),
    amount: z.number().min(1).max(9_999_999_999.99).optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    remindersEnabled: z.boolean().optional(),
  })
  .extend(billingTermsSchema.shape)
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Nada a mudar.',
  })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiPermission('financeiro', 'update')
  if (!guard.ok) return guard.response
  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Mensalidades indisponíveis: SUPABASE_SERVICE_ROLE_KEY não configurada.' },
      { status: 503 },
    )
  }

  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Mensalidade inválida.' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  const { action, ...changes } = parsed.data

  try {
    const admin = createAdminClient()
    let result: SeriesResult
    if (action) {
      const office = await loadOffice(admin)
      result = await setSeriesState(admin, {
        id,
        action,
        userId: guard.userId,
        offsets: office.offsets,
      })
    } else {
      result = await updateSeries(admin, { id, changes })
    }
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      )
    }
    return NextResponse.json({ series: result.series, outcomes: result.outcomes ?? [] })
  } catch (error) {
    console.error('[billing] mensalidade não foi alterada:', error)
    return NextResponse.json(
      { error: 'Não foi possível alterar a mensalidade agora. Tente de novo em instantes.' },
      { status: 500 },
    )
  }
}
