import { createClient } from '@/lib/supabase/client'
import { recordActivity } from '@/lib/activities'
import type {
  FinancialEntry,
  FinancialEntryWithRelations,
} from '@/types/financialEntry.types'
import type {
  FinancialEntryInput,
  UpdateFinancialEntryInput,
} from '@/schemas/financialEntry.schema'

const supabase = createClient()

const ENTRY_SELECT = `
  *,
  client:clients(id, type, name, company_name, trade_name),
  legal_process:legal_processes(id, cnj_number)
`

/** Controles de formulário devolvem '' quando intocados; Postgres rejeita isso
 * em colunas uuid/date. Mesmo tratamento usado em tasks.service. */
function nullifyEmpty<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    out[key] = value === '' ? null : value
  }
  return out as T
}

export async function getFinancialEntries(): Promise<FinancialEntryWithRelations[]> {
  const { data, error } = await supabase
    .from('financial_entries')
    .select(ENTRY_SELECT)
    .order('due_date', { ascending: false })

  if (error) throw error
  return data as unknown as FinancialEntryWithRelations[]
}

/**
 * Lançamentos de uma entidade.
 *
 * Mesmo vínculo em duas pontas de events/tasks: direto no processo
 * (`legal_process_id`) ou através de um dos seus cards de CRM
 * (`crm_item_id`) — ver getEventsForEntity.
 */
export async function getFinancialEntriesForEntity(params: {
  legalProcessId?: string | null
  crmItemIds?: string[]
  clientId?: string | null
}): Promise<FinancialEntryWithRelations[]> {
  const { legalProcessId, crmItemIds = [], clientId } = params

  const terms: string[] = []
  if (legalProcessId) terms.push(`legal_process_id.eq.${legalProcessId}`)
  // Guarda: `crm_item_id.in.()` é sintaxe inválida.
  if (crmItemIds.length > 0) terms.push(`crm_item_id.in.(${crmItemIds.join(',')})`)
  if (clientId) terms.push(`client_id.eq.${clientId}`)
  if (terms.length === 0) return []

  const query = supabase
    .from('financial_entries')
    .select(ENTRY_SELECT)
    .order('due_date', { ascending: false })

  const { data, error } =
    terms.length === 1 ? await query.or(terms[0]) : await query.or(terms.join(','))

  if (error) throw error
  return data as unknown as FinancialEntryWithRelations[]
}

export async function createFinancialEntry(
  input: FinancialEntryInput,
  userId: string
): Promise<FinancialEntry> {
  const { data, error } = await supabase
    .from('financial_entries')
    .insert({ ...nullifyEmpty(input), created_by: userId })
    .select(ENTRY_SELECT)
    .single()

  if (error) throw error

  await recordActivity({
    type: 'financial_entry_created',
    entity_type: 'financial_entry',
    entity_id: data.id,
    entity_title: data.description,
    actor_id: userId,
  })

  return data as unknown as FinancialEntry
}

export async function updateFinancialEntry(input: UpdateFinancialEntryInput): Promise<void> {
  const { id, ...rest } = input

  // Marcar como pago sem informar a data preenche com hoje — evita um registro
  // "pago" sem quando, que quebraria qualquer relatório por competência.
  const patch = nullifyEmpty(rest) as Record<string, unknown>
  if (patch.status === 'pago' && !patch.paid_at) {
    patch.paid_at = new Date().toISOString().slice(0, 10)
  }
  if (patch.status === 'pendente') {
    patch.paid_at = null
  }

  const { error } = await supabase.from('financial_entries').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteFinancialEntry(id: string): Promise<void> {
  const { error } = await supabase.from('financial_entries').delete().eq('id', id)
  if (error) throw error
}

export interface FinancialSummary {
  /** Recebido no mês corrente (status pago). */
  receivedThisMonth: number
  /** Despesas do mês corrente. */
  expensesThisMonth: number
  /** Receitas ainda não pagas, de qualquer data. */
  outstanding: number
  /** Receitas não pagas já vencidas — subconjunto de `outstanding`. */
  overdue: number
}

export async function getFinancialSummary(): Promise<FinancialSummary> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10)
  const today = now.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('financial_entries')
    .select('type, amount, status, due_date, paid_at')

  if (error) throw error

  const rows = (data ?? []) as {
    type: 'receita' | 'despesa'
    amount: number
    status: 'pendente' | 'pago'
    due_date: string
    paid_at: string | null
  }[]

  let receivedThisMonth = 0
  let expensesThisMonth = 0
  let outstanding = 0
  let overdue = 0

  for (const row of rows) {
    const amount = Number(row.amount)
    const isPaid = row.status === 'pago'
    // Competência: o que foi pago conta pela data de pagamento; o resto, pelo
    // vencimento.
    const reference = isPaid ? (row.paid_at ?? row.due_date) : row.due_date
    const inThisMonth = reference >= monthStart

    if (row.type === 'receita') {
      if (isPaid && inThisMonth) receivedThisMonth += amount
      if (!isPaid) {
        outstanding += amount
        if (row.due_date < today) overdue += amount
      }
    } else {
      if (inThisMonth) expensesThisMonth += amount
    }
  }

  return { receivedThisMonth, expensesThisMonth, outstanding, overdue }
}

export interface MonthlyCashFlow {
  /** 'yyyy-MM' */
  month: string
  receita: number
  despesa: number
}

/** Fluxo de caixa dos últimos N meses, agregado no cliente. */
export async function getMonthlyCashFlow(months = 6): Promise<MonthlyCashFlow[]> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
  const startStr = start.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('financial_entries')
    .select('type, amount, status, due_date, paid_at')
    .or(`due_date.gte.${startStr},paid_at.gte.${startStr}`)

  if (error) throw error

  const buckets = new Map<string, MonthlyCashFlow>()
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    buckets.set(key, { month: key, receita: 0, despesa: 0 })
  }

  for (const row of (data ?? []) as {
    type: 'receita' | 'despesa'
    amount: number
    status: string
    due_date: string
    paid_at: string | null
  }[]) {
    const reference = row.status === 'pago' ? (row.paid_at ?? row.due_date) : row.due_date
    const key = reference.slice(0, 7)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (row.type === 'receita') bucket.receita += Number(row.amount)
    else bucket.despesa += Number(row.amount)
  }

  return [...buckets.values()]
}
