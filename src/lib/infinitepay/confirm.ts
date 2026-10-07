// Server-side. O client é a service_role: o webhook não tem sessão e a página
// de retorno é pública. A autorização aqui é o `payment_check`, não um perfil.
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatCurrency } from '@/types/financialEntry.types'
import {
  describeCaptureMethod,
  type PaymentChargeStatus,
  type PaymentConfirmationSource,
} from '@/types/paymentCharge.types'
import type { WebhookEventDestination } from '@/types/webhookEvent.types'
import { checkPayment } from './client'

/**
 * Confirma um pagamento e, quando for o caso, dá baixa no lançamento.
 *
 * Mesmo caminho para as três entradas — entrega do webhook, retorno do
 * cliente e reprocessamento —, e idempotente: o webhook é reentregue, o
 * retorno pode chegar junto com ele, e um reprocessamento precisa conseguir
 * completar uma baixa que parou no meio.
 *
 * As regras (ver "O que o spike mostrou" em docs/integracao-infinitepay.md):
 *
 *   1. Nada do que chegou vale como prova. O `payment_check` é consultado com
 *      a InfiniteTag guardada NA COBRANÇA, e só `paid: true` segue adiante.
 *   2. `paid: true` não prova o valor: qualquer um gera um link com o nosso
 *      `order_nsu` e outro preço. Baixa só com `amount` igual ao da cobrança.
 *   3. A transação é gravada sempre que o pagamento existe — o dinheiro entrou —,
 *      mesmo quando não dá baixa. O sino avisa o que pede decisão.
 */

const UNIQUE_VIOLATION = '23505'
const OFFICE_TIME_ZONE = 'America/Sao_Paulo'
const RECEIPT_HOST = 'recibo.infinitepay.io'

export interface ConfirmPaymentInput {
  orderNsu: string
  transactionNsu: string
  slug: string
  receiptUrl?: string | null
  captureMethod?: string | null
  via: PaymentConfirmationSource
}

export type ConfirmOutcome =
  | {
      status: 'processed' | 'duplicate'
      transactionId: string
      /** O lançamento recebeu baixa NESTA rodada. */
      settled: boolean
      entryId: string | null
      /** Por que não deu baixa, quando não deu. */
      reason: string | null
      destinations: WebhookEventDestination[]
    }
  /** Não é pagamento desta cobrança — não adianta tentar de novo. */
  | { status: 'invalid'; reason: string }
  /** Falha nossa ou da InfinitePay — dá para reprocessar depois. */
  | { status: 'error'; error: string }

interface ChargeForConfirmation {
  id: string
  financial_entry_id: string | null
  handle: string
  amount_cents: number
  status: PaymentChargeStatus
  description: string
  customer_name: string | null
}

interface StoredTransaction {
  id: string
  charge_id: string
  amount_cents: number
  paid_amount_cents: number
  capture_method: string | null
  installments: number | null
  confirmed_at: string
}

const CHARGE_FOR_CONFIRMATION =
  'id, financial_entry_id, handle, amount_cents, status, description, customer_name'
const STORED_TRANSACTION =
  'id, charge_id, amount_cents, paid_amount_cents, capture_method, installments, confirmed_at'

/** 'yyyy-MM-dd' no fuso do escritório. `paid_at` é `date` e a Vercel roda em
 * UTC: um Pix das 22h de Brasília cairia no dia seguinte. */
function officeDate(moment: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: OFFICE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(moment)
}

/**
 * O comprovante que a tela vai oferecer como link. Só do domínio da
 * InfinitePay: o valor chegou no corpo do webhook ou na URL do retorno, e quem
 * tem o link de pagamento consegue forjar os dois — um endereço qualquer aqui
 * viraria um link de phishing dentro do sistema. Fora do domínio, vale o
 * endereço que o spike mostrou (`recibo.infinitepay.io/<transaction_nsu>`).
 */
export function trustedReceiptUrl(candidate: string | null | undefined, transactionNsu: string) {
  if (candidate) {
    try {
      const url = new URL(candidate)
      if (url.protocol === 'https:' && url.hostname === RECEIPT_HOST) return url.toString()
    } catch {
      // URL inválida: cai no endereço derivado.
    }
  }
  return `https://${RECEIPT_HOST}/${encodeURIComponent(transactionNsu)}`
}

async function findTransaction(
  supabase: SupabaseClient,
  transactionNsu: string,
): Promise<StoredTransaction | null> {
  const { data, error } = await supabase
    .from('payment_transactions')
    .select(STORED_TRANSACTION)
    .eq('transaction_nsu', transactionNsu)
    .maybeSingle()
  if (error) throw error
  return (data as StoredTransaction | null) ?? null
}

// ── Avisos ──────────────────────────────────────────────────────────────────

type NoticeKind = 'pagamento_recebido' | 'pagamento_alerta'

async function notify(
  supabase: SupabaseClient,
  input: { kind: NoticeKind; title: string; body: string; entryId: string | null; via: string },
) {
  const { error } = await supabase.from('notifications').insert({
    kind: input.kind,
    // Só quem vê o Financeiro recebe — o feed de atividades não teria esse filtro.
    resource: 'financeiro',
    title: input.title,
    body: input.body,
    link: input.entryId ? `/financeiro?id=${input.entryId}` : '/financeiro',
    entity_type: input.entryId ? 'financial_entry' : null,
    entity_id: input.entryId,
    source: input.via === 'redirect' ? 'retorno' : 'webhook',
  })
  if (error) console.error('[infinitepay] aviso não gravado:', input.kind, error.message)
}

function describePayment(transaction: StoredTransaction): string {
  const method = describeCaptureMethod(transaction.capture_method)
  const installments = (transaction.installments ?? 1) > 1 ? ` em ${transaction.installments}x` : ''
  return `${formatCurrency(transaction.amount_cents / 100)} via ${method}${installments}`
}

// ── Baixa ───────────────────────────────────────────────────────────────────

interface Settlement {
  settled: boolean
  entryId: string | null
  reason: string | null
  destinations: WebhookEventDestination[]
}

/**
 * Do pagamento confirmado para a cobrança e o lançamento. Idempotente: cada
 * update só pega a linha no estado de origem, e o aviso só sai quando algo
 * mudou nesta rodada — reprocessar não repete sino.
 *
 * `isNew`: a transação foi gravada agora. Numa reentrega da mesma transação, a
 * cobrança já `paid` é o esperado (a primeira rodada pode ter parado antes do
 * lançamento); numa transação NOVA, é um segundo pagamento do mesmo link.
 */
async function settle(
  supabase: SupabaseClient,
  charge: ChargeForConfirmation,
  transaction: StoredTransaction,
  isNew: boolean,
  via: string,
): Promise<Settlement> {
  const entryId = charge.financial_entry_id
  const payment = describePayment(transaction)
  const who = charge.customer_name ? ` de ${charge.customer_name}` : ''
  const alert = (title: string, body: string) =>
    notify(supabase, { kind: 'pagamento_alerta', title, body, entryId, via })
  const result = (
    settled: boolean,
    reason: string | null,
    destinations: WebhookEventDestination[] = [],
  ): Settlement => ({
    settled,
    entryId,
    reason,
    destinations,
  })

  // Regra 2: link clonado com o nosso order_nsu e outro preço.
  if (transaction.amount_cents !== charge.amount_cents) {
    if (isNew) {
      await alert(
        'Pagamento com valor diferente',
        `Chegou ${payment}${who} por um link de ${formatCurrency(charge.amount_cents / 100)} ` +
          `("${charge.description}"). O lançamento não recebeu baixa: confira no app da ` +
          'InfinitePay.',
      )
    }
    return result(false, 'Valor pago diferente do valor da cobrança.')
  }

  if (charge.status === 'paid' && isNew) {
    await alert(
      'Pagamento em dobro',
      `O link de "${charge.description}" foi pago de novo: ${payment}${who}. ` +
        'Confira se é caso de estorno.',
    )
    return result(false, 'Segundo pagamento do mesmo link.')
  }
  if (charge.status === 'refunded' || charge.status === 'failed') {
    if (isNew) {
      await alert(
        'Pagamento em cobrança encerrada',
        `Chegou ${payment}${who} por um link marcado como ` +
          `${charge.status === 'refunded' ? 'estornado' : 'falho'} ("${charge.description}").`,
      )
    }
    return result(false, `Cobrança ${charge.status}.`)
  }

  const wasCanceled = charge.status === 'canceled'
  let chargeChanged = false
  if (charge.status !== 'paid') {
    const { data, error } = await supabase
      .from('payment_charges')
      .update({ status: 'paid' })
      .eq('id', charge.id)
      .in('status', ['creating', 'open', 'canceled'])
      .select('id')
    if (error) throw error
    chargeChanged = (data ?? []).length > 0
  }
  const destinations: WebhookEventDestination[] = chargeChanged
    ? [{ table: 'payment_charges', id: charge.id, action: 'updated', detail: 'paga' }]
    : []

  // Link cancelado e pago assim mesmo: o escritório decide entre estorno e baixa.
  if (wasCanceled) {
    if (chargeChanged) {
      await alert(
        'Pagamento em link cancelado',
        `O link de "${charge.description}" tinha sido cancelado e foi pago: ${payment}${who}. ` +
          'O lançamento não recebeu baixa — decida entre estorno e baixa manual.',
      )
    }
    return result(false, 'Link cancelado antes do pagamento.', destinations)
  }

  if (!entryId) {
    if (chargeChanged) {
      await alert(
        'Pagamento sem lançamento',
        `Chegou ${payment}${who} pelo link de "${charge.description}", mas o lançamento foi ` +
          'excluído. Confira no app da InfinitePay.',
      )
    }
    return result(false, 'Cobrança sem lançamento.', destinations)
  }

  const { data: updated, error: entryError } = await supabase
    .from('financial_entries')
    .update({ status: 'pago', paid_at: officeDate(new Date(transaction.confirmed_at)) })
    .eq('id', entryId)
    .eq('status', 'pendente')
    .select('id')
  if (entryError) throw entryError

  if ((updated ?? []).length === 0) {
    // Já estava pago: baixa à mão antes do pagamento online, ou reprocessamento
    // de uma baixa que já tinha acontecido.
    if (chargeChanged) {
      await alert(
        'Pagamento em lançamento já pago',
        `"${charge.description}" já estava pago quando chegou ${payment}${who}. ` +
          'Confira se é caso de estorno.',
      )
    }
    return result(false, 'O lançamento já estava pago.', destinations)
  }

  destinations.push({ table: 'financial_entries', id: entryId, action: 'updated', detail: 'pago' })
  await notify(supabase, {
    kind: 'pagamento_recebido',
    title: 'Pagamento recebido',
    body: `${payment}${who} — "${charge.description}".`,
    entryId,
    via,
  })
  return { settled: true, entryId, reason: null, destinations }
}

// ── Confirmação ─────────────────────────────────────────────────────────────

export async function confirmPayment(
  supabase: SupabaseClient,
  input: ConfirmPaymentInput,
): Promise<ConfirmOutcome> {
  try {
    const { data, error } = await supabase
      .from('payment_charges')
      .select(CHARGE_FOR_CONFIRMATION)
      .eq('id', input.orderNsu)
      .maybeSingle()
    if (error) throw error
    if (!data) return { status: 'invalid', reason: 'Nenhuma cobrança com esse order_nsu.' }
    const charge = data as unknown as ChargeForConfirmation

    // Já gravada: reentrega do webhook, ou o retorno depois dele. Sem nova
    // consulta à InfinitePay — mas a baixa ainda pode estar por terminar.
    const existing = await findTransaction(supabase, input.transactionNsu)
    if (existing) {
      if (existing.charge_id !== charge.id) {
        return { status: 'invalid', reason: 'A transação pertence a outra cobrança.' }
      }
      const settlement = await settle(supabase, charge, existing, false, input.via)
      return { status: 'duplicate', transactionId: existing.id, ...settlement }
    }

    // Regra 1: a InfinitePay, com a tag desta cobrança, diz se é pagamento dela.
    const check = await checkPayment({
      handle: charge.handle,
      order_nsu: charge.id,
      transaction_nsu: input.transactionNsu,
      slug: input.slug,
    })
    if (!check.success) {
      return { status: 'invalid', reason: 'A InfinitePay não reconhece esse pagamento.' }
    }
    if (!check.paid) {
      return {
        status: 'invalid',
        reason: 'Segundo a InfinitePay, isso não é pagamento desta cobrança.',
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from('payment_transactions')
      .insert({
        charge_id: charge.id,
        transaction_nsu: input.transactionNsu,
        invoice_slug: input.slug,
        capture_method: check.capture_method ?? input.captureMethod ?? null,
        installments: check.installments ?? null,
        amount_cents: check.amount,
        paid_amount_cents: check.paid_amount,
        receipt_url: trustedReceiptUrl(input.receiptUrl, input.transactionNsu),
        confirmed_via: input.via,
      })
      .select(STORED_TRANSACTION)
      .single()

    // Corrida com outra entrada (webhook e retorno juntos): a outra gravou.
    if (insertError?.code === UNIQUE_VIOLATION) {
      const winner = await findTransaction(supabase, input.transactionNsu)
      if (!winner) throw insertError
      const settlement = await settle(supabase, charge, winner, false, input.via)
      return { status: 'duplicate', transactionId: winner.id, ...settlement }
    }
    if (insertError) throw insertError

    const transaction = inserted as unknown as StoredTransaction
    const settlement = await settle(supabase, charge, transaction, true, input.via)
    return {
      status: 'processed',
      transactionId: transaction.id,
      ...settlement,
      destinations: [
        { table: 'payment_transactions', id: transaction.id, action: 'inserted' },
        ...settlement.destinations,
      ],
    }
  } catch (error) {
    return { status: 'error', error: errorMessage(error) }
  }
}

/** Erro do PostgREST não é necessariamente `Error`: lê `message` de qualquer objeto. */
function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'Falha inesperada ao confirmar o pagamento.'
}
