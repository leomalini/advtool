// Server-side. O client é a service_role da rota, chamada só depois de
// `requireApiPermission`: `billings` não tem policy de escrita (migration 95).
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveInfinitePayHandle } from '@/lib/infinitepay/handle'
import {
  BILLING_COLUMNS,
  CLIENT_DESCRIPTION_MAX,
  defaultClientDescription,
  type Billing,
  type OpenBilling,
} from '@/types/billing.types'
import { billingBlocker, clientDisplayName, loadEntryForBilling } from './entries'
import { deriveBillingToken, hashBillingToken } from './token'
import { billingPageUrl } from './urls'

/** Violação de índice único: a segunda cobrança do mesmo lançamento. */
const UNIQUE_VIOLATION = '23505'

export interface BillingFailure {
  ok: false
  status: number
  error: string
  code: string | null
}

export type BillingResult = { ok: true; billing: Billing } | BillingFailure

function failure(status: number, error: string, code: string | null = null): BillingFailure {
  return { ok: false, status, error, code }
}

/** A descrição que o cliente vê, limpa; null se vazia ou longa demais. */
function normalizeDescription(value: string): string | null {
  const text = value.replace(/\s+/g, ' ').trim()
  return text && text.length <= CLIENT_DESCRIPTION_MAX ? text : null
}

const INVALID_DESCRIPTION = `Descreva a cobrança em até ${CLIENT_DESCRIPTION_MAX} caracteres.`

export async function getBillingForEntry(
  supabase: SupabaseClient,
  entryId: string,
): Promise<Billing | null> {
  const { data, error } = await supabase
    .from('billings')
    .select(BILLING_COLUMNS)
    .eq('financial_entry_id', entryId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as Billing | null) ?? null
}

/**
 * Põe a cobrança de um lançamento no ar: cria, ou religa a encerrada com a
 * mesma URL. Numa cobrança já no ar, só troca a descrição, se vier.
 *
 * As regras são as do link de antes: receita, pendente, a partir de R$ 1,00 e
 * conta da InfinitePay configurada — conferidas aqui para o escritório saber
 * na hora, e não quando o cliente clicar em "Pagar".
 */
/**
 * Multa e juros que o contrato do lançamento prevê, para a cobrança nascer com
 * eles (migration 97). Copiados, não ligados: mudar o contrato depois não muda
 * a cobrança, como não muda o lançamento. Sem contrato, nada — "só se o
 * contrato prever" (docs/cobrancas.md).
 */
async function contractTermsOf(
  supabase: SupabaseClient,
  entryId: string,
): Promise<{ late_fee_percent?: number; monthly_interest_percent?: number }> {
  const { data, error } = await supabase
    .from('financial_entries')
    .select('contract:contracts(late_fee_percent, monthly_interest_percent)')
    .eq('id', entryId)
    .maybeSingle()
  if (error) throw error
  const contract = (data as unknown as {
    contract: { late_fee_percent: number | null; monthly_interest_percent: number | null } | null
  } | null)?.contract
  if (!contract) return {}
  return {
    ...(contract.late_fee_percent ? { late_fee_percent: Number(contract.late_fee_percent) } : {}),
    ...(contract.monthly_interest_percent
      ? { monthly_interest_percent: Number(contract.monthly_interest_percent) }
      : {}),
  }
}

export async function openBilling(
  supabase: SupabaseClient,
  input: { entryId: string; userId: string; clientDescription?: string },
): Promise<BillingResult> {
  const entry = await loadEntryForBilling(supabase, input.entryId)
  if (!entry) return failure(404, 'Lançamento não encontrado.')

  const blocker = billingBlocker(entry)
  if (blocker) return failure(blocker.status, blocker.error, blocker.code)

  if (!(await resolveInfinitePayHandle(supabase))) {
    return failure(
      409,
      'A conta da InfinitePay não está configurada (Configurações → Pagamentos).',
      'handle_missing',
    )
  }

  let description: string | null = null
  if (input.clientDescription !== undefined) {
    description = normalizeDescription(input.clientDescription)
    if (!description) return failure(422, INVALID_DESCRIPTION, 'invalid_description')
  }

  const existing = await getBillingForEntry(supabase, entry.id)
  if (existing) {
    const reopening = existing.canceled_at !== null
    if (!reopening && (!description || description === existing.client_description)) {
      return { ok: true, billing: existing }
    }
    const { data, error } = await supabase
      .from('billings')
      .update({
        ...(reopening ? { canceled_at: null, canceled_by: null } : {}),
        ...(description ? { client_description: description } : {}),
      })
      .eq('id', existing.id)
      .select(BILLING_COLUMNS)
      .single()
    if (error) throw error
    return { ok: true, billing: data as unknown as Billing }
  }

  // O id nasce aqui porque o token deriva dele, e o banco guarda o hash.
  const id = crypto.randomUUID()
  const { data, error } = await supabase
    .from('billings')
    .insert({
      id,
      financial_entry_id: entry.id,
      token_hash: await hashBillingToken(await deriveBillingToken(id)),
      client_description: description ?? defaultClientDescription(entry),
      ...(await contractTermsOf(supabase, entry.id)),
      created_by: input.userId,
    })
    .select(BILLING_COLUMNS)
    .single()

  // Duplo clique: a outra requisição criou primeiro. Vale a dela.
  if (error?.code === UNIQUE_VIOLATION) {
    const winner = await getBillingForEntry(supabase, entry.id)
    if (winner) return { ok: true, billing: winner }
  }
  if (error) throw error
  return { ok: true, billing: data as unknown as Billing }
}

/** Troca a descrição que o cliente vê de uma cobrança no ar. */
export async function updateBillingDescription(
  supabase: SupabaseClient,
  input: { entryId: string; clientDescription: string },
): Promise<BillingResult> {
  const description = normalizeDescription(input.clientDescription)
  if (!description) return failure(422, INVALID_DESCRIPTION, 'invalid_description')

  const { data, error } = await supabase
    .from('billings')
    .update({ client_description: description })
    .eq('financial_entry_id', input.entryId)
    .is('canceled_at', null)
    .select(BILLING_COLUMNS)
  if (error) throw error

  const updated = ((data ?? []) as unknown as Billing[])[0]
  return updated ? { ok: true, billing: updated } : failure(404, 'Não há cobrança no ar.')
}

/**
 * Tira a cobrança do ar: a página passa a dizer que não está disponível, e o
 * link da InfinitePay em aberto deixa de ser oferecido. ⚠️ A InfinitePay não
 * cancela link: quem já abriu o checkout ainda paga até o `expires_at` — esse
 * pagamento entra registrado, com alerta (`confirm.ts`).
 */
export async function closeBilling(
  supabase: SupabaseClient,
  input: { entryId: string; userId: string },
): Promise<BillingResult> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('billings')
    .update({ canceled_at: now, canceled_by: input.userId })
    .eq('financial_entry_id', input.entryId)
    .is('canceled_at', null)
    .select(BILLING_COLUMNS)
  if (error) throw error

  const closed = ((data ?? []) as unknown as Billing[])[0]
  if (!closed) return failure(404, 'Não há cobrança no ar.')

  // O link em aberto vira `canceled`; o que ainda estava sendo gerado não tem
  // URL, e a migration 67 só aceita cancelado com URL — ele vira `failed`.
  const { error: openError } = await supabase
    .from('payment_charges')
    .update({ status: 'canceled', canceled_at: now, canceled_by: input.userId })
    .eq('financial_entry_id', input.entryId)
    .eq('status', 'open')
  if (openError) throw openError

  const { error: creatingError } = await supabase
    .from('payment_charges')
    .update({ status: 'failed', error: 'Cobrança encerrada durante a geração do link.' })
    .eq('financial_entry_id', input.entryId)
    .eq('status', 'creating')
  if (creatingError) throw creatingError

  return { ok: true, billing: closed }
}

interface OpenBillingRow extends Billing {
  financial_entries: {
    id: string
    description: string
    amount: number
    due_date: string | null
    client: {
      type: 'individual' | 'company'
      name: string | null
      company_name: string | null
      trade_name: string | null
    } | null
  }
}

/** As cobranças no ar de receitas pendentes, da que vence antes à sem data,
 * com a URL de cada uma — o card do dashboard. */
export async function listOpenBillings(
  supabase: SupabaseClient,
  requestOrigin: string,
): Promise<OpenBilling[]> {
  const { data, error } = await supabase
    .from('billings')
    .select(
      `${BILLING_COLUMNS},
       financial_entries!inner(id, description, amount, due_date, status, type,
         client:clients(type, name, company_name, trade_name))`,
    )
    .is('canceled_at', null)
    .eq('financial_entries.status', 'pendente')
    .eq('financial_entries.type', 'receita')
  if (error) throw error

  const rows = (data ?? []) as unknown as OpenBillingRow[]
  const open = await Promise.all(
    rows.map(async ({ financial_entries: entry, ...billing }) => ({
      billing,
      url: await billingPageUrl(billing.id, requestOrigin),
      entry: {
        id: entry.id,
        description: entry.description,
        amount: Number(entry.amount),
        due_date: entry.due_date,
      },
      client_name: clientDisplayName(entry.client),
    })),
  )
  return open.sort((a, b) =>
    (a.entry.due_date ?? '9999-12-31').localeCompare(b.entry.due_date ?? '9999-12-31'),
  )
}
