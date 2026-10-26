import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadRequest } from '@/lib/d4sign/requests'
import { guardSignatureRequest, markContractAwaitingSignature } from '@/lib/d4sign/routeGuard'
import { runSignatureRequest } from '@/lib/d4sign/send'

export const maxDuration = 120

/**
 * POST /api/assinaturas/[id]/tentar — continua um envio que falhou, do passo
 * em que parou (o arquivo não sobe de novo).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const guard = await guardSignatureRequest(id)
  if (!guard.ok) return guard.response

  if (guard.request.status !== 'failed') {
    return NextResponse.json({ error: 'Só um envio que falhou pode ser retomado.' }, { status: 409 })
  }

  const run = await runSignatureRequest(guard.supabase, id)
  if (run.ok) await markContractAwaitingSignature(await createClient(), guard.request.contract_id)

  const saved = await loadRequest(guard.supabase, id)
  return NextResponse.json(
    run.ok ? { request: saved } : { request: saved, error: run.error },
    { status: run.ok ? 200 : 502 },
  )
}
