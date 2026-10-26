import { NextResponse } from 'next/server'
import { resendLink } from '@/lib/d4sign/documents'
import { d4signErrorResponse } from '@/lib/d4sign/http'
import { guardSignatureRequest } from '@/lib/d4sign/routeGuard'
import { ensureKeySigner } from '@/lib/d4sign/signers'

export const maxDuration = 60

/**
 * POST /api/assinaturas/[id]/signatarios/[signerId]/reenviar — manda de novo o
 * link de assinatura. A D4Sign só aceita depois de 1, 5 e 30 minutos, e então
 * de hora em hora; antes disso a recusa dela volta como mensagem.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; signerId: string }> },
) {
  const { id, signerId } = await params
  const guard = await guardSignatureRequest(id)
  if (!guard.ok) return guard.response

  const { request } = guard
  const signer = request.signers.find((item) => item.id === signerId)
  if (!signer) return NextResponse.json({ error: 'Signatário não encontrado.' }, { status: 404 })
  if (request.status !== 'sent' || signer.status === 'signed') {
    return NextResponse.json({ error: 'Não há assinatura pendente para reenviar.' }, { status: 409 })
  }

  try {
    const keySigner = await ensureKeySigner(guard.supabase, request, signer)
    if (!keySigner) {
      return NextResponse.json(
        { error: 'A D4Sign não informou a chave deste signatário: reenvie pelo painel dela.' },
        { status: 502 },
      )
    }
    await resendLink(request.external_id as string, signer.email, keySigner)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return d4signErrorResponse(error, 'reenviar o link')
  }
}
