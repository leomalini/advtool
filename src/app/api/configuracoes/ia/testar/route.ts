import { NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { testCurrentKey } from '@/features/ia/config/panelSettings'
import { parseBody, settingsFailure } from '@/features/ia/config/routeResponses'
import { aiProviderOnlySchema } from '@/schemas/aiSettings.schema'

/**
 * POST /api/configuracoes/ia/testar — testa a chave em uso de um provedor
 * (painel ou ambiente) com o modelo escolhido, sem gastar tokens. Falha do
 * provedor volta 200 com `ok: false`: é resultado do teste, não erro da rota.
 */
export async function POST(request: Request) {
  const guard = await requireApiPermission('configuracoes', 'manage')
  if (!guard.ok) return guard.response

  const body = await parseBody(request, aiProviderOnlySchema)
  if (!body.ok) return body.response

  try {
    return NextResponse.json(await testCurrentKey(body.data.provider, guard.userId))
  } catch (error) {
    return settingsFailure(error)
  }
}
