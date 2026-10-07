import { createClient } from '@/lib/supabase/client'
import {
  PAYMENT_CHARGE_COLUMNS,
  PAYMENT_TRANSACTION_COLUMNS,
  type PaymentCharge,
  type PaymentChargeWithTransactions,
} from '@/types/paymentCharge.types'

const supabase = createClient()

/**
 * Os links de pagamento da InfinitePay (migration 67).
 *
 * Leitura direto do banco — a RLS já limita a `financeiro:view`. Gerar e
 * cancelar passam por rota, porque as tabelas não têm policy de escrita: quem
 * grava é a service_role, depois de a rota conferir a permissão.
 */

/** Erro de uma rota de cobrança, com o que a tela precisa para orientar:
 * `code` (ex.: `external_checkout_not_enabled`) e onde resolver. */
export class PaymentLinkError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly actionUrl: string | null,
  ) {
    super(message)
    this.name = 'PaymentLinkError'
  }
}

const CHARGE_WITH_TRANSACTIONS =
  `${PAYMENT_CHARGE_COLUMNS}, transactions:payment_transactions(${PAYMENT_TRANSACTION_COLUMNS})`

/** Todos os links do lançamento, do mais novo ao mais antigo, com os
 * pagamentos confirmados de cada um. */
export async function getPaymentChargesForEntry(
  entryId: string,
): Promise<PaymentChargeWithTransactions[]> {
  const { data, error } = await supabase
    .from('payment_charges')
    .select(CHARGE_WITH_TRANSACTIONS)
    .eq('financial_entry_id', entryId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as PaymentChargeWithTransactions[]
}

interface ChargeRouteBody {
  charge?: PaymentCharge
  error?: string
  code?: string | null
  actionUrl?: string | null
}

async function postCharge(path: string, fallback: string): Promise<PaymentCharge> {
  const response = await fetch(path, { method: 'POST' })
  const body = (await response.json().catch(() => null)) as ChargeRouteBody | null

  if (!response.ok || !body?.charge) {
    throw new PaymentLinkError(body?.error ?? fallback, body?.code ?? null, body?.actionUrl ?? null)
  }
  return body.charge
}

export function createPaymentLink(entryId: string): Promise<PaymentCharge> {
  return postCharge(
    `/api/financeiro/lancamentos/${encodeURIComponent(entryId)}/link-pagamento`,
    'Não foi possível gerar o link de pagamento.',
  )
}

export function cancelPaymentLink(chargeId: string): Promise<PaymentCharge> {
  return postCharge(
    `/api/financeiro/cobrancas/${encodeURIComponent(chargeId)}/cancelar`,
    'Não foi possível cancelar o link de pagamento.',
  )
}

/**
 * Registra um estorno já feito no app da InfinitePay. `entryReopened`: o
 * lançamento voltou a pendente, porque era este pagamento que o quitava.
 */
export async function refundPaymentTransaction(
  transactionId: string,
): Promise<{ entryReopened: boolean }> {
  const response = await fetch(
    `/api/financeiro/transacoes/${encodeURIComponent(transactionId)}/estorno`,
    { method: 'POST' },
  )
  const body = (await response.json().catch(() => null)) as {
    entryReopened?: boolean
    error?: string
  } | null

  if (!response.ok || typeof body?.entryReopened !== 'boolean') {
    throw new PaymentLinkError(body?.error ?? 'Não foi possível registrar o estorno.', null, null)
  }
  return { entryReopened: body.entryReopened }
}
