import { Text } from '@react-email/components'
import type { OfficeIdentity } from '@/lib/email/office'
import { ChargeSummary, type ChargeEmailData } from './ChargeSummary'
import { EmailButton, EmailLayout, emailMutedText, emailText } from './EmailLayout'

/** Antes do vencimento ou depois dele (docs/emails-clientes.md, "Cobrança"). */
export type PaymentReminderMoment = 'before_due' | 'overdue'

export interface PaymentReminderEmailProps {
  office: OfficeIdentity
  greetingName: string | null
  charge: ChargeEmailData
  checkoutUrl: string
  moment: PaymentReminderMoment
}

export function paymentReminderSubject(
  moment: PaymentReminderMoment,
  charge: ChargeEmailData,
  office: OfficeIdentity,
): string {
  const head =
    moment === 'before_due'
      ? `Lembrete de pagamento: ${charge.description}`
      : `Pagamento em aberto: ${charge.description}`
  return office.name ? `${head} — ${office.name}` : head
}

/**
 * O lembrete. Tom de aviso, não de cobrança: o pagamento pode ter sido feito
 * por outro meio, e o e-mail diz como desconsiderar.
 */
export function PaymentReminderEmail({
  office,
  greetingName,
  charge,
  checkoutUrl,
  moment,
}: PaymentReminderEmailProps) {
  const lead =
    moment === 'before_due'
      ? charge.dueDate
        ? `Lembramos que o pagamento abaixo vence em ${charge.dueDate}.`
        : 'Lembramos do pagamento abaixo.'
      : charge.dueDate
        ? `Consta em aberto o pagamento abaixo, com vencimento em ${charge.dueDate}.`
        : 'Consta em aberto o pagamento abaixo.'

  return (
    <EmailLayout preview={`${charge.description} — ${charge.amount}`} office={office}>
      <Text style={emailText}>{greetingName ? `Olá, ${greetingName}!` : 'Olá!'}</Text>
      <Text style={emailText}>{lead}</Text>
      <ChargeSummary charge={charge} />
      <EmailButton href={checkoutUrl}>Pagar</EmailButton>
      <Text style={emailMutedText}>
        Se você já pagou, desconsidere esta mensagem. Qualquer dúvida, é só responder a este e-mail
        ou falar com o escritório.
      </Text>
    </EmailLayout>
  )
}
