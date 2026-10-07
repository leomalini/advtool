// Server-side. O client é a service_role da rota, chamada só depois de
// `requireApiPermission`: as tabelas de cobrança não têm policy de escrita
// (migration 67), e é aqui que o ciclo creating → open → … é imposto.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  LIVE_CHARGE_STATUSES,
  PAYMENT_CHARGE_COLUMNS,
  PAYMENT_CHARGE_STATUS_LABELS,
  type PaymentCharge,
  type PaymentChargeStatus,
} from '@/types/paymentCharge.types'
import { createCheckoutLink, InfinitePayApiError } from './client'
import { buildCustomer, type PaymentClient } from './customer'
import { toCents } from './money'
import { CHECKOUT_NOT_ENABLED, type CreateLinkRequest } from './schemas'
import { generateWebhookToken } from './token'
import { infinitePayWebhookUrl } from './urls'

/** Para onde o cliente volta depois de pagar (página pública, Fase 3). */
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

const ENTRY_FOR_CHARGE = `
  id, type, status, amount, description,
  client:clients(
    type, name, company_name, trade_name, email, phone,
    contacts:client_contacts(type, value, is_primary)
  )
`

interface EntryForCharge {
  id: string
  type: 'receita' | 'despesa'
  status: 'pendente' | 'pago'
  amount: number
  description: string
  client: PaymentClient | null
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
 * Gera o link de pagamento de uma receita pendente.
 *
 * A linha nasce `creating` ANTES da chamada à InfinitePay: o índice único de
 * link vivo por lançamento barra o clique duplo antes de existir um segundo
 * link, e o id dela é o `order_nsu` que vai no link. Só depois da resposta ela
 * vira `open` (com a URL) ou `failed` (com o motivo).
 */
export async function issueCharge(
  supabase: SupabaseClient,
  input: { entryId: string; userId: string; returnBaseUrl: string },
): Promise<ChargeResult> {
  const { data, error: entryError } = await supabase
    .from('financial_entries')
    .select(ENTRY_FOR_CHARGE)
    .eq('id', input.entryId)
    .maybeSingle()
  if (entryError) throw entryError

  const entry = data as unknown as EntryForCharge | null
  if (!entry) return failure(404, 'Lançamento não encontrado.')
  if (entry.type !== 'receita') return failure(422, 'Só receita pode ser cobrada por link.')
  if (entry.status !== 'pendente') return failure(409, 'Este lançamento já está pago.')

  const amountCents = toCents(Number(entry.amount))
  if (amountCents <= 0) return failure(422, 'Lançamento sem valor não gera link.')

  const { data: settings, error: settingsError } = await supabase
    .from('office_settings')
    .select('infinitepay_handle')
    .maybeSingle()
  if (settingsError) throw settingsError

  const handle = (settings as { infinitepay_handle: string | null } | null)?.infinitepay_handle
  if (!handle) {
    return failure(
      409,
      'A conta da InfinitePay não está configurada (Configurações → Pagamentos).',
      'handle_missing',
    )
  }

  const description = entry.description.trim()
  const customer = buildCustomer(entry.client)
  const { token, tokenHash } = await generateWebhookToken()

  const { data: created, error: insertError } = await supabase
    .from('payment_charges')
    .insert({
      financial_entry_id: entry.id,
      handle,
      description,
      amount_cents: amountCents,
      customer_name: customer?.name ?? null,
      webhook_token_hash: tokenHash,
      created_by: input.userId,
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
    handle,
    items: [{ quantity: 1, price: amountCents, description }],
    order_nsu: charge.id,
    redirect_url: `${input.returnBaseUrl.replace(/\/+$/, '')}${PAYMENT_RETURN_PATH}`,
    // Sem endereço público não há como receber o aviso: o link sai sem ele e a
    // baixa fica com o retorno do cliente (ver `infinitePayWebhookUrl`).
    ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
    ...(customer ? { customer } : {}),
  }

  let url: string
  try {
    url = await createCheckoutLink(request)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Falha inesperada ao gerar o link.'
    await markFailed(supabase, charge.id, reason)

    if (!(error instanceof InfinitePayApiError)) throw error
    if (error.code === CHECKOUT_NOT_ENABLED) {
      return failure(
        409,
        'A InfinitePay recusou a conta: o checkout externo não está ativado, ou a InfiniteTag ' +
          'configurada está errada.',
        CHECKOUT_NOT_ENABLED,
        error.actionUrl,
      )
    }
    return failure(502, `A InfinitePay não gerou o link. ${error.message}`, error.code)
  }

  const { data: opened, error: openError } = await supabase
    .from('payment_charges')
    .update({ status: 'open', checkout_url: url })
    .eq('id', charge.id)
    .select(PAYMENT_CHARGE_COLUMNS)
    .single()

  if (openError) {
    // O link existe do lado de lá, mas a URL não chegou a ninguém: sem ela,
    // ninguém paga. Falha é o retrato honesto — e libera um novo link.
    await markFailed(supabase, charge.id, `Link gerado, mas não gravado: ${openError.message}`)
    throw openError
  }
  return { ok: true, charge: opened as unknown as PaymentCharge }
}

// ── Cancelar ────────────────────────────────────────────────────────────────

/**
 * Deixa de oferecer o link. ⚠️ A InfinitePay não cancela link: quem já o tem
 * ainda consegue pagar, e esse pagamento entra registrado, com alerta.
 *
 * `creating` também cancela: é a saída para um link que travou no meio da
 * geração e, sem isso, bloquearia um novo para sempre.
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
    .in('status', [...LIVE_CHARGE_STATUSES])
    .select(PAYMENT_CHARGE_COLUMNS)
  if (error) throw error

  const canceled = (data ?? []) as unknown as PaymentCharge[]
  if (canceled.length > 0) return { ok: true, charge: canceled[0] }

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
    return failure(502, error.message, error.code)
  }
}
