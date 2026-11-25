// Server-side. O client é a service_role da rota pública `/api/pagar/<token>`:
// não há sessão, e a autorização é o próprio token da cobrança.
import type { SupabaseClient } from '@supabase/supabase-js'
import { publicAppBaseUrl } from '@/lib/appUrl'
import { createChargeLink } from '@/lib/infinitepay/charges'
import { infinitePayApiKey } from '@/lib/infinitepay/client'
import { resolveInfinitePayHandle } from '@/lib/infinitepay/handle'
import {
  BILLING_COLUMNS,
  billingTerms,
  type Billing,
  type BillingCheckoutResult,
  type PublicBillingView,
} from '@/types/billing.types'
import {
  isChargeLive,
  LIVE_CHARGE_STATUSES,
  type PaymentChargeStatus,
} from '@/types/paymentCharge.types'
import {
  billingBlocker,
  entryAmountCents,
  ENTRY_FOR_BILLING_COLUMNS,
  type EntryForBilling,
} from './entries'
import { amountOnDay, type AmountOnDay } from './lateCharges'
import { officeDateOf } from './officeTime'
import { hashBillingToken, looksLikeBillingToken } from './token'

/** Links gerados por cobrança numa janela: quem tem a URL consegue clicar sem
 * parar, e cada clique seria um link novo na InfinitePay. */
const CHECKOUT_WINDOW_MS = 10 * 60_000
const CHECKOUT_MAX_PER_WINDOW = 5

/** `creating` mais velho que isso travou no meio da geração. */
const STUCK_CREATING_MS = 2 * 60_000

/** A abertura só é regravada depois disso: recarregar a página não vira
 * escrita no banco a cada vez. */
const VIEW_REWRITE_MS = 60_000

interface BillingWithEntry extends Billing {
  financial_entries: EntryForBilling
}

interface OfficeForPage {
  name: string | null
  phone: string | null
}

/** A cobrança do token, com o lançamento. Null para token mal formado ou que
 * não é de cobrança nenhuma — a página responde igual nos dois casos. */
export async function findBillingByToken(
  supabase: SupabaseClient,
  token: string,
): Promise<BillingWithEntry | null> {
  if (!looksLikeBillingToken(token)) return null

  const { data, error } = await supabase
    .from('billings')
    .select(`${BILLING_COLUMNS}, financial_entries!inner(${ENTRY_FOR_BILLING_COLUMNS})`)
    .eq('token_hash', await hashBillingToken(token))
    .maybeSingle()
  if (error) throw error
  return (data as unknown as BillingWithEntry | null) ?? null
}

async function loadOffice(supabase: SupabaseClient): Promise<OfficeForPage> {
  const { data, error } = await supabase
    .from('office_settings')
    .select('name, phone')
    .maybeSingle()
  if (error) throw error
  const office = data as OfficeForPage | null
  return { name: office?.name?.trim() || null, phone: office?.phone?.trim() || null }
}

interface SettlingPayment {
  paid_amount_cents: number
  confirmed_at: string
  receipt_url: string | null
}

/** O pagamento da InfinitePay que quitou o lançamento: o de uma cobrança paga,
 * com o valor dela e sem estorno. Null na baixa feita à mão. */
async function findSettlingPayment(
  supabase: SupabaseClient,
  entryId: string,
): Promise<SettlingPayment | null> {
  const { data, error } = await supabase
    .from('payment_charges')
    .select(
      'amount_cents, payment_transactions(amount_cents, paid_amount_cents, confirmed_at, ' +
        'receipt_url, refunded_at)',
    )
    .eq('financial_entry_id', entryId)
    .eq('status', 'paid')
  if (error) throw error

  const charges = (data ?? []) as unknown as {
    amount_cents: number
    payment_transactions:
      | (SettlingPayment & { amount_cents: number; refunded_at: string | null })[]
      | null
  }[]
  const settling = charges
    .flatMap((charge) =>
      (charge.payment_transactions ?? []).filter(
        (payment) => payment.amount_cents === charge.amount_cents && !payment.refunded_at,
      ),
    )
    .sort((a, b) => b.confirmed_at.localeCompare(a.confirmed_at))[0]
  return settling ?? null
}

/**
 * O estado da cobrança como o cliente o vê. Pago vem antes de encerrado: um
 * lançamento quitado depois de a cobrança sair do ar ainda mostra o recibo.
 */
/**
 * O valor de hoje da cobrança (migration 97). O desconto no Pix só existe com
 * a API Key: sem ela a InfinitePay não aceita `options`, e a página não pode
 * prometer o que o link não vai dar.
 */
export function billingAmountToday(
  billing: Pick<Billing, 'late_fee_percent' | 'monthly_interest_percent' | 'pix_discount_percent'>,
  entry: Pick<EntryForBilling, 'amount' | 'settlement_kind' | 'due_date'>,
  now: Date,
  options: { discountAvailable: boolean },
): AmountOnDay {
  const terms = billingTerms(billing)
  return amountOnDay({
    principalCents: entryAmountCents(entry) ?? 0,
    dueDate: entry.settlement_kind === 'scheduled' ? entry.due_date : null,
    today: officeDateOf(now),
    terms: options.discountAvailable ? terms : { ...terms, pixDiscountPercent: null },
  })
}

async function toPublicView(
  supabase: SupabaseClient,
  row: BillingWithEntry,
  office: OfficeForPage,
  now: Date,
): Promise<PublicBillingView> {
  const entry = row.financial_entries

  if (entry.type === 'receita' && entry.status === 'pago') {
    const payment = await findSettlingPayment(supabase, entry.id)
    return {
      status: 'paid',
      officeName: office.name,
      description: row.client_description,
      paidAmountCents: payment?.paid_amount_cents ?? null,
      paidAt: payment?.confirmed_at ?? entry.paid_at,
      receiptUrl: payment?.receipt_url ?? null,
    }
  }

  if (row.canceled_at !== null || billingBlocker(entry)) {
    return { status: 'unavailable', officeName: office.name, officePhone: office.phone }
  }

  const today = billingAmountToday(row, entry, now, {
    discountAvailable: infinitePayApiKey() !== null,
  })
  return {
    status: 'open',
    officeName: office.name,
    description: row.client_description,
    amountCents: today.totalCents,
    principalCents: today.principalCents,
    lateFeeCents: today.lateFeeCents,
    interestCents: today.interestCents,
    daysLate: today.daysLate,
    pixDiscount: today.pixDiscount,
    dueDate: entry.settlement_kind === 'scheduled' ? entry.due_date : null,
  }
}

/**
 * O que `/pagar/<token>` mostra. `recordView`: o cliente abriu — quem está
 * logado no escritório não conta. Só a página já renderizada chama isto (por
 * POST): a pré-visualização do WhatsApp, que só faz GET, não vira abertura.
 */
export async function getPublicBillingView(
  supabase: SupabaseClient,
  input: { token: string; recordView: boolean; now?: Date },
): Promise<PublicBillingView> {
  const row = await findBillingByToken(supabase, input.token)
  if (!row) return { status: 'not_found' }

  const now = input.now ?? new Date()
  const view = await toPublicView(supabase, row, await loadOffice(supabase), now)
  if (view.status === 'open' && input.recordView) {
    await recordView(supabase, row, now)
  }
  return view
}

async function recordView(supabase: SupabaseClient, billing: Billing, now: Date) {
  const last = billing.last_viewed_at ? new Date(billing.last_viewed_at).getTime() : 0
  if (now.getTime() - last < VIEW_REWRITE_MS) return

  const moment = now.toISOString()
  const { error } = await supabase
    .from('billings')
    .update({ last_viewed_at: moment, ...(billing.viewed_at ? {} : { viewed_at: moment }) })
    .eq('id', billing.id)
  // A abertura é informação, não condição: falhar aqui não tira a página do ar.
  if (error) console.error('[billing] abertura não gravada:', billing.id, error.message)
}

async function recordClick(supabase: SupabaseClient, billingId: string, now: Date) {
  const { error } = await supabase
    .from('billings')
    .update({ checkout_clicked_at: now.toISOString() })
    .eq('id', billingId)
  if (error) console.error('[billing] clique não gravado:', billingId, error.message)
}

interface LiveChargeRow {
  id: string
  status: PaymentChargeStatus
  amount_cents: number
  pix_discount_percent: number | null
  checkout_url: string | null
  expires_at: string | null
  created_at: string
}

/** Falha do clique, com o texto para o cliente — o detalhe fica no log. */
export interface CheckoutError {
  status: 'error'
  httpStatus: number
  message: string
}

export type CheckoutOutcome = BillingCheckoutResult | CheckoutError

const TRY_AGAIN = 'Não foi possível abrir o pagamento agora. Tente de novo em instantes.'

function checkoutError(httpStatus: number, message: string = TRY_AGAIN): CheckoutError {
  return { status: 'error', httpStatus, message }
}

/**
 * O link do dia que ainda serve: em aberto, do valor e do desconto de hoje,
 * gerado hoje (em Brasília) e não vencido. Um link de ontem vale até o fim de
 * hoje, mas o de hoje dá ao cliente o dia de amanhã inteiro.
 */
function reusableLink(
  charges: readonly LiveChargeRow[],
  amountCents: number,
  pixDiscountPercent: number | null,
  now: Date,
): LiveChargeRow | null {
  const today = officeDateOf(now)
  const discount = (value: number | null) => (value === null ? null : Number(value))
  return (
    charges.find(
      (charge) =>
        charge.status === 'open' &&
        charge.checkout_url !== null &&
        charge.amount_cents === amountCents &&
        discount(charge.pix_discount_percent) === discount(pixDiscountPercent) &&
        officeDateOf(new Date(charge.created_at)) === today &&
        isChargeLive(charge, now),
    ) ?? null
  )
}

async function liveChargesOf(supabase: SupabaseClient, entryId: string) {
  const { data, error } = await supabase
    .from('payment_charges')
    .select('id, status, amount_cents, pix_discount_percent, checkout_url, expires_at, created_at')
    .eq('financial_entry_id', entryId)
    .in('status', [...LIVE_CHARGE_STATUSES])
  if (error) throw error
  return (data ?? []) as unknown as LiveChargeRow[]
}

/**
 * Tira do caminho o que ocupa a vaga de link vivo: o link aberto de outro dia
 * (ou de outro valor) vira `superseded` — se o cliente ainda pagar por ele,
 * quita —, e o `creating` travado vira `failed`.
 */
async function retireLiveCharges(supabase: SupabaseClient, charges: readonly LiveChargeRow[]) {
  for (const charge of charges) {
    const { error } =
      charge.status === 'open'
        ? await supabase
            .from('payment_charges')
            .update({ status: 'superseded' })
            .eq('id', charge.id)
            .eq('status', 'open')
        : await supabase
            .from('payment_charges')
            .update({ status: 'failed', error: 'Geração interrompida; substituída por outra.' })
            .eq('id', charge.id)
            .eq('status', 'creating')
    if (error) throw error
  }
}

/**
 * O clique em "Pagar": devolve o checkout da InfinitePay com o valor de hoje.
 *
 * Reaproveita o link do dia; senão aposenta o anterior e gera outro. O índice
 * único de link vivo segura o duplo clique: quem perde a corrida usa o link de
 * quem ganhou. `recordClick`: o cliente clicou — o escritório logado não conta.
 */
export async function startBillingCheckout(
  supabase: SupabaseClient,
  input: { token: string; requestOrigin: string; recordClick: boolean; now?: Date },
): Promise<CheckoutOutcome> {
  const now = input.now ?? new Date()
  const row = await findBillingByToken(supabase, input.token)
  if (!row) return { status: 'not_found' }

  const view = await toPublicView(supabase, row, await loadOffice(supabase), now)
  if (view.status !== 'open') return view

  const entry = row.financial_entries
  const amountCents = view.amountCents
  const pixDiscountPercent = view.pixDiscount?.percent ?? null

  const handle = await resolveInfinitePayHandle(supabase)
  if (!handle) {
    console.error('[billing] clique sem conta da InfinitePay configurada:', row.id)
    return checkoutError(503)
  }

  const live = await liveChargesOf(supabase, entry.id)
  const reusable = reusableLink(live, amountCents, pixDiscountPercent, now)
  if (reusable?.checkout_url) {
    if (input.recordClick) await recordClick(supabase, row.id, now)
    return { status: 'redirect', url: reusable.checkout_url }
  }

  const generating = live.find(
    (charge) =>
      charge.status === 'creating' &&
      now.getTime() - new Date(charge.created_at).getTime() < STUCK_CREATING_MS,
  )
  if (generating) {
    return checkoutError(409, 'O pagamento está sendo preparado. Tente de novo em instantes.')
  }

  const since = new Date(now.getTime() - CHECKOUT_WINDOW_MS).toISOString()
  const { count, error: countError } = await supabase
    .from('payment_charges')
    .select('id', { count: 'exact', head: true })
    .eq('financial_entry_id', entry.id)
    .gte('created_at', since)
  if (countError) throw countError
  if ((count ?? 0) >= CHECKOUT_MAX_PER_WINDOW) {
    return checkoutError(429, 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.')
  }

  await retireLiveCharges(supabase, live)

  const result = await createChargeLink(supabase, {
    entry: { id: entry.id, amountCents, client: entry.client },
    handle,
    description: row.client_description,
    createdBy: row.created_by,
    returnBaseUrl: publicAppBaseUrl() ?? input.requestOrigin,
    composition: {
      principalCents: view.principalCents,
      lateFeeCents: view.lateFeeCents,
      interestCents: view.interestCents,
      pixDiscountPercent,
    },
    now,
  })

  if (!result.ok) {
    if (result.code === 'live_charge_exists') {
      // Outro clique gerou primeiro: vale o link dele, se já estiver pronto.
      const winner = reusableLink(
        await liveChargesOf(supabase, entry.id),
        amountCents,
        pixDiscountPercent,
        now,
      )
      if (winner?.checkout_url) {
        if (input.recordClick) await recordClick(supabase, row.id, now)
        return { status: 'redirect', url: winner.checkout_url }
      }
      return checkoutError(409, 'O pagamento está sendo preparado. Tente de novo em instantes.')
    }
    console.error('[billing] link da InfinitePay não gerado:', row.id, result.code, result.error)
    return checkoutError(result.status >= 500 ? 502 : 503)
  }

  if (!result.charge.checkout_url) return checkoutError(502)
  if (input.recordClick) await recordClick(supabase, row.id, now)
  return { status: 'redirect', url: result.charge.checkout_url }
}
