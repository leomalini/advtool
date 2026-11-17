import { NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { removeProviderKey, saveProviderKey } from '@/features/ia/config/panelSettings'
import { parseBody, settingsFailure } from '@/features/ia/config/routeResponses'
import { aiProviderOnlySchema, saveAiKeySchema } from '@/schemas/aiSettings.schema'

/**
 * PUT /api/configuracoes/ia/chave — grava a chave de um provedor, cifrada, só
 * se ela passar no teste. Teste recusado volta 200 com `ok: false` e a frase.
 */
export async function PUT(request: Request) {
  const guard = await requireApiPermission('configuracoes', 'manage')
  if (!guard.ok) return guard.response

  const body = await parseBody(request, saveAiKeySchema)
  if (!body.ok) return body.response

  try {
    return NextResponse.json(await saveProviderKey({ ...body.data, userId: guard.userId }))
  } catch (error) {
    return settingsFailure(error)
  }
}

/** DELETE /api/configuracoes/ia/chave — apaga a chave do painel de um provedor. */
export async function DELETE(request: Request) {
  const guard = await requireApiPermission('configuracoes', 'manage')
  if (!guard.ok) return guard.response

  const body = await parseBody(request, aiProviderOnlySchema)
  if (!body.ok) return body.response

  try {
    return NextResponse.json(await removeProviderKey(body.data.provider, guard.userId))
  } catch (error) {
    return settingsFailure(error)
  }
}
