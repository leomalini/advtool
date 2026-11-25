/**
 * O texto de cada aviso da régua — puro, igual na fila e, na fase 5, no envio
 * automático. Os modelos são os do plano ("Mensagens"): o escritório revisa
 * antes de a fase 5 levá-los para aprovação na Meta.
 *
 * Só leva o que o cliente já vê na página: a descrição para o cliente, o valor
 * e o vencimento. Nunca a descrição interna, o processo ou o CNJ.
 */
import { formatCurrency } from '@/types/financialEntry.types'
import type { AmountOnDay } from './lateCharges'
import { offsetOfStep } from './schedule'

export interface ReminderMessageInput {
  /** A etapa do texto ('created', 'd-7', 'd0', 'd+2'). */
  step: string
  /** Pessoa pelo primeiro nome; empresa pelo nome da tela. */
  greetingName: string | null
  officeName: string | null
  officePhone: string | null
  /** A descrição que o cliente vê (`billings.client_description`). */
  description: string
  amount: number
  dueDate: string | null
  url: string
  /** Valor de hoje com multa e juros, quando passa do original (migration 97). */
  updatedAmount?: number | null
  /** Quanto fica no Pix com o desconto até o vencimento. */
  pixAmount?: number | null
}

/** Os campos de valor da mensagem a partir do valor do dia da cobrança. */
export function amountFieldsFor(today: AmountOnDay): {
  updatedAmount: number | null
  pixAmount: number | null
} {
  return {
    updatedAmount: today.totalCents > today.principalCents ? today.totalCents / 100 : null,
    pixAmount: today.pixDiscount ? today.pixDiscount.cents / 100 : null,
  }
}

function day(isoDate: string): string {
  const [year, month, dayOfMonth] = isoDate.split('-')
  return `${dayOfMonth}/${month}/${year}`
}

export function buildReminderMessage(input: ReminderMessageInput): string {
  const hello = input.greetingName ? `Olá, ${input.greetingName}!` : 'Olá!'
  const value = formatCurrency(input.amount)
  const pay = `Para pagar: ${input.url}`
  const offset = offsetOfStep(input.step)
  // Só antes de vencer: depois, a página já não oferece o desconto.
  const pix =
    input.pixAmount && (offset === null || offset <= 0)
      ? ` No Pix, até o vencimento: ${formatCurrency(input.pixAmount)}.`
      : ''

  if (offset === null || !input.dueDate) {
    const who = input.officeName ? `${input.officeName} registrou` : 'Registramos'
    const due = input.dueDate ? `, com vencimento em ${day(input.dueDate)}` : ''
    return (
      `${hello} ${who} a cobrança de ${input.description}, no valor de ${value}${due}.${pix} ` +
      pay
    )
  }
  if (offset < 0) {
    return (
      `${hello} Lembrete: ${input.description}, de ${value}, vence em ${day(input.dueDate)}.` +
      `${pix} ${pay}`
    )
  }
  if (offset === 0) {
    return `${hello} ${input.description}, de ${value}, vence hoje.${pix} ${pay}`
  }
  const questions = input.officePhone ? ` Dúvidas: ${input.officePhone}` : ''
  const updated = input.updatedAmount
    ? ` Com multa e juros, hoje fica ${formatCurrency(input.updatedAmount)}.`
    : ''
  const payUpdated = input.updatedAmount ? `Para pagar com o valor atualizado: ${input.url}` : pay
  return (
    `${hello} ${input.description}, de ${value}, venceu em ${day(input.dueDate)}.${updated} ` +
    `Se já pagou, desconsidere esta mensagem. ${payUpdated}${questions}`
  )
}

/** O primeiro nome de uma pessoa; o nome inteiro de uma empresa. */
export function greetingNameFor(
  client: { type: 'individual' | 'company'; displayName: string | null } | null,
): string | null {
  if (!client?.displayName) return null
  return client.type === 'individual'
    ? client.displayName.trim().split(/\s+/)[0] || null
    : client.displayName
}
