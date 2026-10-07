import { formatCurrency } from '@/types/financialEntry.types'

/**
 * A mensagem que acompanha o link no WhatsApp. Curta e com o que o cliente
 * precisa para reconhecer a cobrança antes de abrir: o quê e quanto.
 */
export function buildPaymentMessage(input: {
  /** Nome para a saudação; pessoa física vai pelo primeiro nome. */
  greetingName: string | null
  description: string
  amount: number
  url: string
}): string {
  const greeting = input.greetingName ? `Olá, ${input.greetingName}!` : 'Olá!'
  return (
    `${greeting} Segue o link para o pagamento de "${input.description}", ` +
    `no valor de ${formatCurrency(input.amount)}:\n${input.url}`
  )
}

/**
 * `wa.me` com a mensagem pronta. Sem telefone válido, abre o WhatsApp para
 * escolher o contato — a mensagem vai do mesmo jeito.
 *
 * `phoneE164` no formato `+5511987654321`; o `wa.me` quer só os dígitos.
 */
export function buildWhatsAppUrl(phoneE164: string | null, text: string): string {
  const target = phoneE164 ? phoneE164.replace(/\D/g, '') : ''
  return `https://wa.me/${target}?text=${encodeURIComponent(text)}`
}
