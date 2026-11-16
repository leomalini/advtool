import { NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { saveBudget } from '@/features/ia/config/panelSettings'
import { parseBody, settingsFailure } from '@/features/ia/config/routeResponses'
import { saveAiBudgetSchema } from '@/schemas/aiSettings.schema'

/**
 * PUT /api/configuracoes/ia/teto — teto mensal de gasto com IA, em US$.
 * `{ source: 'env' }` devolve o teto à variável de ambiente;
 * `{ source: 'panel', usd }` assume pelo painel (`usd: null` = sem teto).
 */
export async function PUT(request: Request) {
  const guard = await requireApiPermission('configuracoes', 'manage')
  if (!guard.ok) return guard.response

  const body = await parseBody(request, saveAiBudgetSchema)
  if (!body.ok) return body.response

  try {
    return NextResponse.json(await saveBudget({ budget: body.data, userId: guard.userId }))
  } catch (error) {
    return settingsFailure(error)
  }
}
