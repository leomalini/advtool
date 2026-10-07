import { z } from 'zod'

/**
 * O contrato da API de checkout da InfinitePay: o que a documentação descreve
 * (https://www.infinitepay.io/checkout-documentacao, lida em 2026-10-06) e o
 * que o spike de 2026-10-06 mediu nas chamadas reais — ver
 * `docs/integracao-infinitepay.md`, "O que o spike mostrou".
 *
 * A API não tem versão nem contrato publicado. Os schemas exigem só o que o
 * código usa e ignoram o resto: um campo novo do lado de lá não pode fazer um
 * pagamento real ser recusado aqui. O corpo cru fica em `webhook_events`, então
 * um formato inesperado pode ser reprocessado depois da correção.
 */

/** Centavos, como a API manda: R$ 10,00 = 1000. */
const cents = z.number().int().nonnegative()

/** Identificador obrigatório: vazio não identifica transação nenhuma. */
const identifier = z.string().trim().min(1)

// ── POST /links ─────────────────────────────────────────────────────────────

/** Corpo do `POST /links`. `items` em inglês: `"itens"`, como num exemplo da
 * documentação, volta 400. */
export interface CreateLinkRequest {
  handle: string
  items: { quantity: number; price: number; description: string }[]
  order_nsu: string
  redirect_url?: string
  webhook_url?: string
  /** Pré-preenche o checkout. Viaja legível dentro da URL do link. */
  customer?: { name?: string; email?: string; phone_number?: string }
}

/**
 * Resposta do `POST /links`: só a URL. Sem `slug` e sem id — o link é o pedido
 * comprimido e assinado dentro da própria URL (`?lenc=`), nada fica guardado
 * do lado de lá.
 */
export const createLinkResponseSchema = z.object({
  url: z.url({ protocol: /^https$/ }),
})

// ── Retorno e webhook ───────────────────────────────────────────────────────

/**
 * Corpo do webhook de pagamento aprovado.
 *
 * Só `order_nsu`, `transaction_nsu` e `invoice_slug` são exigidos: são o que
 * permite perguntar ao `payment_check` se o pagamento existe. Valor, parcelas e
 * método valem o que o `payment_check` responder, não o que veio aqui — o
 * webhook não é assinado.
 */
export const infinitePayWebhookSchema = z.object({
  order_nsu: identifier,
  transaction_nsu: identifier,
  invoice_slug: identifier,
  amount: cents.nullish(),
  paid_amount: cents.nullish(),
  installments: z.number().int().nonnegative().nullish(),
  capture_method: z.string().nullish(),
  receipt_url: z.string().nullish(),
})

export type InfinitePayWebhook = z.infer<typeof infinitePayWebhookSchema>

/**
 * O que a InfinitePay acrescenta à `redirect_url` quando o cliente clica em
 * "Continuar". Os mesmos dados do webhook, com `slug` no lugar de
 * `invoice_slug`. Na prática chega também `transaction_id`, fora da
 * documentação e com o mesmo valor de `transaction_nsu` — ignorado aqui.
 */
export const infinitePayRedirectSchema = z.object({
  order_nsu: identifier,
  transaction_nsu: identifier,
  slug: identifier,
  capture_method: z.string().nullish(),
  receipt_url: z.string().nullish(),
})

export type InfinitePayRedirect = z.infer<typeof infinitePayRedirectSchema>

// ── POST /payment_check ─────────────────────────────────────────────────────

/** Corpo do `POST /payment_check`. Os quatro campos são obrigatórios: sem
 * qualquer um deles a resposta é `{ "success": false }`. */
export interface PaymentCheckRequest {
  handle: string
  order_nsu: string
  transaction_nsu: string
  slug: string
}

/**
 * Resposta do `POST /payment_check`, medida no spike:
 *
 *   · `success: false` — a fatura (`slug`) não existe para essa conta, ou
 *     faltou campo. Não traz `paid`.
 *   · `success: true, paid: false` — a fatura existe, mas `transaction_nsu` ou
 *     `order_nsu` não batem com ela. Valores zerados.
 *   · `success: true, paid: true` — o pagamento existe e pertence a este
 *     `order_nsu`. `amount` é o preço do LINK pago, que não é necessariamente o
 *     da nossa cobrança: qualquer um pode gerar outro link com o mesmo
 *     `order_nsu` e um valor menor. Quem confere o valor é quem dá baixa.
 */
export const paymentCheckResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    paid: z.boolean(),
    amount: cents,
    paid_amount: cents,
    installments: z.number().int().nonnegative().nullish(),
    capture_method: z.string().nullish(),
  }),
  z.object({
    success: z.literal(false),
    message: z.string().nullish(),
  }),
])

export type PaymentCheckResponse = z.infer<typeof paymentCheckResponseSchema>

// ── Erros ───────────────────────────────────────────────────────────────────

/**
 * Corpo das respostas de erro, medido no spike:
 *
 *   400 `{ success: false, message: "param is missing or the value is empty
 *        or invalid: handle" }`
 *   404 `{ success: false, error: "external_checkout_not_enabled", message,
 *        redirect_url }` — InfiniteTag errada, ou conta sem o checkout ativado.
 */
export const infinitePayErrorBodySchema = z.object({
  error: z.string().nullish(),
  message: z.string().nullish(),
  redirect_url: z.string().nullish(),
})

/** O `error` que diz "conta sem checkout externo ativado" (ou tag errada). */
export const CHECKOUT_NOT_ENABLED = 'external_checkout_not_enabled'
