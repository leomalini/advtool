import { NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { saveFeature } from '@/features/ia/config/panelSettings'
import { parseBody, settingsFailure } from '@/features/ia/config/routeResponses'
import { saveAiFeatureSchema } from '@/schemas/aiSettings.schema'

/** PUT /api/configuracoes/ia/funcoes — liga ou desliga uma função da IA. */
export async function PUT(request: Request) {
  const guard = await requireApiPermission('configuracoes', 'manage')
  if (!guard.ok) return guard.response

  const body = await parseBody(request, saveAiFeatureSchema)
  if (!body.ok) return body.response

  try {
    return NextResponse.json(await saveFeature({ ...body.data, userId: guard.userId }))
  } catch (error) {
    return settingsFailure(error)
  }
}
