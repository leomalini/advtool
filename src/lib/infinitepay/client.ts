// Server-side only — nunca importar em componente 'use client'. A API não tem
// chave, mas o `webhook_url` de cada link carrega um token que só o servidor
// pode gerar, e o navegador do escritório não é quem deve falar com ela.
import {
  createLinkResponseSchema,
  infinitePayErrorBodySchema,
  paymentCheckResponseSchema,
  type CreateLinkRequest,
  type PaymentCheckRequest,
  type PaymentCheckResponse,
} from './schemas'

const BASE_URL = 'https://api.checkout.infinitepay.io'

/** A documentação não fala em tempo de resposta; no spike as duas rotas
 * responderam em menos de 0,5 s. 15 s cobre uma lentidão real sem segurar a
 * rota até o limite da função na Vercel. */
const TIMEOUT_MS = 15_000

export class InfinitePayApiError extends Error {
  constructor(
    /** HTTP da resposta; 502/504 quando a falha foi de rede ou de leitura. */
    readonly status: number,
    message: string,
    /** O `error` do corpo, quando a API manda — ex.:
     * `external_checkout_not_enabled`. */
    readonly code: string | null = null,
    /** Onde resolver, quando a API aponta — ex.: a tela do app que ativa o
     * checkout externo. */
    readonly actionUrl: string | null = null,
  ) {
    super(message)
    this.name = 'InfinitePayApiError'
  }
}

/** Transforma o corpo de erro da API num `InfinitePayApiError` com código e
 * link de ação, quando vierem. */
function errorFromBody(status: number, path: string, raw: string): InfinitePayApiError {
  let body: unknown = null
  try {
    body = JSON.parse(raw)
  } catch {
    // Corpo não-JSON: a mensagem leva o texto cru.
  }

  const parsed = infinitePayErrorBodySchema.safeParse(body)
  const detail = parsed.success
    ? (parsed.data.message ?? parsed.data.error ?? raw.slice(0, 300))
    : raw.trim().slice(0, 300) || 'sem corpo'

  return new InfinitePayApiError(
    status,
    `Erro ${status} da InfinitePay (${path}): ${detail}`,
    parsed.success ? (parsed.data.error ?? null) : null,
    parsed.success ? (parsed.data.redirect_url ?? null) : null,
  )
}

/**
 * POST com corpo JSON e resposta lida como texto antes do parse — um 200 com
 * corpo vazio ou HTML viraria um SyntaxError cru, sem dizer de onde veio.
 * Mesmo cuidado de `lib/buscaprocessos/client.ts`.
 */
async function post(path: string, body: unknown): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    throw new InfinitePayApiError(
      timedOut ? 504 : 502,
      timedOut
        ? `A InfinitePay não respondeu em ${TIMEOUT_MS / 1000} s (${path}).`
        : `Falha de rede ao chamar a InfinitePay (${path}).`,
    )
  }

  const raw = await response.text()

  // O corpo do erro é o único lugar que diz o que a API recusou.
  if (!response.ok) throw errorFromBody(response.status, path, raw)

  try {
    return JSON.parse(raw)
  } catch {
    throw new InfinitePayApiError(
      502,
      `Resposta não-JSON da InfinitePay (${path}): ${raw.slice(0, 300)}`,
    )
  }
}

/**
 * Gera o link de checkout. Devolve só a URL — é tudo o que a API responde.
 *
 * Erros que a tela precisa distinguir saem com `code`: conta sem checkout
 * externo ativado (ou InfiniteTag errada) é `external_checkout_not_enabled`, com
 * `actionUrl` apontando para onde se ativa.
 */
export async function createCheckoutLink(input: CreateLinkRequest): Promise<string> {
  const json = await post('/links', input)
  const parsed = createLinkResponseSchema.safeParse(json)

  if (!parsed.success) {
    throw new InfinitePayApiError(
      502,
      `Resposta inesperada do /links: ${JSON.stringify(json).slice(0, 300)}`,
    )
  }
  return parsed.data.url
}

/**
 * Pergunta à InfinitePay se o pagamento existe — a única prova que o sistema
 * aceita para dar baixa.
 *
 * Os quatro campos são obrigatórios, e `transaction_nsu` e `slug` só existem
 * depois do pagamento: a consulta confirma um pagamento que chegou ao nosso
 * conhecimento (pelo webhook ou pelo retorno do cliente), não descobre um que
 * se perdeu — o spike confirmou que só com `order_nsu` a resposta é
 * `{ success: false }`.
 *
 * `paid: true` prova que o pagamento existe e é deste `order_nsu`, NÃO que o
 * valor é o da cobrança: quem dá baixa compara `amount` com a cobrança (ver
 * `paymentCheckResponseSchema`).
 */
export async function checkPayment(input: PaymentCheckRequest): Promise<PaymentCheckResponse> {
  const json = await post('/payment_check', input)
  const parsed = paymentCheckResponseSchema.safeParse(json)

  if (!parsed.success) {
    throw new InfinitePayApiError(
      502,
      `Resposta inesperada do payment_check: ${JSON.stringify(json).slice(0, 300)}`,
    )
  }
  return parsed.data
}
