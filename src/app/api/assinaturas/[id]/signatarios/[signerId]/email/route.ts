import { NextResponse } from 'next/server'
import { z } from 'zod'
import { changeSignerEmail } from '@/lib/d4sign/documents'
import { d4signErrorResponse } from '@/lib/d4sign/http'
import { loadRequest, updateSigner } from '@/lib/d4sign/requests'
import { guardSignatureRequest } from '@/lib/d4sign/routeGuard'
import { ensureKeySigner } from '@/lib/d4sign/signers'

export const maxDuration = 60

const bodySchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email('E-mail inválido.')) })

/**
 * POST /api/assinaturas/[id]/signatarios/[signerId]/email — corrige o e-mail de
 * um signatário (o caso do "e-mail não entregue"). Troca na D4Sign, aqui e na
 * parte do contrato, quando o signatário veio dela.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; signerId: string }> },
) {
  const { id, signerId } = await params
  const guard = await guardSignatureRequest(id)
  if (!guard.ok) return guard.response

  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? 'E-mail inválido.' }, { status: 400 })
  }

  const signatureRequest = guard.request
  const signer = signatureRequest.signers.find((item) => item.id === signerId)
  if (!signer) return NextResponse.json({ error: 'Signatário não encontrado.' }, { status: 404 })
  if (signatureRequest.status !== 'sent' || signer.status === 'signed') {
    return NextResponse.json({ error: 'Só dá para trocar o e-mail de quem ainda não assinou.' }, { status: 409 })
  }
  if (body.data.email === signer.email) return NextResponse.json({ ok: true })

  try {
    const keySigner = await ensureKeySigner(guard.supabase, signatureRequest, signer)
    if (!keySigner) {
      return NextResponse.json(
        { error: 'A D4Sign não informou a chave deste signatário: troque pelo painel dela.' },
        { status: 502 },
      )
    }
    await changeSignerEmail(signatureRequest.external_id as string, signer.email, body.data.email, keySigner)
  } catch (error) {
    return d4signErrorResponse(error, 'trocar o e-mail na D4Sign')
  }

  await updateSigner(guard.supabase, signer.id, { email: body.data.email, status: 'pending' })
  if (signer.contract_party_id) {
    await guard.supabase
      .from('contract_parties')
      .update({ email: body.data.email })
      .eq('id', signer.contract_party_id)
  }

  return NextResponse.json({ request: await loadRequest(guard.supabase, id) })
}
