import { NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { loadAiSettingsSummary } from '@/features/ia/config/panelSettings'
import { settingsFailure } from '@/features/ia/config/routeResponses'

/**
 * GET /api/configuracoes/ia — o que a aba "Assistente IA" mostra: provedor,
 * modelos e a situação de cada chave. Nunca uma chave inteira — só o final.
 *
 * Pela rota, e não pelo banco direto, porque parte vem do ambiente do servidor
 * e as chaves do painel só a service_role lê.
 */
export async function GET() {
  const guard = await requireApiPermission('configuracoes', 'view')
  if (!guard.ok) return guard.response

  try {
    return NextResponse.json(await loadAiSettingsSummary())
  } catch (error) {
    return settingsFailure(error)
  }
}
