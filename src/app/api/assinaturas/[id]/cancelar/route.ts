import { NextResponse } from 'next/server'
import { z } from 'zod'
import { cancelDocument } from '@/lib/d4sign/documents'
import { d4signErrorResponse } from '@/lib/d4sign/http'
import { loadRequest } from '@/lib/d4sign/requests'
import { guardSignatureRequest } from '@/lib/d4sign/routeGuard'
import { UNFINISHED_SIGNATURE_STATUSES } from '@/types/signature.types'

export const maxDuration = 60

const bodySchema = z.object({ reason: z.string().trim().max(500).nullable().optional() })

/**
 * POST /api/assinaturas/[id]/cancelar — cancela o envio.
 *
 * Se o documento chegou à D4Sign, cancela lá primeiro: um envio "cancelado"
 * aqui e vivo lá continuaria pedindo assinatura. Depois grava envio e
 * contrato juntos (`cancel_signature_request`, migration 80), com quem
 * cancelou no histórico.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await guardSignatureRequest(id)
  if (!guard.ok) return guard.response

  const body = bodySchema.safeParse(await request.json().catch(() => ({})))
  const reason = body.success ? (body.data.reason ?? null) : null
  const signatureRequest = guard.request

  if (!UNFINISHED_SIGNATURE_STATUSES.includes(signatureRequest.status)) {
    return NextResponse.json({ error: 'Este envio já terminou.' }, { status: 409 })
  }

  if (signatureRequest.external_id) {
    try {
      await cancelDocument(signatureRequest.external_id, reason)
    } catch (error) {
      return d4signErrorResponse(error, 'cancelar o documento na D4Sign')
    }
  }

  const { error } = await guard.supabase.rpc('cancel_signature_request', {
    p_request_id: id,
    p_reason: reason,
    p_source: null,
    p_actor: guard.userId,
  })
  if (error) {
    console.error('[d4sign] cancelamento não gravado:', id, error.message)
    return NextResponse.json(
      { error: 'Cancelado na D4Sign, mas não gravado aqui. "Atualizar status" corrige.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ request: await loadRequest(guard.supabase, id) })
}
