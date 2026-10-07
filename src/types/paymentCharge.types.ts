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

/** Link que o cliente ainda consegue pagar: `creating` pode já ter virado link
 * do lado de lá antes de a resposta chegar. */
export const LIVE_CHARGE_STATUSES: readonly PaymentChargeStatus[] = ['creating', 'open']

export const PAYMENT_CHARGE_STATUS_LABELS: Record<PaymentChargeStatus, string> = {
  creating: 'Gerando link',
  open: 'Link em aberto',
  paid: 'Pago',
  canceled: 'Cancelado',
  refunded: 'Estornado',
  failed: 'Falhou',
}

/** Rótulo do método de pagamento; texto livre no banco, então o fallback é o
 * próprio valor. */
export function describeCaptureMethod(method: string | null): string {
  if (method === 'pix') return 'Pix'
  if (method === 'credit_card') return 'cartão'
  return method ?? 'método não informado'
}

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

/** As colunas de `PaymentCharge`, para os selects da tela e das rotas — o hash
 * do token fica de fora. */
export const PAYMENT_CHARGE_COLUMNS =
  'id, financial_entry_id, provider, handle, description, amount_cents, customer_name, ' +
  'checkout_url, status, error, canceled_at, canceled_by, created_by, created_at, updated_at'

/** As colunas de `PaymentTransaction`. */
export const PAYMENT_TRANSACTION_COLUMNS =
  'id, charge_id, transaction_nsu, invoice_slug, capture_method, installments, ' +
  'amount_cents, paid_amount_cents, receipt_url, confirmed_via, confirmed_at, ' +
  'refunded_at, refunded_by, created_at'

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

export interface PaymentChargeWithTransactions extends PaymentCharge {
  transactions: PaymentTransaction[]
}

/** O que a lista de lançamentos embute de cada cobrança: o bastante para o
 * ícone da linha e para as travas. */
export interface PaymentChargeSummary {
  id: string
  status: PaymentChargeStatus
}

/**
 * Há link que o cliente ainda paga (`live`)? Há pagamento confirmado
 * (`paid`)? As duas perguntas são independentes: um link cancelado pode ser
 * pago enquanto outro, novo, está em aberto.
 *
 * Espelha a trava `guard_financial_entry_charges` da migration 67 — a tela
 * trava o que o banco recusaria.
 */
export function summarizePaymentCharges(
  charges: readonly Pick<PaymentCharge, 'status'>[] | undefined,
): { live: boolean; paid: boolean } {
  const list = charges ?? []
  return {
    live: list.some((charge) => LIVE_CHARGE_STATUSES.includes(charge.status)),
    paid: list.some((charge) => charge.status === 'paid'),
  }
}

/** SQLSTATE das travas da migration 67 — HTTP 409 pelo PostgREST. */
export const CHARGE_GUARD_ERROR_CODE = 'PT409'

/**
 * A mensagem da trava, quando o erro é ela. As mensagens já saem do banco em
 * português, escritas para quem está na tela — repeti-las aqui só criaria uma
 * segunda versão que envelhece separada.
 */
export function chargeGuardMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const { code, message } = error as { code?: unknown; message?: unknown }
  return code === CHARGE_GUARD_ERROR_CODE && typeof message === 'string' ? message : null
}

/**
 * Por que um atalho não age sobre lançamento com cobrança — o texto do aviso
 * que aparece no clique. Aviso, e não botão `disabled` com `title`: no celular
 * não existe hover, e um botão morto sem explicação parece defeito.
 */
export const CHARGE_BLOCK_REASONS = {
  markPaidWithLiveLink:
    'Há um link de pagamento em aberto: abra o lançamento para cancelar o link e dar baixa.',
  reopenPaidOnline: 'Pago pela InfinitePay: o lançamento não volta a pendente por aqui.',
  deleteWithLiveLink: 'Há um link de pagamento em aberto: cancele o link antes de excluir.',
  deletePaidOnline: 'Pago pela InfinitePay: o lançamento não sai do Financeiro.',
} as const
