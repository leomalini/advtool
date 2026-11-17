import { NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { loadSettingsLog } from '@/features/ia/config/panelActivity'

/** GET /api/configuracoes/ia/historico — as últimas alterações do painel de IA. */
export async function GET() {
  const guard = await requireApiPermission('configuracoes', 'view')
  if (!guard.ok) return guard.response

  try {
    return NextResponse.json(await loadSettingsLog())
  } catch (error) {
    console.error('[ia-config] histórico:', error)
    return NextResponse.json({ error: 'Não foi possível ler o histórico.' }, { status: 503 })
  }
}
