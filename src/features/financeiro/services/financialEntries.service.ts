import { createClient } from '@/lib/supabase/client'
import { recordActivity } from '@/lib/activities'
import {
  getFinancialEntryFilePaths,
  removeDocumentFiles,
  uploadDocument,
} from '@/features/documentos/services/documents.service'
import type { PendingAttachments } from '@/types/document.types'
import {
  getCashFlowDate,
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
import { isWithinPeriod, presetRange } from '../utils/periods'
import type { AssessmentRow } from '../utils/successFees'
import {
  bucketCashFlow,
  summarizeEntries,
  type CashFlowResult,
  type CashFlowRow,
  type TotalsRow,
} from '../utils/summarizeEntries'

const supabase = createClient()

const ENTRY_SELECT = `
  *,
  client:clients(id, type, name, company_name, trade_name),
  legal_process:legal_processes(id, cnj_number),
  documents(id),
  payment_charges(id, status)
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

/** Um lançamento pelo id, com cliente e processo. */
export async function getFinancialEntryById(id: string): Promise<FinancialEntryWithRelations | null> {
  const { data, error } = await supabase
    .from('financial_entries')
    .select(ENTRY_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return (data as unknown as FinancialEntryWithRelations | null) ?? null
}

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
  contractId?: string | null
}): Promise<FinancialEntryWithRelations[]> {
  const { legalProcessId, crmItemIds = [], clientId, contractId } = params

  const terms: string[] = []
  if (legalProcessId) terms.push(`legal_process_id.eq.${legalProcessId}`)
  // Guarda: `crm_item_id.in.()` é sintaxe inválida.
  if (crmItemIds.length > 0) terms.push(`crm_item_id.in.(${crmItemIds.join(',')})`)
  if (clientId) terms.push(`client_id.eq.${clientId}`)
  if (contractId) terms.push(`contract_id.eq.${contractId}`)
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

/**
 * The percentage fields go together (migration 89): no percentage, no base;
 * a percentage with no base value is to assess, at R$ 0 (the form sets the
 * status and the settlement itself, and the CHECK guards them). Only when the
 * patch carries `percent` — a quick status toggle leaves them be.
 */
function reconcilePercentFields(patch: Record<string, unknown>): void {
  if (!('percent' in patch)) return
  if (patch.percent === null || patch.percent === undefined) {
    patch.percent = null
    patch.base_description = null
    patch.base_amount = null
    patch.estimated_base_amount = null
  } else if (patch.base_amount === null || patch.base_amount === undefined) {
    patch.base_amount = null
    patch.amount = 0
  } else {
    // Assessed: the estimate no longer says anything.
    patch.estimated_base_amount = null
  }
}

export async function createFinancialEntry(
  input: FinancialEntryInput,
  userId: string
): Promise<FinancialEntry> {
  const payload = nullifyEmpty(input) as Record<string, unknown>
  reconcileSettlementFields(payload)
  reconcilePercentFields(payload)

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

/**
 * Vários lançamentos de uma vez — as parcelas de um contrato. Um insert só:
 * ou entram todos, ou nenhum, e a prévia pode ser confirmada de novo.
 */
export async function createFinancialEntries(
  inputs: FinancialEntryInput[],
  userId: string
): Promise<FinancialEntry[]> {
  if (inputs.length === 0) return []
  const rows = inputs.map((input) => {
    const payload = nullifyEmpty(input) as Record<string, unknown>
    reconcileSettlementFields(payload)
    reconcilePercentFields(payload)
    return { ...payload, created_by: userId }
  })

  const { data, error } = await supabase.from('financial_entries').insert(rows).select('*')
  if (error) throw error

  const created = data as unknown as FinancialEntry[]
  await Promise.all(
    created.map((entry) =>
      recordActivity({
        type: 'financial_entry_created',
        entity_type: 'financial_entry',
        entity_id: entry.id,
        entity_title: entry.description,
        actor_id: userId,
      })
    )
  )
  return created
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
  reconcilePercentFields(patch)

  const { error } = await supabase.from('financial_entries').update(patch).eq('id', id)
  if (error) throw error
}

/**
 * Sobe os arquivos escolhidos no formulário, depois de o lançamento existir.
 * Um arquivo que falha não derruba os outros — devolve quantos falharam, e o
 * lançamento continua salvo. Mesmo desenho de attachFilesToEvent.
 */
export async function attachFilesToFinancialEntry(
  financialEntryId: string,
  { files, category }: PendingAttachments,
  userId: string
): Promise<number> {
  if (files.length === 0) return 0
  const results = await Promise.allSettled(
    files.map((file) =>
      uploadDocument({ category, financial_entry_id: financialEntryId }, file, userId)
    )
  )
  return results.filter((result) => result.status === 'rejected').length
}

/**
 * Exclui o lançamento e os anexos dele.
 *
 * As linhas dos anexos saem pelo cascade (migration 63); os arquivos no bucket,
 * não. Por isso os caminhos são lidos antes — e os arquivos só saem se o
 * lançamento saiu mesmo: RLS negando não gera erro, só "0 linhas".
 */
export async function deleteFinancialEntry(id: string): Promise<void> {
  const filePaths = await getFinancialEntryFilePaths(id)

  const { data, error } = await supabase
    .from('financial_entries')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error

  if (data.length > 0) await removeDocumentFiles(filePaths)
}

// ── Apurar um êxito ─────────────────────────────────────────────────────────

/** PostgREST hands a `setof uuid` back as plain values; an object per row is
 * accepted too, so a change on its side does not lose the ids. */
function idsFromRpc(data: unknown): string[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((item: unknown) => {
    if (typeof item === 'string') return [item]
    if (typeof item === 'object' && item !== null) {
      const value = (item as Record<string, unknown>).assess_success_fee
      return typeof value === 'string' ? [value] : []
    }
    return []
  })
}

/**
 * Assesses a success fee in one transaction (`assess_success_fee`, migration
 * 89). Without `keepOpen`, the first row becomes the success fee itself —
 * same id, attachments and history — and the rest are new installments; with
 * it ("foi só uma parte"), every row is new and the success fee stays to
 * assess. Returns the ids in row order.
 */
export async function assessSuccessFee(
  entryId: string,
  rows: AssessmentRow[],
  keepOpen: boolean,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase.rpc('assess_success_fee', {
    p_entry_id: entryId,
    p_rows: rows,
    p_keep_open: keepOpen,
  })
  if (error) throw error

  const ids = idsFromRpc(data)
  // What was born here enters the activity feed like any new entry.
  const firstNew = keepOpen ? 0 : 1
  await Promise.all(
    ids.slice(firstNew).map((id, index) =>
      recordActivity({
        type: 'financial_entry_created',
        entity_type: 'financial_entry',
        entity_id: id,
        entity_title: rows[firstNew + index]?.description ?? 'Êxito',
        actor_id: userId,
      })
    )
  )
  return ids
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
  /**
   * A parte do recebido no mês que entrou por link da InfinitePay: as MESMAS
   * linhas de `receivedThisMonth`, as que têm uma cobrança `paid`. Valor do
   * lançamento (bruto, decisão 5 da integração), não o que o cliente pagou com
   * juros — assim os dois números nunca discordam.
   */
  receivedViaInfinitePay: number
  receivedViaInfinitePayCount: number
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

const AGGREGATE_SELECT = 'type, amount, status, settlement_kind, due_date, paid_at'

/** O resumo precisa saber se a baixa veio de um link — o fluxo de caixa, não. */
const SUMMARY_SELECT = `${AGGREGATE_SELECT}, payment_charges(status)`

/**
 * The dashboard's month (received, expenses) and everything still open
 * (receivable), summed by `summarizeEntries` — the same sums the Financeiro
 * screen shows for its period, so the two screens cannot disagree.
 */
export async function getFinancialSummary(): Promise<FinancialSummary> {
  const today = todayISO()
  // The whole month, upper bound included: without it a December due date
  // already counted in August's "Despesas do mês".
  const month = presetRange('mes', today)

  const { data, error } = await supabase.from('financial_entries').select(SUMMARY_SELECT)

  if (error) throw error

  const rows = (data ?? []) as unknown as TotalsRow[]
  const thisMonth = summarizeEntries(
    rows.filter((row) => isWithinPeriod(getCashFlowDate(row), month)),
    today
  )
  const { receivable } = summarizeEntries(rows, today)

  return {
    receivedThisMonth: thisMonth.received,
    receivedViaInfinitePay: thisMonth.receivedViaInfinitePay,
    receivedViaInfinitePayCount: thisMonth.receivedViaInfinitePayCount,
    expensesThisMonth: thisMonth.expenses,
    receivableTotal: receivable.total,
    receivableUpcoming: receivable.upcoming,
    receivableOverdue: receivable.overdue,
    receivableConditional: receivable.conditional,
    receivableConditionalCount: receivable.conditionalCount,
  }
}

/** Cash flow of the last N months, grouped by `bucketCashFlow` — the same
 * grouping as the chart on the Financeiro screen. */
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

  return bucketCashFlow((data ?? []) as CashFlowRow[], months, now)
}
