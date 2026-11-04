import {
  estimatedFee,
  feeFromBase,
  getSuccessFeeStage,
  todayISO,
  type FinancialEntry,
  type FinancialEntryStatus,
  type FinancialSettlementKind,
  type SuccessFeeStage,
} from '@/types/financialEntry.types'
import type { FinancialEntryInput } from '@/schemas/financialEntry.schema'
import { splitInstallments } from './installments'

/**
 * Assessing a success fee (docs/financeiro.md → "Apurar"): the base becomes
 * known, and the fee is received, falls due, is split, or still waits on a
 * condition — now with an amount. "Foi só uma parte" keeps the success fee
 * open for the rest: an agreement paid in installments, an RPV now and a
 * precatório later.
 */

/** How "Registrar êxito" opens the form: a success fee to assess, with the
 * percentage still to type. */
export const SUCCESS_FEE_FORM_DEFAULTS = {
  type: 'receita',
  category: 'exito',
  description: 'Honorários de êxito',
  amount: 0,
  status: 'pendente',
  settlement_kind: 'conditional',
  due_date: '',
  condition_description: 'No êxito da ação',
  base_description: 'o proveito econômico',
} as const satisfies Partial<FinancialEntryInput>

export type AssessmentMode = 'recebido' | 'vencimento' | 'parcelado' | 'aguardando'

export const ASSESSMENT_MODE_LABELS: Record<AssessmentMode, string> = {
  recebido: 'Já recebido',
  vencimento: 'Com vencimento',
  parcelado: 'Parcelado',
  aguardando: 'Valor definido, ainda aguardando',
}

export interface AssessmentPlan {
  baseAmount: number | undefined
  /** The fee when typed by hand; otherwise base × percent. */
  feeOverride: number | undefined
  mode: AssessmentMode
  /** Paid on, due on, the first installment, or the forecast — per mode.
   * '' when not filled. */
  date: string
  installments: number
  /** For 'aguardando': what still has to happen. */
  condition: string
  /** New entries, and the success fee stays to assess for the rest. */
  partial: boolean
  /** The part's name when `partial`. */
  partDescription: string
}

/** One entry the assessment writes — the shape `assess_success_fee` reads. */
export interface AssessmentRow {
  description: string
  amount: number
  base_amount: number
  settlement_kind: FinancialSettlementKind
  due_date: string | null
  condition_description: string | null
  status: FinancialEntryStatus
  paid_at: string | null
}

type AssessedEntry = Pick<FinancialEntry, 'description' | 'percent'>

/** The fee the plan charges: typed, or the percentage of the base. */
export function assessmentFee(entry: AssessedEntry, plan: AssessmentPlan): number {
  if (plan.feeOverride !== undefined) return plan.feeOverride
  if (plan.baseAmount === undefined || entry.percent === null) return 0
  return feeFromBase(plan.baseAmount, entry.percent)
}

const MAX_INSTALLMENTS = 120

/** What stops the plan from being saved, in the words the dialog shows. */
export function assessmentError(entry: AssessedEntry, plan: AssessmentPlan): string | null {
  if (!(plan.baseAmount !== undefined && plan.baseAmount > 0)) return 'Informe o valor da base.'
  if (!(assessmentFee(entry, plan) > 0)) return 'O honorário precisa ser maior que zero.'
  if (plan.partial && !plan.partDescription.trim()) return 'Dê um nome para esta parte.'
  switch (plan.mode) {
    case 'recebido':
      return plan.date ? null : 'Informe quando foi recebido.'
    case 'vencimento':
      return plan.date ? null : 'Informe o vencimento.'
    case 'parcelado':
      if (!(plan.installments >= 2 && plan.installments <= MAX_INSTALLMENTS)) {
        return `Parcelado: de 2 a ${MAX_INSTALLMENTS} parcelas.`
      }
      return plan.date ? null : 'Informe o vencimento da 1ª parcela.'
    case 'aguardando':
      return plan.condition.trim() ? null : 'Diga o que ainda falta acontecer.'
  }
}

/** The entries the plan writes, in order: without `partial`, the first one is
 * the success fee itself. Only call it for a plan with no error. */
export function buildAssessmentRows(
  entry: AssessedEntry,
  plan: AssessmentPlan
): AssessmentRow[] {
  const fee = assessmentFee(entry, plan)
  const base = plan.baseAmount ?? 0
  const description = (plan.partial ? plan.partDescription : entry.description).trim()

  switch (plan.mode) {
    case 'recebido':
      return [
        {
          description,
          amount: fee,
          base_amount: base,
          settlement_kind: 'scheduled',
          due_date: plan.date,
          condition_description: null,
          status: 'pago',
          paid_at: plan.date,
        },
      ]
    case 'vencimento':
      return [
        {
          description,
          amount: fee,
          base_amount: base,
          settlement_kind: 'scheduled',
          due_date: plan.date,
          condition_description: null,
          status: 'pendente',
          paid_at: null,
        },
      ]
    case 'parcelado': {
      const installments = splitInstallments(fee, plan.installments, plan.date)
      return installments.map((installment, index) => ({
        description: `${description} — parcela ${index + 1}/${installments.length}`.slice(0, 300),
        amount: installment.amount,
        base_amount: base,
        settlement_kind: 'scheduled',
        due_date: installment.due_date,
        condition_description: null,
        status: 'pendente',
        paid_at: null,
      }))
    }
    case 'aguardando':
      return [
        {
          description,
          amount: fee,
          base_amount: base,
          settlement_kind: 'conditional',
          due_date: plan.date || null,
          condition_description: plan.condition.trim(),
          status: 'pendente',
          paid_at: null,
        },
      ]
  }
}

// ── The Êxitos tab ──────────────────────────────────────────────────────────

/** The tab's cards. "A receber" joins the two dated stages, as the bucket of
 * the same name does on the other tab. */
export type SuccessFeeFilter = 'a_apurar' | 'aguardando' | 'a_receber' | 'recebido'

export function matchesSuccessFeeFilter(
  stage: SuccessFeeStage,
  filter: SuccessFeeFilter
): boolean {
  return filter === 'a_receber' ? stage === 'a_vencer' || stage === 'vencido' : stage === filter
}

export interface SuccessFeeTotals {
  /** Count, the fee the estimates would yield, and how many have none. */
  toAssess: { count: number; estimate: number; withoutEstimate: number }
  /** Amount known, still waiting on a condition. */
  awaiting: { count: number; amount: number }
  /** With a due date; `overdue` is part of `amount`. */
  receivable: { count: number; amount: number; overdue: number }
  received: { count: number; amount: number }
}

type SuccessFeeRow = Pick<
  FinancialEntry,
  | 'amount'
  | 'status'
  | 'settlement_kind'
  | 'due_date'
  | 'percent'
  | 'base_amount'
  | 'estimated_base_amount'
>

/** The portfolio, every date: a success fee to assess has none. The
 * estimate stays apart from every amount — never part of "A receber". */
export function summarizeSuccessFees(
  entries: SuccessFeeRow[],
  today: string = todayISO()
): SuccessFeeTotals {
  const totals: SuccessFeeTotals = {
    toAssess: { count: 0, estimate: 0, withoutEstimate: 0 },
    awaiting: { count: 0, amount: 0 },
    receivable: { count: 0, amount: 0, overdue: 0 },
    received: { count: 0, amount: 0 },
  }
  for (const entry of entries) {
    const amount = Number(entry.amount)
    switch (getSuccessFeeStage(entry, today)) {
      case 'a_apurar': {
        const estimate = estimatedFee(entry)
        totals.toAssess.count += 1
        if (estimate === null) totals.toAssess.withoutEstimate += 1
        else totals.toAssess.estimate += estimate
        break
      }
      case 'aguardando':
        totals.awaiting.count += 1
        totals.awaiting.amount += amount
        break
      case 'vencido':
        totals.receivable.overdue += amount
        totals.receivable.count += 1
        totals.receivable.amount += amount
        break
      case 'a_vencer':
        totals.receivable.count += 1
        totals.receivable.amount += amount
        break
      case 'recebido':
        totals.received.count += 1
        totals.received.amount += amount
        break
    }
  }
  return totals
}
