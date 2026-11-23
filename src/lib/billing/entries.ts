// Server-side. Lê o lançamento pelo client que a rota passar (service_role).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PaymentClient } from '@/lib/infinitepay/customer'
import { toCents } from '@/lib/infinitepay/money'
import { MIN_BILLING_AMOUNT_CENTS } from '@/types/billing.types'
import type {
  FinancialEntryCategory,
  FinancialEntryStatus,
  FinancialEntryType,
  FinancialSettlementKind,
} from '@/types/financialEntry.types'

/** O lançamento como a cobrança precisa dele: o que decide se é cobrável, o
 * que sugere a descrição e quem pré-preenche o checkout. */
export interface EntryForBilling {
  id: string
  type: FinancialEntryType
  status: FinancialEntryStatus
  amount: number
  category: FinancialEntryCategory
  description: string
  settlement_kind: FinancialSettlementKind
  due_date: string | null
  paid_at: string | null
  client: PaymentClient | null
}

export const ENTRY_FOR_BILLING_COLUMNS = `
  id, type, status, amount, category, description, settlement_kind, due_date, paid_at,
  client:clients(
    type, name, company_name, trade_name, email, phone,
    contacts:client_contacts(type, value, is_primary)
  )
`

export async function loadEntryForBilling(
  supabase: SupabaseClient,
  entryId: string,
): Promise<EntryForBilling | null> {
  const { data, error } = await supabase
    .from('financial_entries')
    .select(ENTRY_FOR_BILLING_COLUMNS)
    .eq('id', entryId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as EntryForBilling | null) ?? null
}

/** O valor do lançamento em centavos, ou null se não for um valor cobrável. */
export function entryAmountCents(entry: Pick<EntryForBilling, 'amount'>): number | null {
  const amount = Number(entry.amount)
  if (!Number.isFinite(amount) || amount < 0) return null
  return toCents(amount)
}

export interface BillingBlocker {
  status: number
  error: string
  code: string
}

/**
 * Por que o lançamento não pode ser cobrado agora, ou null se pode. Puro: a
 * rota do escritório e a página pública perguntam a mesma coisa.
 *
 * Valor abaixo de R$ 1,00 cobre também o êxito a apurar (R$ 0): a InfinitePay
 * não aceita pagamento menor que isso.
 */
export function billingBlocker(
  entry: Pick<EntryForBilling, 'type' | 'status' | 'amount'>,
): BillingBlocker | null {
  if (entry.type !== 'receita') {
    return { status: 422, error: 'Só receita pode ser cobrada.', code: 'not_income' }
  }
  if (entry.status !== 'pendente') {
    return { status: 409, error: 'Este lançamento já está pago.', code: 'already_paid' }
  }
  const cents = entryAmountCents(entry)
  if (cents === null || cents < MIN_BILLING_AMOUNT_CENTS) {
    return {
      status: 422,
      error: 'A InfinitePay só aceita pagamentos a partir de R$ 1,00.',
      code: 'amount_too_low',
    }
  }
  return null
}

/** Nome para a tela: empresa pelo nome fantasia, pessoa pelo nome. */
export function clientDisplayName(
  client: Pick<PaymentClient, 'type' | 'name' | 'company_name' | 'trade_name'> | null,
): string | null {
  if (!client) return null
  const name =
    client.type === 'company' ? (client.trade_name ?? client.company_name) : client.name
  return name?.trim() || null
}
