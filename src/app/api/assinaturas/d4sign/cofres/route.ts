import { NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { listSafes } from '@/lib/d4sign/account'
import { d4signErrorResponse } from '@/lib/d4sign/http'

/** Chamada a serviço externo: o mesmo teto das outras rotas nessa situação. */
export const maxDuration = 60

/**
 * GET /api/assinaturas/d4sign/cofres — os cofres da conta, para escolher onde
 * os envios caem.
 *
 * Gasta uma das 10 chamadas por hora da API, por isso só roda quando alguém
 * pede na tela, e só para quem administra Configurações.
 */
export async function GET() {
  const guard = await requireApiPermission('configuracoes', 'manage')
  if (!guard.ok) return guard.response

  try {
    return NextResponse.json({ safes: await listSafes() })
  } catch (error) {
    return d4signErrorResponse(error, 'listar os cofres da D4Sign')
  }
}
