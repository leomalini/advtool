/**
 * O texto de cada aviso da régua — puro, igual na fila e, na fase 5, no envio
 * automático. Os modelos são os do plano ("Mensagens"): o escritório revisa
 * antes de a fase 5 levá-los para aprovação na Meta.
 *
 * Só leva o que o cliente já vê na página: a descrição para o cliente, o valor
 * e o vencimento. Nunca a descrição interna, o processo ou o CNJ.
 */
import { formatCurrency } from '@/types/financialEntry.types'
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

  if (offset === null || !input.dueDate) {
    const who = input.officeName ? `${input.officeName} registrou` : 'Registramos'
    const due = input.dueDate ? `, com vencimento em ${day(input.dueDate)}` : ''
    return `${hello} ${who} a cobrança de ${input.description}, no valor de ${value}${due}. ${pay}`
  }
  if (offset < 0) {
    return (
      `${hello} Lembrete: ${input.description}, de ${value}, vence em ${day(input.dueDate)}. ` +
      pay
    )
  }
  if (offset === 0) {
    return `${hello} ${input.description}, de ${value}, vence hoje. ${pay}`
  }
  const questions = input.officePhone ? ` Dúvidas: ${input.officePhone}` : ''
  return (
    `${hello} ${input.description}, de ${value}, venceu em ${day(input.dueDate)}. ` +
    `Se já pagou, desconsidere esta mensagem. ${pay}${questions}`
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
