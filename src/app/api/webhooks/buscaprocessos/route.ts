import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { verifyWebhookAuth } from '@/lib/buscaprocessos/signature'
import { handleBpWebhook } from '@/lib/buscaprocessos/webhook'
import { recordWebhookEvent, diagnosticHeaders } from '@/lib/buscaprocessos/webhookLog'
import type { BpWebhookPayload } from '@/lib/buscaprocessos/types'

/**
 * Recebimento dos webhooks da BuscaProcessos.
 *
 * A rota faz três coisas e mais nenhuma: confere a assinatura, delega para
 * `handleBpWebhook` e registra o que aconteceu em `webhook_events`. A decisão
 * sobre o conteúdo mora em `src/lib/buscaprocessos/webhook.ts`, porque a tela
 * de Configurações precisa executar exatamente o mesmo caminho para simular
 * uma entrega.
 *
 * `service_role`, e não o client de sessão: um webhook não tem sessão. Com o
 * client de sessão a requisição chegava ao PostgREST como `anon`, a RLS barrava
 * tudo, e o webhook nunca gravou nada. Aqui a autorização é o HMAC verificado
 * acima, não um perfil.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now()
  const rawBody = await req.text()
  const headers = diagnosticHeaders(req.headers)

  const auth = await verifyWebhookAuth(rawBody, {
    signature: req.headers.get('x-buscaprocessos-signature'),
    authorization: req.headers.get('authorization'),
  })
  const signatureValid = auth.configured ? auth.valid : null

  // Sem a chave não há como registrar nem gravar: o log também é `service_role`.
  if (!hasServiceRoleKey()) {
    console.error('[webhook] SUPABASE_SERVICE_ROLE_KEY ausente — entrega descartada.')
    return NextResponse.json({ received: true, processed: false }, { status: 503 })
  }

  const supabase = createAdminClient()

  if (!auth.valid) {
    // O corpo e a assinatura recebida são registrados JUSTAMENTE aqui, e não
    // no caminho feliz: sem eles, um 401 é indistinguível de outro — segredo
    // errado, chave interpretada de outro jeito, corpo reserializado no meio
    // do caminho. A assinatura é um MAC daquele corpo específico: não serve
    // para forjar outra entrega, e é o que torna a recusa diagnosticável.
    await recordWebhookEvent(supabase, {
      status: 'invalid',
      signatureValid,
      reason: 'Autenticação recusada.',
      error: auth.detail,
      payload: safeJson(rawBody),
      headers: { ...headers, signature_received: auth.receivedSignature },
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
  }

  let payload: BpWebhookPayload
  try {
    payload = JSON.parse(rawBody) as BpWebhookPayload
  } catch {
    await recordWebhookEvent(supabase, {
      status: 'invalid',
      signatureValid,
      reason: 'Corpo não é JSON válido.',
      headers,
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  try {
    const result = await handleBpWebhook(supabase, payload, {
      eventOverride: req.headers.get('x-buscaprocessos-event'),
    })

    await recordWebhookEvent(supabase, {
      event: result.event,
      externalId: payload.id ?? null,
      signatureValid,
      status: result.status,
      destinations: result.destinations,
      reason: result.reason,
      payload,
      // `auth_method` diz COMO a entrega se autenticou. Serve para descobrir
      // qual das interpretações da chave a origem usa de fato.
      headers: { ...headers, auth_method: auth.method },
      durationMs: Date.now() - startedAt,
    })

    return NextResponse.json({
      received: true,
      processed: result.status === 'processed',
      status: result.status,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha inesperada'
    console.error('[webhook] falha ao processar entrega:', err)

    await recordWebhookEvent(supabase, {
      event: payload.event ?? null,
      externalId: payload.id ?? null,
      signatureValid,
      status: 'error',
      error: message,
      payload,
      headers,
      durationMs: Date.now() - startedAt,
    })

    // 200 de propósito: a BuscaProcessos reentrega em erro, e reentregar o que
    // falha por defeito nosso só multiplica o problema. O registro acima é o
    // que torna a falha visível.
    return NextResponse.json({ received: true, processed: false })
  }
}

/** Corpo recusado guardado como JSON quando dá, como texto quando não dá. */
function safeJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody)
  } catch {
    return { unparsed_body: rawBody.slice(0, 4000) }
  }
}
