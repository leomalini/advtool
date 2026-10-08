import { createClient } from '@/lib/supabase/client'
import {
  LIVE_CHARGE_STATUSES,
  PAYMENT_CHARGE_COLUMNS,
  PAYMENT_TRANSACTION_COLUMNS,
  type PaymentCharge,
  type PaymentChargeWithTransactions,
  type RecentPayment,
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

/** Links que o cliente ainda consegue pagar, do mais antigo ao mais novo — o
 * que espera há mais tempo vem primeiro. */
export async function getLiveCharges(): Promise<PaymentCharge[]> {
  const { data, error } = await supabase
    .from('payment_charges')
    .select(PAYMENT_CHARGE_COLUMNS)
    .in('status', [...LIVE_CHARGE_STATUSES])
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as PaymentCharge[]
}

/** Pagamentos confirmados nos últimos `days` dias, do mais novo ao mais antigo.
 * Estornados ficam de fora: o dinheiro voltou. */
export async function getRecentPayments(days: number, limit = 10): Promise<RecentPayment[]> {
  const since = new Date(Date.now() - days * 24 * 3_600_000).toISOString()

  const { data, error } = await supabase
    .from('payment_transactions')
    .select(
      `${PAYMENT_TRANSACTION_COLUMNS}, ` +
        'charge:payment_charges(id, financial_entry_id, description, customer_name, status, canceled_at)',
    )
    .is('refunded_at', null)
    .gte('confirmed_at', since)
    .order('confirmed_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as unknown as RecentPayment[]
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
