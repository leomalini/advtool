import { NextResponse } from 'next/server'
import { syncRequest } from '@/lib/d4sign/finish'
import { d4signErrorResponse } from '@/lib/d4sign/http'
import { loadRequest } from '@/lib/d4sign/requests'
import { guardSignatureRequest } from '@/lib/d4sign/routeGuard'

/** Pode baixar o PDF assinado e guardá-lo. */
export const maxDuration = 60

/**
 * POST /api/assinaturas/[id]/atualizar — pergunta à D4Sign em que pé está o
 * envio: finaliza ou cancela se for o caso, e marca quem já assinou. É o
 * caminho quando o aviso não chega (sem endereço público, entrega perdida).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await guardSignatureRequest(id)
  if (!guard.ok) return guard.response

  try {
    const outcome = await syncRequest(guard.supabase, guard.request)
    return NextResponse.json({
      outcome: { status: outcome.status, reason: outcome.reason },
      request: await loadRequest(guard.supabase, id),
    })
  } catch (error) {
    return d4signErrorResponse(error, 'consultar o documento na D4Sign')
  }
}
