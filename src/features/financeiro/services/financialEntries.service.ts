import { createClient } from '@/lib/supabase/client'
import { recordActivity } from '@/lib/activities'
import {
  getFinancialSituation,
  toISODate,
  todayISO,
  type FinancialEntry,
  type FinancialEntryWithRelations,
  type FinancialSettlementKind,
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

/** Lançamentos sem data vão para o topo: uma condição especial em aberto é o
 * caso mais distante de resolver, e a lista é ordenada do mais futuro para o
 * mais antigo. Explícito porque depender do default do Postgres para DESC
 * (nulls first) seria depender de algo que ninguém lê no código. */
const DUE_DATE_ORDER = { ascending: false, nullsFirst: true } as const

export async function getFinancialEntries(): Promise<FinancialEntryWithRelations[]> {
  const { data, error } = await supabase
    .from('financial_entries')
    .select(ENTRY_SELECT)
    .order('due_date', DUE_DATE_ORDER)

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
    .order('due_date', DUE_DATE_ORDER)

  const { data, error } =
    terms.length === 1 ? await query.or(terms[0]) : await query.or(terms.join(','))

  if (error) throw error
  return data as unknown as FinancialEntryWithRelations[]
}

/**
 * Campos que só fazem sentido em uma das formas de liquidação. Sem isto, um
 * lançamento que deixa de ser condição especial guardaria para sempre a
 * condição antiga — invisível na tela, mas presente no dado.
 */
function reconcileSettlementFields(patch: Record<string, unknown>): void {
  const kind = patch.settlement_kind as FinancialSettlementKind | undefined
  if (kind === 'scheduled') patch.condition_description = null
}

export async function createFinancialEntry(
  input: FinancialEntryInput,
  userId: string
): Promise<FinancialEntry> {
  const payload = nullifyEmpty(input) as Record<string, unknown>
  reconcileSettlementFields(payload)

  const { data, error } = await supabase
    .from('financial_entries')
    .insert({ ...payload, created_by: userId })
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
    patch.paid_at = todayISO()
  }
  if (patch.status === 'pendente') {
    patch.paid_at = null
  }
  reconcileSettlementFields(patch)

  const { error } = await supabase.from('financial_entries').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteFinancialEntry(id: string): Promise<void> {
  const { error } = await supabase.from('financial_entries').delete().eq('id', id)
  if (error) throw error
}

// ── Agregados ───────────────────────────────────────────────────────────────

/**
 * Os indicadores da tela. A relação que os liga:
 *
 *     receivableTotal = receivableUpcoming + receivableOverdue + receivableConditional
 *
 * Os três buckets saem de `getFinancialSituation`, a mesma função que pinta o
 * badge de cada linha — é o que impede o card e a tabela de discordarem.
 */
export interface FinancialSummary {
  /** Recebido no mês corrente (status pago). */
  receivedThisMonth: number
  /** Despesas do mês corrente. */
  expensesThisMonth: number
  /** A receber — TUDO: receitas não pagas, com ou sem data. */
  receivableTotal: number
  /** Com vencimento, ainda no prazo. */
  receivableUpcoming: number
  /** Com vencimento, já passado. */
  receivableOverdue: number
  /** Depende de uma condição, não de uma data. */
  receivableConditional: number
  /** Quantidade em condição especial — o valor sozinho não diz se é 1 ou 12. */
  receivableConditionalCount: number
}

type AggregateRow = Pick<
  FinancialEntry,
  'type' | 'amount' | 'status' | 'settlement_kind' | 'due_date' | 'paid_at'
>

const AGGREGATE_SELECT = 'type, amount, status, settlement_kind, due_date, paid_at'

/**
 * Data que joga o lançamento num mês: o que foi pago conta pelo pagamento, o
 * resto pelo vencimento. `null` para o que ainda não tem quando — condição
 * especial sem previsão.
 */
function referenceDate(row: AggregateRow): string | null {
  return row.status === 'pago' ? (row.paid_at ?? row.due_date) : row.due_date
}

export async function getFinancialSummary(): Promise<FinancialSummary> {
  const now = new Date()
  const monthStart = toISODate(new Date(now.getFullYear(), now.getMonth(), 1))
  // Dia 0 do mês seguinte = último dia deste mês. Sem este limite superior, um
  // vencimento de dezembro já entrava em "Despesas do mês" em agosto.
  const monthEnd = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  const today = todayISO()

  const { data, error } = await supabase.from('financial_entries').select(AGGREGATE_SELECT)

  if (error) throw error

  const summary: FinancialSummary = {
    receivedThisMonth: 0,
    expensesThisMonth: 0,
    receivableTotal: 0,
    receivableUpcoming: 0,
    receivableOverdue: 0,
    receivableConditional: 0,
    receivableConditionalCount: 0,
  }

  for (const row of (data ?? []) as AggregateRow[]) {
    const amount = Number(row.amount)
    const reference = referenceDate(row)
    const inThisMonth = reference !== null && reference >= monthStart && reference <= monthEnd

    if (row.type === 'despesa') {
      if (inThisMonth) summary.expensesThisMonth += amount
      continue
    }

    switch (getFinancialSituation(row, today)) {
      case 'pago':
        if (inThisMonth) summary.receivedThisMonth += amount
        break
      case 'a_vencer':
        summary.receivableUpcoming += amount
        summary.receivableTotal += amount
        break
      case 'vencido':
        summary.receivableOverdue += amount
        summary.receivableTotal += amount
        break
      case 'condicao_especial':
        summary.receivableConditional += amount
        summary.receivableConditionalCount += 1
        summary.receivableTotal += amount
        break
    }
  }

  return summary
}

export interface MonthlyCashFlow {
  /** 'yyyy-MM' */
  month: string
  receita: number
  despesa: number
}

export interface CashFlowResult {
  months: MonthlyCashFlow[]
  /** O que não cabe em mês nenhum: condição especial sem previsão de data. */
  undated: { receita: number; despesa: number; count: number }
}

/** Fluxo de caixa dos últimos N meses, agregado no cliente. */
export async function getMonthlyCashFlow(months = 6): Promise<CashFlowResult> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
  const startStr = toISODate(start)

  const { data, error } = await supabase
    .from('financial_entries')
    .select(AGGREGATE_SELECT)
    // ⚠️ `due_date.is.null` é obrigatório aqui: `gte` contra NULL é falso, então
    // sem este termo os lançamentos sem data sumiriam da consulta — e a coluna
    // "Sem data" viria zerada, sem nenhum erro para denunciar.
    .or(`due_date.gte.${startStr},paid_at.gte.${startStr},due_date.is.null`)

  if (error) throw error

  const buckets = new Map<string, MonthlyCashFlow>()
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1)
    buckets.set(toISODate(d).slice(0, 7), {
      month: toISODate(d).slice(0, 7),
      receita: 0,
      despesa: 0,
    })
  }

  const undated: CashFlowResult['undated'] = { receita: 0, despesa: 0, count: 0 }

  for (const row of (data ?? []) as AggregateRow[]) {
    const amount = Number(row.amount)
    const reference = referenceDate(row)

    // Sem quando: entra na coluna própria em vez de sumir.
    if (reference === null) {
      undated.count += 1
      if (row.type === 'receita') undated.receita += amount
      else undated.despesa += amount
      continue
    }

    const bucket = buckets.get(reference.slice(0, 7))
    if (!bucket) continue
    if (row.type === 'receita') bucket.receita += amount
    else bucket.despesa += amount
  }

  return { months: [...buckets.values()], undated }
}
