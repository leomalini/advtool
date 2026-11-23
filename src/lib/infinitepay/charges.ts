// Server-side. O client é a service_role da rota — chamada depois de
// `requireApiPermission`, ou pela página pública depois de conferir o token da
// cobrança: as tabelas de cobrança não têm policy de escrita (migration 67), e
// é aqui que o ciclo creating → open → … é imposto.
import type { SupabaseClient } from '@supabase/supabase-js'
import { linkValidity } from '@/lib/billing/officeTime'
import {
  PAYMENT_CHARGE_COLUMNS,
  PAYMENT_CHARGE_STATUS_LABELS,
  type PaymentCharge,
  type PaymentChargeStatus,
} from '@/types/paymentCharge.types'
import { createCheckoutLink, InfinitePayApiError, infinitePayApiKey } from './client'
import { buildCustomer, type PaymentClient } from './customer'
import { CHECKOUT_NOT_ENABLED, type CreateLinkRequest } from './schemas'
import { generateWebhookToken } from './token'
import { infinitePayWebhookUrl } from './urls'

/** Para onde o cliente volta depois de pagar (página pública). */
export const PAYMENT_RETURN_PATH = '/pagamento/retorno'

/** Violação de índice único: o segundo link vivo do mesmo lançamento. */
const UNIQUE_VIOLATION = '23505'

/** O que a tela precisa para explicar uma recusa. `code` distingue os casos que
 * pedem ação (configurar a conta, ativar o checkout) dos demais. */
export interface ChargeFailure {
  ok: false
  status: number
  error: string
  code: string | null
  actionUrl: string | null
}

export type ChargeResult = { ok: true; charge: PaymentCharge } | ChargeFailure

function failure(
  status: number,
  error: string,
  code: string | null = null,
  actionUrl: string | null = null,
): ChargeFailure {
  return { ok: false, status, error, code, actionUrl }
}

// ── Gerar ───────────────────────────────────────────────────────────────────

/** O que `createChargeLink` precisa do lançamento, já conferido por quem chama
 * (receita, pendente, valor mínimo). */
export interface ChargeLinkEntry {
  id: string
  amountCents: number
  client: PaymentClient | null
}

export interface ChargeLinkInput {
  entry: ChargeLinkEntry
  /** A InfiniteTag que recebe (`resolveInfinitePayHandle`). */
  handle: string
  /** O item do checkout: a descrição que o cliente vê (`billings`). */
  description: string
  /** Quem responde pelo link. Na página pública, quem criou a cobrança. */
  createdBy: string
  /** Para onde o cliente volta depois de pagar. */
  returnBaseUrl: string
  now?: Date
}

/** A falha da InfinitePay dita para a tela, com o atalho quando há um. */
function linkFailure(error: InfinitePayApiError): ChargeFailure {
  if (error.code === CHECKOUT_NOT_ENABLED) {
    return failure(
      409,
      'A InfinitePay recusou a conta: o checkout externo não está ativado, ou a InfiniteTag ' +
        'configurada está errada.',
      CHECKOUT_NOT_ENABLED,
      error.actionUrl,
    )
  }
  if (error.status === 403) {
    // A documentação: chave e handle de contas diferentes respondem 403.
    return failure(
      409,
      'A InfinitePay recusou o pedido: a API Key (INFINITEPAY_API_KEY) não é da conta da ' +
        'InfiniteTag configurada.',
      'api_key_account_mismatch',
    )
  }
  return failure(502, `A InfinitePay não gerou o link. ${error.message}`, error.code)
}

async function markFailed(supabase: SupabaseClient, chargeId: string, reason: string) {
  const { error } = await supabase
    .from('payment_charges')
    .update({ status: 'failed', error: reason.slice(0, 1000) })
    .eq('id', chargeId)
    .eq('status', 'creating')
  if (error) {
    console.error('[infinitepay] cobrança não marcada como falha:', chargeId, error.message)
  }
}

/**
 * Gera o link da InfinitePay de uma cobrança. Quem decide QUANDO é a página
 * pública, no clique em "Pagar" (`lib/billing/checkout.ts`); aqui mora o COMO.
 *
 * A linha nasce `creating` ANTES da chamada à InfinitePay: o índice único de
 * link vivo por lançamento barra o clique duplo antes de existir um segundo
 * link, e o id dela é o `order_nsu` que vai no link. Só depois da resposta ela
 * vira `open` (com a URL) ou `failed` (com o motivo).
 *
 * Com a API Key, o link nasce com pagamento único e validade até o fim do dia
 * seguinte (`expires_at`). Sem ela, como antes: sem validade, aceitando mais de
 * um pagamento.
 */
export async function createChargeLink(
  supabase: SupabaseClient,
  input: ChargeLinkInput,
): Promise<ChargeResult> {
  const description = input.description.trim()
  const customer = buildCustomer(input.entry.client)
  const { token, tokenHash } = await generateWebhookToken()
  const withOptions = infinitePayApiKey() !== null
  const validity = withOptions ? linkValidity(input.now ?? new Date()) : null

  const { data: created, error: insertError } = await supabase
    .from('payment_charges')
    .insert({
      financial_entry_id: input.entry.id,
      handle: input.handle,
      description,
      amount_cents: input.entry.amountCents,
      customer_name: customer?.name ?? null,
      webhook_token_hash: tokenHash,
      expires_at: validity?.expiresAt ?? null,
      single_payment: withOptions,
      created_by: input.createdBy,
    })
    .select(PAYMENT_CHARGE_COLUMNS)
    .single()

  if (insertError?.code === UNIQUE_VIOLATION) {
    return failure(
      409,
      'Já existe um link de pagamento em aberto para este lançamento.',
      'live_charge_exists',
    )
  }
  if (insertError) throw insertError

  const charge = created as unknown as PaymentCharge
  const webhookUrl = infinitePayWebhookUrl(token)
  const request: CreateLinkRequest = {
    handle: input.handle,
    items: [{ quantity: 1, price: input.entry.amountCents, description }],
    order_nsu: charge.id,
    redirect_url: `${input.returnBaseUrl.replace(/\/+$/, '')}${PAYMENT_RETURN_PATH}`,
    // Sem endereço público não há como receber o aviso: o link sai sem ele e a
    // baixa fica com o retorno do cliente (ver `infinitePayWebhookUrl`).
    ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
    ...(customer ? { customer } : {}),
    ...(validity ? { options: { single_payment: true, valid_until: validity.validUntil } } : {}),
  }

  let url: string
  try {
    url = await createCheckoutLink(request)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Falha inesperada ao gerar o link.'
    await markFailed(supabase, charge.id, reason)

    if (!(error instanceof InfinitePayApiError)) throw error
    return linkFailure(error)
  }

  // Só de `creating`: se a cobrança foi encerrada no meio (o link virou
  // `failed`), a URL nova não pode ressuscitá-lo.
  const { data: opened, error: openError } = await supabase
    .from('payment_charges')
    .update({ status: 'open', checkout_url: url })
    .eq('id', charge.id)
    .eq('status', 'creating')
    .select(PAYMENT_CHARGE_COLUMNS)

  if (openError) {
    // O link existe do lado de lá, mas a URL não chegou a ninguém: sem ela,
    // ninguém paga. Falha é o retrato honesto — e libera um novo link.
    await markFailed(supabase, charge.id, `Link gerado, mas não gravado: ${openError.message}`)
    throw openError
  }
  const charged = ((opened ?? []) as unknown as PaymentCharge[])[0]
  if (!charged) {
    return failure(409, 'A cobrança foi encerrada enquanto o link era gerado.', 'charge_closed')
  }
  return { ok: true, charge: charged }
}

// ── Cancelar ────────────────────────────────────────────────────────────────

/**
 * Deixa de oferecer o link. ⚠️ A InfinitePay não cancela link: quem já o tem
 * ainda consegue pagar, e esse pagamento entra registrado, com alerta.
 *
 * `creating` também sai do caminho, como `failed`: é a saída para um link que
 * travou no meio da geração e, sem isso, bloquearia um novo para sempre.
 */
export async function cancelCharge(
  supabase: SupabaseClient,
  input: { chargeId: string; userId: string },
): Promise<ChargeResult> {
  const { data, error } = await supabase
    .from('payment_charges')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      canceled_by: input.userId,
    })
    .eq('id', input.chargeId)
    .eq('status', 'open')
    .select(PAYMENT_CHARGE_COLUMNS)
  if (error) throw error

  const canceled = (data ?? []) as unknown as PaymentCharge[]
  if (canceled.length > 0) return { ok: true, charge: canceled[0] }

  // Travado em `creating` não tem URL, e a migration 67 só aceita cancelado
  // com URL (`payment_charges_url_once_issued`): vira `failed`, com o motivo.
  const { data: stopped, error: stopError } = await supabase
    .from('payment_charges')
    .update({ status: 'failed', error: 'Cancelado durante a geração do link.' })
    .eq('id', input.chargeId)
    .eq('status', 'creating')
    .select(PAYMENT_CHARGE_COLUMNS)
  if (stopError) throw stopError

  const failedNow = (stopped ?? []) as unknown as PaymentCharge[]
  if (failedNow.length > 0) return { ok: true, charge: failedNow[0] }

  const { data: current, error: currentError } = await supabase
    .from('payment_charges')
    .select('status')
    .eq('id', input.chargeId)
    .maybeSingle()
  if (currentError) throw currentError
  if (!current) return failure(404, 'Cobrança não encontrada.')

  const status = (current as { status: PaymentChargeStatus }).status
  return failure(409, `Este link não está em aberto (${PAYMENT_CHARGE_STATUS_LABELS[status]}).`)
}

// ── Verificar a conta ───────────────────────────────────────────────────────

/**
 * Confere se a InfiniteTag aceita link, gerando um de R$ 1,00 que não vai a
 * ninguém. Não deixa rastro do lado de lá: o link é só uma URL assinada (ver o
 * spike no plano). O `404 external_checkout_not_enabled` é o que separa tag
 * errada, ou conta sem checkout ativado, de conta pronta.
 */
export async function verifyInfinitePayHandle(
  handle: string,
): Promise<{ ok: true } | ChargeFailure> {
  try {
    await createCheckoutLink({
      handle,
      items: [{ quantity: 1, price: 100, description: 'Verificação da conta (AdvTool)' }],
      order_nsu: `verificacao-${crypto.randomUUID()}`,
    })
    return { ok: true }
  } catch (error) {
    if (!(error instanceof InfinitePayApiError)) throw error
    if (error.code === CHECKOUT_NOT_ENABLED) {
      return failure(
        409,
        'A conta não aceita links: o checkout externo não está ativado, ou a InfiniteTag está ' +
          'errada.',
        CHECKOUT_NOT_ENABLED,
        error.actionUrl,
      )
    }
    if (error.status === 403) return linkFailure(error)
    return failure(502, error.message, error.code)
  }
}

// ── Registrar estorno ───────────────────────────────────────────────────────

export type RefundResult = { ok: true; entryReopened: boolean } | ChargeFailure

/**
 * Registra um estorno feito no app da InfinitePay — a API não estorna, então o
 * sistema só anota o que já aconteceu lá.
 *
 * Em cascata, e só até onde ainda for verdade:
 *
 *   1. a transação ganha `refunded_at`;
 *   2. a cobrança `paid` vira `refunded`, se não sobrou outro pagamento do
 *      valor dela sem estorno;
 *   3. o lançamento `pago` volta a `pendente`, se não sobrou outra cobrança
 *      paga — a ordem é a que a trava da migration 67 aceita.
 *
 * Estornar um pagamento que nunca deu baixa (valor diferente, link cancelado)
 * para no passo 1.
 */
export async function refundTransaction(
  supabase: SupabaseClient,
  input: { transactionId: string; userId: string },
): Promise<RefundResult> {
  const { data: refunded, error } = await supabase
    .from('payment_transactions')
    .update({ refunded_at: new Date().toISOString(), refunded_by: input.userId })
    .eq('id', input.transactionId)
    .is('refunded_at', null)
    .select('id, charge_id')
  if (error) throw error

  const transaction = ((refunded ?? []) as { id: string; charge_id: string }[])[0]
  if (!transaction) {
    const { data: current, error: currentError } = await supabase
      .from('payment_transactions')
      .select('id')
      .eq('id', input.transactionId)
      .maybeSingle()
    if (currentError) throw currentError
    return current
      ? failure(409, 'O estorno deste pagamento já foi registrado.')
      : failure(404, 'Pagamento não encontrado.')
  }

  const { data: chargeRow, error: chargeError } = await supabase
    .from('payment_charges')
    .select('id, status, amount_cents, financial_entry_id')
    .eq('id', transaction.charge_id)
    .single()
  if (chargeError) throw chargeError
  const charge = chargeRow as {
    id: string
    status: PaymentChargeStatus
    amount_cents: number
    financial_entry_id: string | null
  }

  if (charge.status !== 'paid') return { ok: true, entryReopened: false }

  const { count: stillPaid, error: paidError } = await supabase
    .from('payment_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('charge_id', charge.id)
    .eq('amount_cents', charge.amount_cents)
    .is('refunded_at', null)
  if (paidError) throw paidError
  if ((stillPaid ?? 0) > 0) return { ok: true, entryReopened: false }

  const { error: refundError } = await supabase
    .from('payment_charges')
    .update({ status: 'refunded' })
    .eq('id', charge.id)
    .eq('status', 'paid')
  if (refundError) throw refundError

  if (!charge.financial_entry_id) return { ok: true, entryReopened: false }

  const { count: otherPaid, error: otherError } = await supabase
    .from('payment_charges')
    .select('id', { count: 'exact', head: true })
    .eq('financial_entry_id', charge.financial_entry_id)
    .eq('status', 'paid')
  if (otherError) throw otherError
  if ((otherPaid ?? 0) > 0) return { ok: true, entryReopened: false }

  const { data: reopened, error: reopenError } = await supabase
    .from('financial_entries')
    .update({ status: 'pendente', paid_at: null })
    .eq('id', charge.financial_entry_id)
    .eq('status', 'pago')
    .select('id')
  if (reopenError) throw reopenError

  return { ok: true, entryReopened: (reopened ?? []).length > 0 }
}
