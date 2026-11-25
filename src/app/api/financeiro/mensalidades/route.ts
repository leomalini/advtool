import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { loadOffice } from '@/lib/billing/panel'
import { createSeries, listSeries } from '@/lib/billing/series'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { billingTermsSchema } from '@/schemas/billingTerms.schema'
import {
  BILLING_SERIES_CATEGORIES,
  SERIES_CLIENT_DESCRIPTION_MAX,
  SERIES_DESCRIPTION_MAX,
} from '@/types/billingSeries.types'

/**
 * As mensalidades (fase 4 de docs/cobrancas.md, migration 98).
 *
 *   GET   a lista, com o próximo vencimento (`financeiro:view`).
 *   POST  cria e já gera o ciclo que estiver na antecedência
 *         (`financeiro:create`).
 *
 * A permissão é conferida com a sessão; a gravação vai pela service_role,
 * porque `billing_series` não tem policy de escrita.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const createSchema = z
  .object({
    clientId: z.uuid(),
    legalProcessId: z.uuid().nullable().optional(),
    contractId: z.uuid().nullable().optional(),
    description: z.string().max(SERIES_DESCRIPTION_MAX),
    clientDescription: z.string().max(SERIES_CLIENT_DESCRIPTION_MAX),
    category: z.enum(BILLING_SERIES_CATEGORIES),
    amount: z.number().min(1).max(9_999_999_999.99),
    startDate: isoDate,
    endDate: isoDate.nullable().optional(),
    remindersEnabled: z.boolean(),
  })
  .extend(billingTermsSchema.shape)

function unavailable() {
  return NextResponse.json(
    { error: 'Mensalidades indisponíveis: SUPABASE_SERVICE_ROLE_KEY não configurada.' },
    { status: 503 },
  )
}

export async function GET() {
  const guard = await requireApiPermission('financeiro', 'view')
  if (!guard.ok) return guard.response
  if (!hasServiceRoleKey()) return unavailable()

  try {
    return NextResponse.json({ items: await listSeries(createAdminClient()) })
  } catch (error) {
    console.error('[billing] lista de mensalidades falhou:', error)
    return NextResponse.json(
      { error: 'Não foi possível carregar as mensalidades.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const guard = await requireApiPermission('financeiro', 'create')
  if (!guard.ok) return guard.response
  if (!hasServiceRoleKey()) return unavailable()

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  const body = parsed.data

  try {
    const admin = createAdminClient()
    const office = await loadOffice(admin)
    const result = await createSeries(admin, {
      userId: guard.userId,
      offsets: office.offsets,
      data: {
        clientId: body.clientId,
        legalProcessId: body.legalProcessId ?? null,
        contractId: body.contractId ?? null,
        description: body.description,
        clientDescription: body.clientDescription,
        category: body.category,
        amount: body.amount,
        startDate: body.startDate,
        endDate: body.endDate ?? null,
        remindersEnabled: body.remindersEnabled,
        lateFeePercent: body.lateFeePercent ?? null,
        monthlyInterestPercent: body.monthlyInterestPercent ?? null,
        pixDiscountPercent: body.pixDiscountPercent ?? null,
      },
    })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      )
    }
    return NextResponse.json({ series: result.series, outcomes: result.outcomes ?? [] })
  } catch (error) {
    console.error('[billing] mensalidade não foi criada:', error)
    return NextResponse.json(
      { error: 'Não foi possível criar a mensalidade agora. Tente de novo em instantes.' },
      { status: 500 },
    )
  }
}
