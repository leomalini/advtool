import {
  getCashFlowDate,
  getFinancialSituation,
  toISODate,
  todayISO,
  type FinancialEntry,
  type FinancialEntryType,
} from '@/types/financialEntry.types'
import { summarizePaymentCharges, type PaymentChargeSummary } from '@/types/paymentCharge.types'
import { isAllDates, type PeriodRange } from './periods'

/**
 * Sums over a set of entries. The caller picks the set — the dashboard's
 * month, the period on the Financeiro screen — and the numbers come from
 * here, through the same `getFinancialSituation` that paints each row's
 * badge. That is what keeps a card and the table from disagreeing.
 */

/** The least an entry needs to be summed. */
export type TotalsRow = Pick<
  FinancialEntry,
  'type' | 'amount' | 'status' | 'settlement_kind' | 'due_date' | 'paid_at'
> & {
  /** Only to tell a payment by InfinitePay link apart. */
  payment_charges?: Pick<PaymentChargeSummary, 'status'>[] | null
}

/**
 * What is still open on one side, in the three parts of the taxonomy:
 *
 *     total = upcoming + overdue + conditional
 */
export interface OpenTotals {
  total: number
  /** With a due date, still on time. */
  upcoming: number
  /** With a due date that passed. */
  overdue: number
  /** Depends on a condition, not on a date. */
  conditional: number
  /** How many are conditional — the amount alone does not say 1 or 12. */
  conditionalCount: number
}

export interface EntryTotals {
  /** Revenue already paid. */
  received: number
  /**
   * The part of `received` paid through an InfinitePay link: the SAME rows,
   * the ones with a `paid` charge. The entry's amount (gross, decision 5 of
   * the integration), not what the client paid with interest — so the two
   * numbers never disagree.
   */
  receivedViaInfinitePay: number
  receivedViaInfinitePayCount: number
  /** Expenses, paid or not. */
  expenses: number
  /** Revenue not paid yet — "A receber". */
  receivable: OpenTotals
  /** Expenses not paid yet — "A pagar". */
  payable: OpenTotals
}

function emptyOpenTotals(): OpenTotals {
  return { total: 0, upcoming: 0, overdue: 0, conditional: 0, conditionalCount: 0 }
}

export function summarizeEntries(rows: TotalsRow[], today: string = todayISO()): EntryTotals {
  const totals: EntryTotals = {
    received: 0,
    receivedViaInfinitePay: 0,
    receivedViaInfinitePayCount: 0,
    expenses: 0,
    receivable: emptyOpenTotals(),
    payable: emptyOpenTotals(),
  }

  for (const row of rows) {
    const amount = Number(row.amount)
    if (row.type === 'despesa') totals.expenses += amount

    const situation = getFinancialSituation(row, today)
    if (situation === 'pago') {
      if (row.type === 'receita') {
        totals.received += amount
        if (summarizePaymentCharges(row.payment_charges ?? []).paid) {
          totals.receivedViaInfinitePay += amount
          totals.receivedViaInfinitePayCount += 1
        }
      }
      continue
    }

    const open = row.type === 'receita' ? totals.receivable : totals.payable
    open.total += amount
    switch (situation) {
      case 'a_vencer':
        open.upcoming += amount
        break
      case 'vencido':
        open.overdue += amount
        break
      case 'condicao_especial':
        open.conditional += amount
        open.conditionalCount += 1
        break
    }
  }

  return totals
}

interface AmountCount {
  amount: number
  count: number
}

/** What a period leaves out on one side, so nothing vanishes without notice. */
export interface OutsidePeriod {
  /** Overdue with a due date before the period starts. */
  overdueBefore: AmountCount
  /** Open and with no date at all — conditional with no forecast, which no
   * period contains. */
  undated: AmountCount
}

/**
 * `rows`: the screen's other filters, on every date. Only the side the block
 * shows (`type`) counts, and only what is still open.
 */
export function summarizeOutsidePeriod(
  rows: TotalsRow[],
  range: PeriodRange,
  type: FinancialEntryType,
  today: string = todayISO()
): OutsidePeriod {
  const outside: OutsidePeriod = {
    overdueBefore: { amount: 0, count: 0 },
    undated: { amount: 0, count: 0 },
  }
  if (isAllDates(range)) return outside

  for (const row of rows) {
    if (row.type !== type || row.status === 'pago') continue
    const amount = Number(row.amount)
    const date = getCashFlowDate(row)

    if (date === null) {
      outside.undated.amount += amount
      outside.undated.count += 1
    } else if (
      range.from !== null &&
      date < range.from &&
      getFinancialSituation(row, today) === 'vencido'
    ) {
      outside.overdueBefore.amount += amount
      outside.overdueBefore.count += 1
    }
  }

  return outside
}

// ── Cash flow ────────────────────────────────────────────────────────────────

export interface MonthlyCashFlow {
  /** 'yyyy-MM' */
  month: string
  receita: number
  despesa: number
}

export interface CashFlowResult {
  months: MonthlyCashFlow[]
  /** What fits no month: a conditional entry with no expected date. */
  undated: { receita: number; despesa: number; count: number }
}

export type CashFlowRow = Pick<FinancialEntry, 'type' | 'amount' | 'status' | 'due_date' | 'paid_at'>

/** The last `months` months up to the one of `now`, plus what has no date. */
export function bucketCashFlow(
  rows: CashFlowRow[],
  months: number,
  now: Date = new Date()
): CashFlowResult {
  const buckets = new Map<string, MonthlyCashFlow>()
  for (let index = 0; index < months; index++) {
    const month = toISODate(
      new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 1)
    ).slice(0, 7)
    buckets.set(month, { month, receita: 0, despesa: 0 })
  }

  const undated: CashFlowResult['undated'] = { receita: 0, despesa: 0, count: 0 }

  for (const row of rows) {
    const amount = Number(row.amount)
    // The same date the table filters by — what makes a click on a column
    // show exactly the entries summed in it.
    const reference = getCashFlowDate(row)

    // No "when": its own column instead of vanishing.
    if (reference === null) {
      undated.count += 1
      undated[row.type] += amount
      continue
    }

    const bucket = buckets.get(reference.slice(0, 7))
    if (bucket) bucket[row.type] += amount
  }

  return { months: [...buckets.values()], undated }
}
