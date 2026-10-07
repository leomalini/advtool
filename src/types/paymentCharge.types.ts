/**
 * Espelha `public.payment_charges` e `public.payment_transactions`
 * (migration 67). Valores em centavos, como a API da InfinitePay usa.
 */

/** O ciclo de um link — ver o passo 2 da migration 67. */
export type PaymentChargeStatus =
  | 'creating'
  | 'open'
  | 'paid'
  | 'canceled'
  | 'refunded'
  | 'failed'

/** Por onde a confirmação chegou: entrega do webhook, retorno do cliente ou
 * conferência pedida por alguém do escritório. */
export type PaymentConfirmationSource = 'webhook' | 'redirect' | 'manual'

/**
 * Um link de pagamento. O `id` é o `order_nsu` enviado à InfinitePay.
 *
 * `webhook_token_hash` fica de fora de propósito: a tela não tem o que fazer
 * com ele, e as consultas da tela nomeiam as colunas que leem.
 */
export interface PaymentCharge {
  id: string
  financial_entry_id: string | null
  provider: 'infinitepay'
  /** InfiniteTag usada neste link — a configuração pode ter mudado depois. */
  handle: string
  description: string
  amount_cents: number
  customer_name: string | null
  checkout_url: string | null
  status: PaymentChargeStatus
  /** Motivo de `failed`. */
  error: string | null
  canceled_at: string | null
  canceled_by: string | null
  created_by: string
  created_at: string
  updated_at: string
}

/** Um pagamento que o `payment_check` confirmou. */
export interface PaymentTransaction {
  id: string
  charge_id: string
  transaction_nsu: string
  invoice_slug: string
  /** 'pix' | 'credit_card' na documentação; texto livre no banco. */
  capture_method: string | null
  installments: number | null
  amount_cents: number
  /** Passa de `amount_cents` quando o cliente pagou os juros do parcelamento. */
  paid_amount_cents: number
  receipt_url: string | null
  confirmed_via: PaymentConfirmationSource
  /** Quando a confirmação chegou — a API não informa a hora do pagamento. */
  confirmed_at: string
  refunded_at: string | null
  refunded_by: string | null
  created_at: string
}
