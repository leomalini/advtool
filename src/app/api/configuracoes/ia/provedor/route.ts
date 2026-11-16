import { NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { saveProviderAndModel } from '@/features/ia/config/panelSettings'
import { parseBody, settingsFailure } from '@/features/ia/config/routeResponses'
import { saveAiProviderSchema } from '@/schemas/aiSettings.schema'

/**
 * PUT /api/configuracoes/ia/provedor — troca o provedor ativo e o modelo dele.
 * Antes, testa a chave em uso com o modelo novo; recusado volta 200 com
 * `ok: false` e nada muda.
 */
export async function PUT(request: Request) {
  const guard = await requireApiPermission('configuracoes', 'manage')
  if (!guard.ok) return guard.response

  const body = await parseBody(request, saveAiProviderSchema)
  if (!body.ok) return body.response

  try {
    const result = await saveProviderAndModel({
      provider: body.data.provider,
      modelId: body.data.model,
      userId: guard.userId,
    })
    return NextResponse.json(result)
  } catch (error) {
    return settingsFailure(error)
  }
}
