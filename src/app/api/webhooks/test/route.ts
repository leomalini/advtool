import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/auth/requireAdminApi'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { handleBpWebhook } from '@/lib/buscaprocessos/webhook'
import { recordWebhookEvent } from '@/lib/buscaprocessos/webhookLog'
import { hasWebhookSecret, hasWebhookToken, signWebhookBody } from '@/lib/buscaprocessos/signature'
import { webhookUrl, localWebhookUrl } from '@/lib/buscaprocessos/webhookUrl'
import { readLastOriginDelivery } from '@/lib/buscaprocessos/webhookAlerts'
import { countPendingRejections } from '@/lib/buscaprocessos/webhookReplay'
import {
  buildWebhookPayload,
  WEBHOOK_SCENARIO_VALUES,
  type WebhookScenario,
} from '@/lib/buscaprocessos/webhookFixtures'
import type { BpWebhookPayload } from '@/lib/buscaprocessos/types'

/**
 * Disparador de webhooks de teste.
 *
 * Existe porque "chegou?", "a assinatura conferiu?" e "para onde foi o dado?"
 * eram perguntas sem resposta: o endpoint responde 200 para quase tudo, de
 * propósito, e não guardava rastro nenhum.
 *
 * Dois modos:
 *
 *  · `inline` — chama `handleBpWebhook` no próprio processo. É o único que
 *    aceita `dryRun`, e o único que funciona em localhost, onde a aplicação
 *    não tem endereço público para receber a própria requisição.
 *  · `http` — assina o corpo e faz POST no endpoint real, exercitando a
 *    conferência de assinatura de ponta a ponta. Grava de verdade, porque quem
 *    grava é o endpoint.
 *
 * Só admin: a rota escreve na base com `service_role` e forja o corpo de uma
 * integração externa.
 */

const testSchema = z
  .object({
    scenario: z.enum(WEBHOOK_SCENARIO_VALUES as unknown as [string, ...string[]]).optional(),
    /** Corpo editado à mão na tela. Tem precedência sobre o cenário. */
    payload: z.record(z.string(), z.unknown()).optional(),
    cnj: z.string().trim().min(1).optional(),
    conteudo: z.string().trim().min(1).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato yyyy-MM-dd')
      .optional(),
    dryRun: z.boolean().default(true),
    mode: z.enum(['inline', 'http']).default('inline'),
  })
  .refine((value) => value.scenario || value.payload, {
    message: 'Informe um cenário ou um corpo.',
  })

/** Situação do endpoint, para a tela dizer o que está e o que não está pronto. */
export async function GET(): Promise<NextResponse> {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response

  // A saúde lê o log com `service_role`: sem a chave, a tela mostra só a
  // configuração, que é o que dá para afirmar.
  const health = hasServiceRoleKey() ? await readHealth() : null

  return NextResponse.json({
    health,
    /** O que registramos na BuscaProcessos ao ativar o monitoramento por OAB. */
    registeredUrl: webhookUrl(),
    /** Para onde o modo `http` dispara — aceita localhost, ao contrário da acima. */
    localUrl: localWebhookUrl(),
    secretConfigured: hasWebhookSecret(),
    tokenConfigured: hasWebhookToken(),
    serviceRoleConfigured: hasServiceRoleKey(),
    canSendHttp: Boolean(localWebhookUrl()),
  })
}

/**
 * A situação real do recebimento, e não só a configurada: a variável pode estar
 * presente e errada — foi o que aconteceu —, e só a última entrega diz isso.
 */
async function readHealth() {
  const supabase = createAdminClient()

  try {
    const [lastDelivery, pending] = await Promise.all([
      readLastOriginDelivery(supabase),
      countPendingRejections(supabase),
    ])
    return { lastDelivery, pendingReplay: pending }
  } catch (err) {
    console.error('[webhooks/test] saúde do endpoint:', err)
    return null
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const parsed = testSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', issues: parsed.error.issues },
      { status: 422 },
    )
  }

  const { scenario, payload: rawPayload, cnj, conteudo, date, dryRun, mode } = parsed.data

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY não configurada — o webhook não consegue gravar.' },
      { status: 503 },
    )
  }

  const payload = (rawPayload ??
    buildWebhookPayload(scenario as WebhookScenario, {
      cnj,
      conteudo,
      date,
    })) as BpWebhookPayload

  if (mode === 'http') return sendOverHttp(payload, dryRun)

  const supabase = createAdminClient()
  const startedAt = Date.now()

  try {
    const result = await handleBpWebhook(supabase, payload, { dryRun })
    const durationMs = Date.now() - startedAt

    const eventId = await recordWebhookEvent(supabase, {
      event: result.event,
      externalId: payload.id ?? payload.uuid ?? null,
      // Chamada direta: não passou pela conferência de assinatura.
      signatureValid: null,
      isTest: true,
      dryRun,
      status: result.status,
      destinations: result.destinations,
      reason: result.reason,
      payload,
      headers: { origin: 'configuracoes/webhooks', mode },
      durationMs,
    })

    return NextResponse.json({ ...result, dryRun, mode, eventId, durationMs, payload })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha inesperada'
    console.error('[webhooks/test]', err)

    const eventId = await recordWebhookEvent(supabase, {
      event: payload.event ?? null,
      externalId: payload.id ?? payload.uuid ?? null,
      signatureValid: null,
      isTest: true,
      dryRun,
      status: 'error',
      error: message,
      payload,
      headers: { origin: 'configuracoes/webhooks', mode },
      durationMs: Date.now() - startedAt,
    })

    return NextResponse.json(
      { error: message, status: 'error', destinations: [], eventId, dryRun, mode },
      { status: 500 },
    )
  }
}

/**
 * Dispara contra o endpoint real, assinado. O registro em `webhook_events` é
 * feito lá — aqui só se devolve o que a rota respondeu.
 */
async function sendOverHttp(
  payload: BpWebhookPayload,
  dryRun: boolean,
): Promise<NextResponse> {
  if (dryRun) {
    return NextResponse.json(
      {
        error:
          'Simulação não existe no modo HTTP: quem grava é o endpoint real. Use o modo direto para simular.',
      },
      { status: 422 },
    )
  }

  const url = localWebhookUrl()
  if (!url) {
    return NextResponse.json(
      { error: 'APP_PUBLIC_URL não configurada — não há endereço para onde disparar.' },
      { status: 409 },
    )
  }

  const rawBody = JSON.stringify(payload)
  const signature = await signWebhookBody(rawBody)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-buscaprocessos-event': payload.event ?? '',
  }
  if (signature) headers['x-buscaprocessos-signature'] = signature

  try {
    const response = await fetch(url, { method: 'POST', headers, body: rawBody })
    const text = await response.text()

    let parsedBody: unknown = text
    try {
      parsedBody = JSON.parse(text)
    } catch {
      // Resposta não-JSON: devolve o texto cru, que é o que ajuda a diagnosticar.
    }

    return NextResponse.json({
      mode: 'http',
      dryRun: false,
      url,
      signed: Boolean(signature),
      httpStatus: response.status,
      response: parsedBody,
      payload,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha inesperada'
    return NextResponse.json(
      { error: `Não foi possível alcançar ${url}: ${message}`, mode: 'http' },
      { status: 502 },
    )
  }
}

/** Limpa o histórico de testes, deixando as entregas reais intactas. */
export async function DELETE(): Promise<NextResponse> {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada.' }, { status: 503 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('webhook_events')
    .delete()
    .eq('is_test', true)
    .select('id')

  if (error) {
    console.error('[webhooks/test] DELETE:', error.message)
    return NextResponse.json({ error: 'Não foi possível limpar os eventos.' }, { status: 500 })
  }

  return NextResponse.json({ removed: data?.length ?? 0 })
}
