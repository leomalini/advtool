import type { Billing, BillingWithUrl, OpenBilling } from '@/types/billing.types'
import { PaymentLinkError } from './paymentCharges.service'

/**
 * As cobranças (migration 95): a página `/pagar/<token>` de cada lançamento.
 *
 * Tudo por rota, inclusive a leitura: a URL deriva de um segredo do servidor,
 * e `billings` não tem policy de escrita — quem grava é a service_role, depois
 * de a rota conferir a permissão.
 */

interface BillingRouteBody {
  billing?: Billing | null
  url?: string | null
  billings?: OpenBilling[]
  error?: string
  code?: string | null
}

async function request(
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<BillingRouteBody> {
  const response = await fetch(path, { ...init, cache: 'no-store' })
  const body = (await response.json().catch(() => null)) as BillingRouteBody | null
  if (!response.ok || !body) {
    throw new PaymentLinkError(body?.error ?? fallback, body?.code ?? null, null)
  }
  return body
}

function billingPath(entryId: string, suffix = ''): string {
  return `/api/financeiro/lancamentos/${encodeURIComponent(entryId)}/cobranca${suffix}`
}

function withUrl(body: BillingRouteBody, fallback: string): BillingWithUrl {
  if (!body.billing || !body.url) throw new PaymentLinkError(fallback, null, null)
  return { billing: body.billing, url: body.url }
}

/** A cobrança do lançamento e a URL dela; nulos quando nunca houve uma. */
export async function getBillingForEntry(
  entryId: string,
): Promise<{ billing: Billing | null; url: string | null }> {
  const body = await request(
    billingPath(entryId),
    { method: 'GET' },
    'Não foi possível carregar a cobrança.',
  )
  return { billing: body.billing ?? null, url: body.url ?? null }
}

/** Põe a cobrança no ar (ou a religa). Sem descrição, a do cliente é sugerida
 * pelo servidor a partir do lançamento. */
export async function openBilling(
  entryId: string,
  clientDescription?: string,
): Promise<BillingWithUrl> {
  const fallback = 'Não foi possível gerar o link de pagamento.'
  const body = await request(
    billingPath(entryId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientDescription === undefined ? {} : { clientDescription }),
    },
    fallback,
  )
  return withUrl(body, fallback)
}

export async function updateBillingDescription(
  entryId: string,
  clientDescription: string,
): Promise<BillingWithUrl> {
  const fallback = 'Não foi possível trocar a descrição.'
  const body = await request(
    billingPath(entryId),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientDescription }),
    },
    fallback,
  )
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
