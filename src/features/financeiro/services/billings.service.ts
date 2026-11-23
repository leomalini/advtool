import type {
  Billing,
  BillingMessage,
  BillingPanel,
  BillingPanelItem,
  BillingWithUrl,
  OpenBilling,
} from '@/types/billing.types'
import { PaymentLinkError } from './paymentCharges.service'

/**
 * As cobranças (migrations 95 e 96): a página `/pagar/<token>` de cada
 * lançamento e a régua de avisos.
 *
 * Tudo por rota, inclusive a leitura: a URL deriva de um segredo do servidor,
 * a régua é calculada lá (a mesma conta do cron), e `billings` e
 * `billing_messages` não têm policy de escrita.
 */

interface BillingRouteBody {
  billing?: Billing | null
  url?: string | null
  item?: BillingPanelItem | null
  officeName?: string | null
  officePhone?: string | null
  billings?: OpenBilling[]
  message?: BillingMessage
  results?: BatchResult[]
  error?: string
  code?: string | null
}

async function request<T = BillingRouteBody>(
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<T> {
  const response = await fetch(path, { ...init, cache: 'no-store' })
  const body = (await response.json().catch(() => null)) as (T & { error?: string; code?: string | null }) | null
  if (!response.ok || !body) {
    throw new PaymentLinkError(body?.error ?? fallback, body?.code ?? null, null)
  }
  return body
}

function json(method: string, payload: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
}

function billingPath(entryId: string, suffix = ''): string {
  return `/api/financeiro/lancamentos/${encodeURIComponent(entryId)}/cobranca${suffix}`
}

function withUrl(body: BillingRouteBody, fallback: string): BillingWithUrl {
  if (!body.billing || !body.url) throw new PaymentLinkError(fallback, null, null)
  return { billing: body.billing, url: body.url }
}

/** A cobrança do detalhe: a URL e a régua de hoje. Nulos quando nunca houve. */
export interface EntryBilling {
  billing: Billing | null
  url: string | null
  item: BillingPanelItem | null
  officeName: string | null
  officePhone: string | null
}

export async function getBillingForEntry(entryId: string): Promise<EntryBilling> {
  const body = await request(
    billingPath(entryId),
    { method: 'GET' },
    'Não foi possível carregar a cobrança.',
  )
  return {
    billing: body.billing ?? null,
    url: body.url ?? null,
    item: body.item ?? null,
    officeName: body.officeName ?? null,
    officePhone: body.officePhone ?? null,
  }
}

/** Põe a cobrança no ar (ou a religa). Sem descrição, o servidor sugere uma a
 * partir do lançamento; `reminders` liga os lembretes junto. */
export async function openBilling(
  entryId: string,
  options: { clientDescription?: string; reminders?: boolean } = {},
): Promise<BillingWithUrl> {
  const fallback = 'Não foi possível gerar o link de pagamento.'
  const body = await request(billingPath(entryId), json('POST', options), fallback)
  return withUrl(body, fallback)
}

/** O que dá para mudar numa cobrança no ar (PATCH da rota). */
export interface BillingChanges {
  clientDescription?: string
  reminders?: boolean
  paused?: boolean
  recipientPhone?: string | null
  clientOptOut?: boolean
}

export async function updateBilling(
  entryId: string,
  changes: BillingChanges,
): Promise<BillingWithUrl> {
  const fallback = 'Não foi possível alterar a cobrança.'
  const body = await request(billingPath(entryId), json('PATCH', changes), fallback)
  return withUrl(body, fallback)
}

export async function closeBilling(entryId: string): Promise<BillingWithUrl> {
  const fallback = 'Não foi possível encerrar a cobrança.'
  const body = await request(billingPath(entryId, '/encerrar'), { method: 'POST' }, fallback)
  return withUrl(body, fallback)
}

/** As cobranças no ar do escritório — o card do dashboard. */
export async function getOpenBillings(): Promise<OpenBilling[]> {
  const body = await request(
    '/api/financeiro/cobrancas/abertas',
    { method: 'GET' },
    'Não foi possível carregar as cobranças.',
  )
  return body.billings ?? []
}

/** A aba Cobranças: todas, com a régua de hoje. */
export function getBillingPanel(): Promise<BillingPanel> {
  return request<BillingPanel>(
    '/api/financeiro/cobrancas/painel',
    { method: 'GET' },
    'Não foi possível carregar as cobranças.',
  )
}

export interface ReminderRecordInput {
  billingId: string
  step: string
  dueDate: string
  status: 'manual' | 'skipped'
}

export async function recordReminder(input: ReminderRecordInput): Promise<BillingMessage> {
  const fallback = 'Não foi possível registrar o aviso.'
  const body = await request('/api/financeiro/cobrancas/avisos', json('POST', input), fallback)
  if (!body.message) throw new PaymentLinkError(fallback, null, null)
  return body.message
}

export async function undoReminder(messageId: string): Promise<void> {
  await request(
    `/api/financeiro/cobrancas/avisos/${encodeURIComponent(messageId)}`,
    { method: 'DELETE' },
    'Não foi possível desfazer.',
  )
}

export interface BatchResult {
  entryId: string
  ok: boolean
  error: string | null
}

export async function enableRemindersBatch(entryIds: string[]): Promise<BatchResult[]> {
  const body = await request(
    '/api/financeiro/cobrancas/lote',
    json('POST', { entryIds }),
    'Não foi possível ligar os lembretes.',
  )
  return body.results ?? []
}
