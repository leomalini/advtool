import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import {
  INFINITEPAY_PAYMENT_EVENT,
  infinitePayDiagnosticHeaders,
  processInfinitePayDelivery,
} from '@/lib/infinitepay/deliveries'
import { infinitePayWebhookSchema } from '@/lib/infinitepay/schemas'
import { matchesWebhookToken } from '@/lib/infinitepay/token'
import { WEBHOOK_PROVIDERS, type WebhookEventStatus } from '@/types/webhookEvent.types'

/** Entregas aceitas por cobrança por minuto. Quem tem o link consegue forjar
 * entregas — o token vai legível dentro dele —, e cada uma custaria uma
 * consulta à InfinitePay. */
const THROTTLE_WINDOW_MS = 60_000
const THROTTLE_MAX = 10

/**
 * POST /api/webhooks/infinitepay?t=<token> — o aviso de pagamento aprovado.
 *
 * A documentação pede resposta em menos de 1 s, e 400 faz a InfinitePay
 * reenviar. Por isso a rota só confere o mínimo, grava a entrega e responde;
 * a confirmação no `payment_check` e a baixa correm depois, em `after()`.
 *
 *   · 400 só quando a entrega não pôde ser gravada — o único caso em que o
 *     reenvio ajuda;
 *   · 200 para todo o resto, inclusive o que é recusado: reenviar lixo não o
 *     torna válido. O motivo fica em `webhook_events`.
 *
 * O webhook não é assinado. O token da URL filtra POST às cegas, mas não é
 * segredo de quem tem o link; a prova é o `payment_check` (ver `confirm.ts`).
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const rawBody = await request.text()

  if (!hasServiceRoleKey()) {
    console.error('[infinitepay/webhook] SUPABASE_SERVICE_ROLE_KEY ausente — entrega não gravada.')
    return NextResponse.json({ received: false }, { status: 400 })
  }

  const supabase = createAdminClient()
  const payload = safeJson(rawBody)
  const parsed = infinitePayWebhookSchema.safeParse(payload)
  const token = request.nextUrl.searchParams.get('t') ?? ''

  let chargeFound = false
  let tokenValid: boolean | null = null

  if (parsed.success && z.uuid().safeParse(parsed.data.order_nsu).success) {
    const { data: charge, error } = await supabase
      .from('payment_charges')
      .select('id, webhook_token_hash')
      .eq('id', parsed.data.order_nsu)
      .maybeSingle()

    if (error) {
      console.error('[infinitepay/webhook] cobrança não lida:', error.message)
      return NextResponse.json({ received: false }, { status: 400 })
    }
    if (charge) {
      chargeFound = true
      tokenValid = await matchesWebhookToken(token, charge.webhook_token_hash as string)
    }
  }

  let status: WebhookEventStatus = 'received'
  let reason: string | null = null
  if (!parsed.success) {
    status = 'invalid'
    reason = 'Corpo fora do formato do webhook de pagamento.'
  } else if (!chargeFound) {
    status = 'unmatched'
    reason = 'Nenhuma cobrança com esse order_nsu.'
  } else if (!tokenValid) {
    status = 'invalid'
    reason = 'O token da URL não é o desta cobrança.'
  } else if (await isThrottled(supabase, parsed.data.order_nsu)) {
    status = 'ignored'
    reason = 'Entregas demais para esta cobrança no último minuto.'
  }

  const { data: logged, error: logError } = await supabase
    .from('webhook_events')
    .insert({
      provider: WEBHOOK_PROVIDERS.infinitePay,
      event: INFINITEPAY_PAYMENT_EVENT,
      external_id: parsed.success ? parsed.data.transaction_nsu : null,
      signature_valid: tokenValid,
      status,
      reason,
      payload: payload ?? { unparsed_body: rawBody.slice(0, 4000) },
      headers: infinitePayDiagnosticHeaders(request.headers),
      duration_ms: Date.now() - startedAt,
    })
    .select('id')
    .single()

  if (logError || !logged) {
    console.error('[infinitepay/webhook] entrega não gravada:', logError?.message)
    return NextResponse.json({ received: false }, { status: 400 })
  }

  if (status === 'received' && parsed.success) {
    const delivery = parsed.data
    const eventId = logged.id as string
    after(async () => {
      await processInfinitePayDelivery(supabase, eventId, delivery, startedAt)
    })
  }

  return NextResponse.json({ received: true })
}

async function isThrottled(
  supabase: ReturnType<typeof createAdminClient>,
  orderNsu: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from('webhook_events')
    .select('id', { count: 'exact', head: true })
    .eq('provider', WEBHOOK_PROVIDERS.infinitePay)
    .eq('payload->>order_nsu', orderNsu)
    .gte('received_at', new Date(Date.now() - THROTTLE_WINDOW_MS).toISOString())

  // Sem conseguir contar, segue: perder um pagamento real é pior que uma
  // consulta a mais à InfinitePay.
  if (error) {
    console.error('[infinitepay/webhook] contagem de entregas falhou:', error.message)
    return false
  }
  return (count ?? 0) >= THROTTLE_MAX
}

/** Corpo guardado como JSON quando dá; quando não dá, a rota guarda o texto. */
function safeJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody)
  } catch {
    return null
  }
}
