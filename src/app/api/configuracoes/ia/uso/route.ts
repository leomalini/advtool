import { NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { loadMonthUsage } from '@/features/ia/config/panelActivity'

/**
 * GET /api/configuracoes/ia/uso — o gasto do mês com IA, por função. Pela
 * rota porque `ai_usage` só abre para quem administra: quem vê Configurações
 * recebe as somas, nunca as linhas (quem perguntou o quê).
 */
export async function GET() {
  const guard = await requireApiPermission('configuracoes', 'view')
  if (!guard.ok) return guard.response

  try {
    return NextResponse.json(await loadMonthUsage())
  } catch (error) {
    console.error('[ia-config] gasto do mês:', error)
    return NextResponse.json({ error: 'Não foi possível ler o gasto do mês.' }, { status: 503 })
  }
}
