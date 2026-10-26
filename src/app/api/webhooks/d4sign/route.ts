import { NextRequest, NextResponse, after } from 'next/server'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { d4signWebhookSecret, getD4SignConfig } from '@/lib/d4sign/config'
import { processD4SignDelivery } from '@/lib/d4sign/deliveries'
import {
  d4signDiagnosticHeaders,
  d4signSignatureHeader,
  parseD4SignBody,
  toD4SignDelivery,
  verifyD4SignHmac,
} from '@/lib/d4sign/webhook'
import { WEBHOOK_PROVIDERS, type WebhookEventStatus } from '@/types/webhookEvent.types'

/**
 * POST /api/webhooks/d4sign — os avisos dos documentos que o app enviou (o
 * endereço é registrado em cada documento, no envio): finalizado, cancelado,
 * assinado por alguém ou com e-mail não entregue.
 *
 * A rota autentica, procura o envio, grava a entrega em `webhook_events` e
 * responde; o que o evento muda (a cópia assinada, o contrato vigente, o
 * cancelamento) corre depois, em `after()` — `lib/d4sign/deliveries.ts`.
 * Finalizar e cancelar só depois de confirmar na API: a assinatura cobre só o
 * UUID, não o corpo.
 *
 * Respostas:
 *   · 401 quando a assinatura não confere — a D4Sign vê a falha, e a entrega
 *     fica gravada com a assinatura recebida para ser conferida de novo depois;
 *   · 503 quando a entrega não pôde ser gravada ou o envio não pôde ser
 *     procurado — a D4Sign tenta de novo por até ~27 h;
 *   · 200 para o resto, inclusive documento sem envio aqui: reenviar não muda
 *     nada.
 *
 * Entregas que chegam com o ambiente em sandbox ficam marcadas `is_test`.
 */
/** O `after()` baixa o PDF assinado e o guarda no Storage. */
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const contentType = request.headers.get('content-type')
  const rawBody = await request.text()

  if (!hasServiceRoleKey()) {
    console.error('[d4sign/webhook] SUPABASE_SERVICE_ROLE_KEY ausente — entrega não gravada.')
    return NextResponse.json({ received: false }, { status: 503 })
  }

  const supabase = createAdminClient()
  const fields = await parseD4SignBody(rawBody, contentType)
  const delivery = fields ? toD4SignDelivery(fields) : null
  const secret = d4signWebhookSecret()
  const signatureValid =
    delivery && secret
      ? await verifyD4SignHmac(delivery.uuid, d4signSignatureHeader(request.headers), secret)
      : null

  let status: WebhookEventStatus = 'received'
  let reason: string | null = null
  let lookupError: string | null = null
  let requestId: string | null = null

  if (!delivery) {
    status = 'invalid'
    reason = 'Corpo fora do formato do webhook da D4Sign (sem uuid ou type_post).'
  } else if (!secret) {
    status = 'invalid'
    reason = 'D4SIGN_WEBHOOK_SECRET não configurada: sem como conferir o HMAC.'
  } else if (!signatureValid) {
    status = 'invalid'
    reason = 'Assinatura (x-signature) ausente ou diferente do HMAC deste documento.'
  } else {
    const { data: signatureRequest, error } = await supabase
      .from('signature_requests')
      .select('id')
      .eq('external_id', delivery.uuid)
      .maybeSingle()

    if (error) {
      status = 'error'
      reason = 'Não foi possível procurar o envio — a D4Sign vai reenviar.'
      lookupError = error.message
    } else if (!signatureRequest) {
      status = 'unmatched'
      reason = 'Nenhum envio do app com este documento.'
    } else {
      requestId = signatureRequest.id as string
    }
  }

  const { data: logged, error: logError } = await supabase.from('webhook_events').insert({
    provider: WEBHOOK_PROVIDERS.d4sign,
    event: delivery?.event ?? delivery?.typePost ?? null,
    external_id: delivery?.uuid ?? null,
    signature_valid: signatureValid,
    is_test: getD4SignConfig()?.environment === 'sandbox',
    status,
    reason,
    error: lookupError,
    payload: fields ?? { unparsed_body: rawBody.slice(0, 4000) },
    headers: d4signDiagnosticHeaders(request.headers),
    duration_ms: Date.now() - startedAt,
  })
    .select('id')
    .single()

  if (logError || !logged) {
    console.error('[d4sign/webhook] entrega não gravada:', logError?.message)
    return NextResponse.json({ received: false }, { status: 503 })
  }

  if (status === 'error') return NextResponse.json({ received: false }, { status: 503 })
  if (status === 'invalid' && delivery && secret) {
    return NextResponse.json({ received: false }, { status: 401 })
  }

  if (status === 'received' && requestId && delivery && fields) {
    const input = { eventId: logged.id as string, requestId, delivery, fields, startedAt }
    after(async () => {
      await processD4SignDelivery(supabase, input)
    })
  }
  return NextResponse.json({ received: true })
}
