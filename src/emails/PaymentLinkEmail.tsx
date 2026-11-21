import { Link, Text } from '@react-email/components'
import type { OfficeIdentity } from '@/lib/email/office'
import { ChargeSummary, type ChargeEmailData } from './ChargeSummary'
import { EMAIL_COLORS, EmailButton, EmailLayout, emailMutedText, emailText } from './EmailLayout'

export interface PaymentLinkEmailProps {
  office: OfficeIdentity
  greetingName: string | null
  charge: ChargeEmailData
  checkoutUrl: string
}

export function paymentLinkSubject(description: string, office: OfficeIdentity): string {
  return office.name
    ? `Link para pagamento: ${description} — ${office.name}`
    : `Link para pagamento: ${description}`
}

/**
 * O link de pagamento da InfinitePay por e-mail — o mesmo que o botão do
 * WhatsApp manda. Ao enviar por aqui, o cliente passa a receber também o
 * lembrete e a confirmação (docs/emails-clientes.md, "Cobrança").
 */
export function PaymentLinkEmail({ office, greetingName, charge, checkoutUrl }: PaymentLinkEmailProps) {
  return (
    <EmailLayout preview={`${charge.description} — ${charge.amount}`} office={office}>
      <Text style={emailText}>{greetingName ? `Olá, ${greetingName}!` : 'Olá!'}</Text>
      <Text style={emailText}>Segue o link para o pagamento:</Text>
      <ChargeSummary charge={charge} />
      <EmailButton href={checkoutUrl}>Pagar</EmailButton>
      <Text style={emailMutedText}>
        O pagamento é feito na página segura da InfinitePay. A confirmação chega por e-mail assim
        que ele for identificado.
      </Text>
      <Text style={{ ...emailMutedText, margin: '16px 0 4px' }}>
        Se o botão não abrir, copie este endereço no navegador:
      </Text>
      <Text style={{ ...emailMutedText, margin: 0, wordBreak: 'break-all' }}>
        <Link href={checkoutUrl} style={{ color: EMAIL_COLORS.accent }}>
          {checkoutUrl}
        </Link>
      </Text>
    </EmailLayout>
  )
}
