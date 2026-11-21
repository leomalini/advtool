import { NextRequest, NextResponse } from 'next/server'
import { Resend, type WebhookEventPayload } from 'resend'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { resendWebhookSecret } from '@/lib/email/config'
import { applyResendEvent, type ResendEventOutcome } from '@/lib/email/webhook'
import { WEBHOOK_PROVIDERS, type WebhookEventStatus } from '@/types/webhookEvent.types'

/**
 * POST /api/webhooks/resend — os avisos de entrega dos e-mails que o app
 * mandou: entregue, atrasado, recusado, spam, falha, bloqueado.
 *
 * A assinatura é a do padrão Svix (`svix-id`, `svix-timestamp`,
 * `svix-signature`), conferida pelo próprio SDK com `RESEND_WEBHOOK_SECRET`,
 * que também recusa aviso velho (proteção contra reenvio de captura).
 *
 * Diferente da D4Sign, o processamento roda antes da resposta: são duas ou
 * três escritas no banco, sem chamada externa, e respondendo depois dele o
 * Resend reenvia o que falhou.
 *
 * Respostas:
 *   · 401 quando a assinatura não confere (com segredo configurado);
 *   · 503 quando o banco falhou — a entrega ou a atualização; o Resend reenvia;
 *   · 200 para o resto, inclusive aviso de e-mail desconhecido: reenviar não
 *     muda nada.
 */

/** O SDK espera os três cabeçalhos com estes nomes. Aceita também a grafia
 * `webhook-*` do padrão Standard Webhooks, que o Svix envia junto. */
function signatureHeaders(headers: Headers) {
  const pick = (name: string) => headers.get(`svix-${name}`) ?? headers.get(`webhook-${name}`)
  const id = pick('id')
  const timestamp = pick('timestamp')
  const signature = pick('signature')
  return id && timestamp && signature ? { id, timestamp, signature } : null
}

/** Só o que ajuda a diagnosticar — nunca a assinatura. */
function diagnosticHeaders(headers: Headers): Record<string, string | null> {
  return {
    content_type: headers.get('content-type'),
    user_agent: headers.get('user-agent'),
    svix_id: headers.get('svix-id') ?? headers.get('webhook-id'),
    svix_timestamp: headers.get('svix-timestamp') ?? headers.get('webhook-timestamp'),
    header_names: [...headers.keys()].sort().join(', '),
  }
}

function safeJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody)
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const rawBody = await request.text()

  if (!hasServiceRoleKey()) {
    console.error('[resend/webhook] SUPABASE_SERVICE_ROLE_KEY ausente — aviso não gravado.')
    return NextResponse.json({ received: false }, { status: 503 })
  }

  const supabase = createAdminClient()
  const secret = resendWebhookSecret()
  const apiKey = process.env.RESEND_API_KEY?.trim() || null
  const headers = signatureHeaders(request.headers)

  let event: WebhookEventPayload | null = null
  let signatureValid: boolean | null = null
  let status: WebhookEventStatus = 'received'
  let reason: string | null = null

  if (!secret) {
    status = 'invalid'
    reason = 'RESEND_WEBHOOK_SECRET não configurada: sem como conferir a assinatura.'
  } else if (!apiKey) {
    // O SDK só se instancia com a chave; sem ela o app também não mandou nada
    // que um aviso pudesse atualizar.
    status = 'invalid'
    reason = 'RESEND_API_KEY não configurada.'
  } else if (!headers) {
    status = 'invalid'
    signatureValid = false
    reason = 'Cabeçalhos de assinatura (svix-id, svix-timestamp, svix-signature) ausentes.'
  } else {
    try {
      event = new Resend(apiKey).webhooks.verify({ payload: rawBody, headers, webhookSecret: secret })
      signatureValid = true
    } catch {
      status = 'invalid'
      signatureValid = false
      reason = 'Assinatura diferente da esperada, ou aviso antigo demais.'
    }
  }

  let outcome: ResendEventOutcome | null = null
  if (event) {
    outcome = await applyResendEvent(supabase, event)
    status = outcome.status
    reason = outcome.reason
  }

  const payload = event ?? safeJson(rawBody)
  const { error: logError } = await supabase.from('webhook_events').insert({
    provider: WEBHOOK_PROVIDERS.resend,
    event: event?.type ?? null,
    external_id: headers?.id ?? null,
    signature_valid: signatureValid,
    is_test: outcome?.isTest ?? false,
    status,
    reason,
    error: outcome?.error ?? null,
    destinations: outcome?.destinations ?? [],
    payload: payload ?? { unparsed_body: rawBody.slice(0, 4000) },
    headers: diagnosticHeaders(request.headers),
    duration_ms: Date.now() - startedAt,
  })

  if (logError) {
    console.error('[resend/webhook] aviso não gravado:', logError.message)
    return NextResponse.json({ received: false }, { status: 503 })
  }

  if (status === 'error') return NextResponse.json({ received: false }, { status: 503 })
  if (status === 'invalid' && signatureValid === false) {
    return NextResponse.json({ received: false }, { status: 401 })
  }
  return NextResponse.json({ received: true })
}
