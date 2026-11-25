// Server-side. O client é a service_role da rota (depois de conferir
// `financeiro`) ou do cron diário: `billing_series` não tem policy de escrita.
import type { SupabaseClient } from '@supabase/supabase-js'
import { addMonthsISO } from '@/features/financeiro/utils/installments'
import { resolveInfinitePayHandle } from '@/lib/infinitepay/handle'
import {
  BILLING_SERIES_COLUMNS,
  billingSeriesState,
  SERIES_CLIENT_DESCRIPTION_MAX,
  SERIES_DESCRIPTION_MAX,
  type BillingSeries,
  type BillingSeriesCategory,
  type BillingSeriesItem,
} from '@/types/billingSeries.types'
import { openBilling } from './billings'
import { clientDisplayName } from './entries'
import { addDaysISO, officeDateOf } from './officeTime'
import { setBillingTerms, setReminders } from './reminders'

/**
 * Mensalidades (fase 4 de docs/cobrancas.md, migration 98). Cada ciclo é um
 * lançamento com a cobrança no ar, gerado alguns dias antes do vencimento —
 * pelo cron diário e ao criar a série. Daí em diante é um lançamento comum.
 */

const UNIQUE_VIOLATION = '23505'

/** Antecedência mínima: a etapa "ao criar" e a de 7 dias antes cabem. */
export const SERIES_MIN_LEAD_DAYS = 10

/** Teto de ciclos de uma rodada: um cron parado por meses não vira rajada. */
const MAX_CYCLES_PER_RUN = 3

/** Teto da busca do próximo ciclo: 50 anos de meses. */
const MAX_CYCLE_INDEX = 600

// ── Puro ────────────────────────────────────────────────────────────────────

/**
 * Com quantos dias de antecedência o ciclo nasce: o bastante para a primeira
 * etapa da régua antes do vencimento (`office_settings.billing_reminder_offsets`).
 */
export function seriesLeadDays(offsets: readonly number[]): number {
  const earliest = Math.min(0, ...offsets)
  return Math.max(SERIES_MIN_LEAD_DAYS, -earliest)
}

/** O vencimento do ciclo `index`, sempre da âncora: 31/01 → 28/02 → 31/03. */
export function cycleDueDate(startDate: string, index: number): string {
  return addMonthsISO(startDate, index)
}

/**
 * Os vencimentos que já podem existir hoje: a partir de `generate_from`, até o
 * fim da série e até `until` (hoje + a antecedência).
 */
export function cycleDueDatesUntil(
  series: Pick<BillingSeries, 'start_date' | 'end_date' | 'generate_from'>,
  until: string,
): string[] {
  const dates: string[] = []
  for (let index = 0; index <= MAX_CYCLE_INDEX; index++) {
    const due = cycleDueDate(series.start_date, index)
    if (due > until) break
    if (series.end_date !== null && due > series.end_date) break
    if (due >= series.generate_from) dates.push(due)
  }
  return dates
}

/** O próximo vencimento que ainda não virou lançamento. */
export function nextCycleDueDate(
  series: Pick<BillingSeries, 'start_date' | 'end_date' | 'generate_from'>,
  generated: ReadonlySet<string>,
): string | null {
  for (let index = 0; index <= MAX_CYCLE_INDEX; index++) {
    const due = cycleDueDate(series.start_date, index)
    if (series.end_date !== null && due > series.end_date) return null
    if (due >= series.generate_from && !generated.has(due)) return due
  }
  return null
}

/** "12/2026" — o mês do ciclo, na descrição do lançamento e do cliente. */
export function cycleLabel(dueDate: string): string {
  return `${dueDate.slice(5, 7)}/${dueDate.slice(0, 4)}`
}

export function cycleDescriptions(
  series: Pick<BillingSeries, 'description' | 'client_description'>,
  dueDate: string,
): { description: string; clientDescription: string } {
  const label = cycleLabel(dueDate)
  return {
    description: `${series.description} — ${label}`,
    clientDescription: `${series.client_description} — ${label}`,
  }
}

// ── Geração ─────────────────────────────────────────────────────────────────

export interface CycleOutcome {
  dueDate: string
  entryId: string
  /** A cobrança não foi ao ar: o lançamento existe, sem página. */
  billingError: string | null
}

async function generatedDueDates(supabase: SupabaseClient, seriesId: string) {
  const { data, error } = await supabase
    .from('financial_entries')
    .select('due_date')
    .eq('billing_series_id', seriesId)
  if (error) throw error
  return new Set(((data ?? []) as { due_date: string | null }[]).flatMap((r) => r.due_date ?? []))
}

/** O ciclo vira lançamento; a cobrança, os lembretes e os percentuais vão junto. */
async function createCycle(
  supabase: SupabaseClient,
  series: BillingSeries,
  dueDate: string,
): Promise<CycleOutcome | null> {
  const texts = cycleDescriptions(series, dueDate)
  const { data, error } = await supabase
    .from('financial_entries')
    .insert({
      type: 'receita',
      category: series.category,
      description: texts.description,
      amount: Number(series.amount),
      status: 'pendente',
      settlement_kind: 'scheduled',
      due_date: dueDate,
      client_id: series.client_id,
      legal_process_id: series.legal_process_id,
      contract_id: series.contract_id,
      billing_series_id: series.id,
      created_by: series.created_by,
    })
    .select('id')
    .single()
  // Outra rodada gerou este mês primeiro (índice único da migration 98).
  if (error?.code === UNIQUE_VIOLATION) return null
  if (error) throw error
  const entryId = (data as { id: string }).id

  const opened = await openBilling(supabase, {
    entryId,
    userId: series.created_by,
    clientDescription: texts.clientDescription,
  })
  if (!opened.ok) return { dueDate, entryId, billingError: opened.error }

  // Os percentuais da série valem sobre os que a cobrança copiou do contrato.
  const terms = await setBillingTerms(supabase, {
    entryId,
    terms: {
      lateFeePercent: series.late_fee_percent === null ? null : Number(series.late_fee_percent),
      monthlyInterestPercent:
        series.monthly_interest_percent === null ? null : Number(series.monthly_interest_percent),
      pixDiscountPercent:
        series.pix_discount_percent === null ? null : Number(series.pix_discount_percent),
    },
  })
  if (!terms.ok) return { dueDate, entryId, billingError: terms.error }

  if (series.reminders_enabled) {
    const reminders = await setReminders(supabase, { entryId, enabled: true })
    if (!reminders.ok) return { dueDate, entryId, billingError: reminders.error }
  }
  return { dueDate, entryId, billingError: null }
}

/**
 * Gera os ciclos que já podem existir. Idempotente pelo índice único: rodar
 * de novo no mesmo dia não cria nada. Série pausada ou encerrada não gera.
 */
export async function generateSeriesCycles(
  supabase: SupabaseClient,
  series: BillingSeries,
  input: { today: string; leadDays: number },
): Promise<CycleOutcome[]> {
  if (billingSeriesState(series, input.today) !== 'active') return []
  const until = addDaysISO(input.today, input.leadDays)
  const generated = await generatedDueDates(supabase, series.id)
  const pending = cycleDueDatesUntil(series, until)
    .filter((due) => !generated.has(due))
    .slice(0, MAX_CYCLES_PER_RUN)

  const outcomes: CycleOutcome[] = []
  for (const dueDate of pending) {
    const outcome = await createCycle(supabase, series, dueDate)
    if (outcome) outcomes.push(outcome)
  }
  return outcomes
}

export interface SeriesRoutineSummary {
  generated: number
  billingFailures: number
}

/** O passo das mensalidades no cron diário, antes da régua: o ciclo que nasce
 * hoje já entra na fila de hoje. */
export async function runSeriesRoutine(
  supabase: SupabaseClient,
  input: { now: Date; offsets: readonly number[] },
): Promise<SeriesRoutineSummary> {
  const today = officeDateOf(input.now)
  const { data, error } = await supabase
    .from('billing_series')
    .select(BILLING_SERIES_COLUMNS)
    .is('ended_at', null)
    .is('paused_at', null)
  if (error) throw error

  const summary: SeriesRoutineSummary = { generated: 0, billingFailures: 0 }
  for (const series of (data ?? []) as unknown as BillingSeries[]) {
    const outcomes = await generateSeriesCycles(supabase, series, {
      today,
      leadDays: seriesLeadDays(input.offsets),
    })
    summary.generated += outcomes.length
    for (const outcome of outcomes.filter((o) => o.billingError)) {
      summary.billingFailures++
      await notifyBillingFailure(supabase, series, outcome)
    }
  }
  return summary
}

async function notifyBillingFailure(
  supabase: SupabaseClient,
  series: BillingSeries,
  outcome: CycleOutcome,
) {
  const { error } = await supabase.from('notifications').insert({
    kind: 'cobranca_mensalidade_sem_cobranca',
    resource: 'financeiro',
    title: 'Mensalidade gerada sem cobrança',
    body:
      `O lançamento de ${cycleLabel(outcome.dueDate)} de "${series.description}" foi criado, mas ` +
      `a cobrança não foi ao ar: ${outcome.billingError} Abra o lançamento e gere o link.`,
    link: `/financeiro?id=${outcome.entryId}`,
    entity_type: 'financial_entry',
    entity_id: outcome.entryId,
    source: 'cron',
  })
  if (error) throw error
}

// ── Comandos ────────────────────────────────────────────────────────────────

export type SeriesResult =
  | { ok: true; series: BillingSeries; outcomes?: CycleOutcome[] }
  | { ok: false; status: number; error: string; code: string | null }

function failure(status: number, error: string, code: string | null = null): SeriesResult {
  return { ok: false, status, error, code }
}

export interface SeriesInput {
  clientId: string
  legalProcessId: string | null
  contractId: string | null
  description: string
  clientDescription: string
  category: BillingSeriesCategory
  amount: number
  startDate: string
  endDate: string | null
  remindersEnabled: boolean
  lateFeePercent: number | null
  monthlyInterestPercent: number | null
  pixDiscountPercent: number | null
}

function validateTexts(description: string, clientDescription: string): SeriesResult | null {
  if (!description.trim() || description.trim().length > SERIES_DESCRIPTION_MAX) {
    return failure(422, 'Descreva a mensalidade (até 250 caracteres).', 'invalid_description')
  }
  const forClient = clientDescription.trim()
  if (!forClient || forClient.length > SERIES_CLIENT_DESCRIPTION_MAX) {
    return failure(
      422,
      'A descrição para o cliente precisa de 1 a 110 caracteres.',
      'invalid_client_description',
    )
  }
  return null
}

async function loadSeries(supabase: SupabaseClient, id: string): Promise<BillingSeries | null> {
  const { data, error } = await supabase
    .from('billing_series')
    .select(BILLING_SERIES_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as BillingSeries | null) ?? null
}

/**
 * Cria a mensalidade e já gera o que estiver dentro da antecedência — quem
 * cria vê o primeiro ciclo na hora. O primeiro vencimento é hoje ou depois:
 * ciclos passados não são cobrados de uma vez.
 */
export async function createSeries(
  supabase: SupabaseClient,
  input: { data: SeriesInput; userId: string; now?: Date; offsets: readonly number[] },
): Promise<SeriesResult> {
  const now = input.now ?? new Date()
  const today = officeDateOf(now)
  const data = input.data

  const invalid = validateTexts(data.description, data.clientDescription)
  if (invalid) return invalid
  if (data.startDate < today) {
    return failure(422, 'O primeiro vencimento é hoje ou depois.', 'start_in_past')
  }
  if (data.endDate !== null && data.endDate < data.startDate) {
    return failure(422, 'O fim vem depois do primeiro vencimento.', 'end_before_start')
  }
  if (!(await resolveInfinitePayHandle(supabase))) {
    return failure(
      409,
      'A conta da InfinitePay não está configurada (Configurações → Pagamentos).',
      'handle_missing',
    )
  }

  const { data: created, error } = await supabase
    .from('billing_series')
    .insert({
      client_id: data.clientId,
      legal_process_id: data.legalProcessId,
      contract_id: data.contractId,
      description: data.description.trim(),
      client_description: data.clientDescription.trim(),
      category: data.category,
      amount: data.amount,
      start_date: data.startDate,
      end_date: data.endDate,
      generate_from: data.startDate,
      reminders_enabled: data.remindersEnabled,
      late_fee_percent: data.lateFeePercent || null,
      monthly_interest_percent: data.monthlyInterestPercent || null,
      pix_discount_percent: data.pixDiscountPercent || null,
      created_by: input.userId,
    })
    .select(BILLING_SERIES_COLUMNS)
    .single()
  if (error) throw error
  const series = created as unknown as BillingSeries

  const outcomes = await generateSeriesCycles(supabase, series, {
    today,
    leadDays: seriesLeadDays(input.offsets),
  })
  return { ok: true, series, outcomes }
}

export interface SeriesChanges {
  description?: string
  clientDescription?: string
  amount?: number
  endDate?: string | null
  remindersEnabled?: boolean
  lateFeePercent?: number | null
  monthlyInterestPercent?: number | null
  pixDiscountPercent?: number | null
}

/** Vale para os próximos ciclos: os já gerados são lançamentos e não mudam. */
export async function updateSeries(
  supabase: SupabaseClient,
  input: { id: string; changes: SeriesChanges },
): Promise<SeriesResult> {
  const series = await loadSeries(supabase, input.id)
  if (!series) return failure(404, 'Mensalidade não encontrada.')
  if (series.ended_at) return failure(409, 'Esta mensalidade está encerrada.', 'ended')

  const changes = input.changes
  const invalid = validateTexts(
    changes.description ?? series.description,
    changes.clientDescription ?? series.client_description,
  )
  if (invalid) return invalid
  if (changes.endDate && changes.endDate < series.start_date) {
    return failure(422, 'O fim vem depois do primeiro vencimento.', 'end_before_start')
  }
  const orNull = (value: number | null) => (value === null || value === 0 ? null : value)

  const { data, error } = await supabase
    .from('billing_series')
    .update({
      ...(changes.description !== undefined ? { description: changes.description.trim() } : {}),
      ...(changes.clientDescription !== undefined
        ? { client_description: changes.clientDescription.trim() }
        : {}),
      ...(changes.amount !== undefined ? { amount: changes.amount } : {}),
      ...(changes.endDate !== undefined ? { end_date: changes.endDate } : {}),
      ...(changes.remindersEnabled !== undefined
        ? { reminders_enabled: changes.remindersEnabled }
        : {}),
      ...(changes.lateFeePercent !== undefined
        ? { late_fee_percent: orNull(changes.lateFeePercent) }
        : {}),
      ...(changes.monthlyInterestPercent !== undefined
        ? { monthly_interest_percent: orNull(changes.monthlyInterestPercent) }
        : {}),
      ...(changes.pixDiscountPercent !== undefined
        ? { pix_discount_percent: orNull(changes.pixDiscountPercent) }
        : {}),
    })
    .eq('id', series.id)
    .select(BILLING_SERIES_COLUMNS)
    .single()
  if (error) throw error
  return { ok: true, series: data as unknown as BillingSeries }
}

/**
 * Pausar para de gerar; retomar volta a gerar a partir de hoje — os meses da
 * pausa não são cobrados depois. Encerrar é definitivo: os ciclos já gerados
 * continuam no Financeiro, com as cobranças deles.
 */
export async function setSeriesState(
  supabase: SupabaseClient,
  input: {
    id: string
    action: 'pause' | 'resume' | 'end'
    userId: string
    now?: Date
    offsets: readonly number[]
  },
): Promise<SeriesResult> {
  const series = await loadSeries(supabase, input.id)
  if (!series) return failure(404, 'Mensalidade não encontrada.')
  if (series.ended_at) return failure(409, 'Esta mensalidade está encerrada.', 'ended')
  const now = input.now ?? new Date()
  const today = officeDateOf(now)

  let patch: Record<string, unknown>
  if (input.action === 'pause') {
    if (series.paused_at) return { ok: true, series }
    patch = { paused_at: now.toISOString() }
  } else if (input.action === 'resume') {
    if (!series.paused_at) return { ok: true, series }
    patch = {
      paused_at: null,
      generate_from: today > series.generate_from ? today : series.generate_from,
    }
  } else {
    patch = { ended_at: now.toISOString(), ended_by: input.userId }
  }

  const { data, error } = await supabase
    .from('billing_series')
    .update(patch)
    .eq('id', series.id)
    .select(BILLING_SERIES_COLUMNS)
    .single()
  if (error) throw error
  const updated = data as unknown as BillingSeries

  // Retomar já gera o que couber na antecedência, como criar.
  const outcomes =
    input.action === 'resume'
      ? await generateSeriesCycles(supabase, updated, {
          today,
          leadDays: seriesLeadDays(input.offsets),
        })
      : undefined
  return { ok: true, series: updated, outcomes }
}

// ── Lista ───────────────────────────────────────────────────────────────────

interface SeriesRow extends BillingSeries {
  client: {
    type: 'individual' | 'company'
    name: string | null
    company_name: string | null
    trade_name: string | null
  } | null
  entries: { due_date: string | null }[] | null
}

export async function listSeries(
  supabase: SupabaseClient,
  input: { now?: Date } = {},
): Promise<BillingSeriesItem[]> {
  const today = officeDateOf(input.now ?? new Date())
  const { data, error } = await supabase
    .from('billing_series')
    .select(
      `${BILLING_SERIES_COLUMNS},
       client:clients(type, name, company_name, trade_name),
       entries:financial_entries(due_date)`,
    )
    .order('created_at', { ascending: false })
  if (error) throw error

  return ((data ?? []) as unknown as SeriesRow[]).map(({ client, entries, ...series }) => {
    const generated = new Set((entries ?? []).flatMap((e) => e.due_date ?? []))
    const sorted = [...generated].sort()
    const state = billingSeriesState(series, today)
    return {
      series,
      clientName: clientDisplayName(client),
      state,
      nextDueDate: state === 'ended' ? null : nextCycleDueDate(series, generated),
      generatedCount: generated.size,
      lastGeneratedDueDate: sorted.at(-1) ?? null,
    }
  })
}
