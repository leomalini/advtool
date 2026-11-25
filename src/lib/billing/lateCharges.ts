import { businessDayOnOrAfter } from '@/lib/prazos'

/**
 * O valor de uma cobrança num dia: principal, multa e juros depois do
 * vencimento, e o desconto no Pix até ele (fase 3 de docs/cobrancas.md,
 * migration 97). Puro e em centavos inteiros: a página, o link, o painel e a
 * mensagem usam a mesma conta.
 *
 * As regras do plano:
 *
 *   · vencimento em dia sem expediente (fim de semana, feriado nacional) não
 *     gera encargo até o próximo dia útil — feriados locais não entram, e o
 *     recesso forense não vale para pagamento;
 *   · passada essa folga, a multa entra uma vez e os juros correm por dia
 *     corrido desde o vencimento, simples, 1/30 do percentual mensal por dia;
 *   · o desconto no Pix vale enquanto não há encargo, e nunca junto com ele;
 *   · cada parcela é arredondada para o centavo mais próximo.
 */

export interface BillingTerms {
  /** % do principal, uma vez. Null ou 0 = sem multa. */
  lateFeePercent: number | null
  /** % ao mês, simples. Null ou 0 = sem juros. */
  monthlyInterestPercent: number | null
  /** % de desconto no Pix até o vencimento. Null = sem desconto. */
  pixDiscountPercent: number | null
}

export const NO_TERMS: BillingTerms = {
  lateFeePercent: null,
  monthlyInterestPercent: null,
  pixDiscountPercent: null,
}

export interface AmountOnDay {
  principalCents: number
  lateFeeCents: number
  interestCents: number
  /** O preço do link: principal + multa + juros. */
  totalCents: number
  /** Dias corridos desde o vencimento, quando já há encargo; 0 antes. */
  daysLate: number
  /** Último dia sem encargo ('yyyy-MM-dd'): o vencimento, ou o dia útil
   * seguinte. Null sem vencimento. */
  graceUntil: string | null
  /** O desconto do Pix que vale hoje, com o valor que o cliente paga nele. */
  pixDiscount: { percent: number; cents: number } | null
}

const DAY_MS = 86_400_000

function dayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / DAY_MS
}

/** Percentual com duas casas em centésimos inteiros (2,5% → 250). */
function hundredths(percent: number | null): number {
  if (percent === null || !Number.isFinite(percent) || percent <= 0) return 0
  return Math.round(percent * 100)
}

/** O valor do Pix com o desconto, como a InfinitePay deve cobrar. */
export function pixDiscountedCents(totalCents: number, percent: number): number {
  return Math.round((totalCents * (10_000 - hundredths(percent))) / 10_000)
}

export function amountOnDay(input: {
  principalCents: number
  /** Vencimento 'yyyy-MM-dd'; null em lançamento sem data (condição). */
  dueDate: string | null
  /** Hoje em Brasília, 'yyyy-MM-dd'. */
  today: string
  terms: BillingTerms
}): AmountOnDay {
  const { principalCents, dueDate, today, terms } = input
  const plain: AmountOnDay = {
    principalCents,
    lateFeeCents: 0,
    interestCents: 0,
    totalCents: principalCents,
    daysLate: 0,
    graceUntil: null,
    pixDiscount: null,
  }
  if (!dueDate) return plain

  const graceUntil = businessDayOnOrAfter(dueDate, { ignoreRecess: true })
  const late = today > graceUntil

  if (!late) {
    const discount = hundredths(terms.pixDiscountPercent)
    return {
      ...plain,
      graceUntil,
      pixDiscount:
        discount > 0 && discount < 10_000
          ? {
              percent: discount / 100,
              cents: pixDiscountedCents(principalCents, discount / 100),
            }
          : null,
    }
  }

  const daysLate = dayNumber(today) - dayNumber(dueDate)
  const lateFeeCents = Math.round((principalCents * hundredths(terms.lateFeePercent)) / 10_000)
  const interestCents = Math.round(
    (principalCents * hundredths(terms.monthlyInterestPercent) * daysLate) / (10_000 * 30),
  )
  return {
    principalCents,
    lateFeeCents,
    interestCents,
    totalCents: principalCents + lateFeeCents + interestCents,
    daysLate,
    graceUntil,
    pixDiscount: null,
  }
}

/** Há multa ou juros previstos? (Sem eles, o atraso não muda o valor.) */
export function hasLateCharges(terms: BillingTerms): boolean {
  return hundredths(terms.lateFeePercent) > 0 || hundredths(terms.monthlyInterestPercent) > 0
}

/**
 * O pagamento por Pix com desconto confere com o link? O `payment_check`
 * devolve `amount` cheio e `paid_amount` com o desconto (medido em
 * 2026-11-23). A InfinitePay não documenta o arredondamento: 1 centavo de
 * folga para cada lado.
 */
export function isDiscountedPixPayment(input: {
  linkCents: number
  paidCents: number
  captureMethod: string | null
  pixDiscountPercent: number | null
}): boolean {
  if (input.captureMethod !== 'pix' || input.pixDiscountPercent === null) return false
  const expected = pixDiscountedCents(input.linkCents, input.pixDiscountPercent)
  return Math.abs(input.paidCents - expected) <= 1 && input.paidCents < input.linkCents
}
