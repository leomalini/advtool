import { NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { listSafes } from '@/lib/d4sign/account'
import { d4signErrorResponse } from '@/lib/d4sign/http'

/** Chamada a serviço externo: o mesmo teto das outras rotas nessa situação. */
export const maxDuration = 60

/**
 * GET /api/assinaturas/d4sign/cofres — os cofres da conta: para ligar cada
 * tipo a um cofre em Configurações, e para trocar o cofre sugerido no envio
 * (um aditivo vai para "Aditivos").
 *
 * Gasta uma das 10 chamadas por hora da API, por isso só roda quando alguém
 * pede na tela: quem administra Configurações ou quem envia contratos.
 */
export async function GET() {
  let guard = await requireApiPermission('configuracoes', 'manage')
  if (!guard.ok && guard.response.status === 403) {
    guard = await requireApiPermission('contratos', 'update')
  }
  if (!guard.ok) return guard.response

  try {
    return NextResponse.json({ safes: await listSafes() })
  } catch (error) {
    return d4signErrorResponse(error, 'listar os cofres da D4Sign')
  }
}
