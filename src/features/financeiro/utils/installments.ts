/**
 * Monthly installments — the contract preview's and the success fee's when it
 * is assessed in installments. One division for both, so they cannot drift.
 */

/** 'yyyy-MM-dd' plus `months`, without going through a time zone. A day the
 * target month lacks becomes its last: 31/01 + 1 month = 28/02. */
export function addMonthsISO(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target.toISOString().slice(0, 10)
}

export interface Installment {
  amount: number
  /** 'yyyy-MM-dd' */
  due_date: string
}

/** `total` in `count` monthly installments from `firstDueDate`. The cents the
 * division leaves go to the last one, so the installments add up exactly. */
export function splitInstallments(
  total: number,
  count: number,
  firstDueDate: string
): Installment[] {
  const totalCents = Math.round(total * 100)
  const safeCount = Math.max(1, Math.floor(count))
  const baseCents = Math.floor(totalCents / safeCount)
  return Array.from({ length: safeCount }, (_, index) => ({
    amount:
      (index === safeCount - 1 ? totalCents - baseCents * (safeCount - 1) : baseCents) / 100,
    due_date: addMonthsISO(firstDueDate, index),
  }))
}
