import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { BpWebhookPayload } from '@/lib/buscaprocessos/types'

const WEBHOOK_SECRET = process.env.BUSCA_PROCESSOS_WEBHOOK_SECRET

/** Timing-safe HMAC-SHA256 signature validation */
async function validateSignature(body: string, signature: string | null): Promise<boolean> {
  // If no secret is configured, skip validation (useful during development)
  if (!WEBHOOK_SECRET) return true
  if (!signature) return false

  const hexSig = signature.startsWith('sha256=') ? signature.slice(7) : signature

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Timing-safe comparison
  if (expected.length !== hexSig.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ hexSig.charCodeAt(i)
  }
  return diff === 0
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text()
  const signature = req.headers.get('x-buscaprocessos-signature')

  const valid = await validateSignature(rawBody, signature)
  if (!valid) {
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
  }

  let payload: BpWebhookPayload
  try {
    payload = JSON.parse(rawBody) as BpWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const event = req.headers.get('x-buscaprocessos-event') ?? payload.event

  // Only persist movement events into case_movements
  if (event !== 'nova_movimentacao' && event !== 'movimentacao_nova') {
    return NextResponse.json({ received: true, processed: false })
  }

  try {
    const supabase = await createClient()
    const data = payload.data

    // BuscaProcessos sends the CNJ number in various field positions
    const cnj = (data['numeroCnj'] ?? data['numero']) as string | undefined
    if (!cnj) return NextResponse.json({ received: true, processed: false })

    const { data: matchingCase } = await supabase
      .from('cases')
      .select('id')
      .eq('cnj_number', cnj)
      .maybeSingle()

    if (!matchingCase) {
      return NextResponse.json({ received: true, processed: false, reason: 'case_not_found' })
    }

    const movimentoData = (data['movimento'] ?? data) as Record<string, unknown>
    const movDate = (movimentoData['data'] ?? payload.created_at) as string
    const movDesc = String(
      movimentoData['titulo'] ?? movimentoData['descricao'] ?? 'Nova movimentação',
    )

    await supabase.from('case_movements').insert({
      case_id: matchingCase.id,
      movement_date: movDate,
      description: movDesc,
      source: 'busca_processos',
      raw_data: data,
    })

    return NextResponse.json({ received: true, processed: true })
  } catch {
    // Return 200 to prevent BuscaProcessos from retrying on permanent failures
    return NextResponse.json({ received: true, processed: false })
  }
}
