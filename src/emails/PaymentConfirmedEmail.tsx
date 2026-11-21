import { Link, Text } from '@react-email/components'
import type { OfficeIdentity } from '@/lib/email/office'
import { ChargeSummary, type ChargeEmailData } from './ChargeSummary'
import { EMAIL_COLORS, EmailLayout, emailMutedText, emailText } from './EmailLayout'

export interface PaymentConfirmedEmailProps {
  office: OfficeIdentity
  greetingName: string | null
  /** `amount` aqui é o valor PAGO — passa do cobrado quando o cliente parcelou
   * no cartão com juros. */
  charge: ChargeEmailData
  /** 'dd/MM/yyyy' — quando a confirmação chegou; a InfinitePay não informa a
   * hora do pagamento. */
  confirmedOn: string
  /** "Pix", "cartão" ou o que a InfinitePay disser. */
  method: string
  /** Só do domínio da InfinitePay (`trustedReceiptUrl`). */
  receiptUrl: string | null
}

export function paymentConfirmedSubject(description: string, office: OfficeIdentity): string {
  return office.name
    ? `Pagamento recebido: ${description} — ${office.name}`
    : `Pagamento recebido: ${description}`
}

/** A confirmação, quando o pagamento deu baixa no lançamento. */
export function PaymentConfirmedEmail({
  office,
  greetingName,
  charge,
  confirmedOn,
  method,
  receiptUrl,
}: PaymentConfirmedEmailProps) {
  return (
    <EmailLayout preview={`Recebemos o seu pagamento de ${charge.amount}.`} office={office}>
      <Text style={emailText}>{greetingName ? `Olá, ${greetingName}!` : 'Olá!'}</Text>
      <Text style={emailText}>
        Recebemos o seu pagamento, confirmado em {confirmedOn}, por {method}. Obrigado!
      </Text>
      <ChargeSummary charge={{ ...charge, dueDate: null }} />
      {receiptUrl && (
        <Text style={emailText}>
          <Link href={receiptUrl} style={{ color: EMAIL_COLORS.accent }}>
            Ver o comprovante
          </Link>
        </Text>
      )}
      <Text style={emailMutedText}>Guarde este e-mail como registro do pagamento.</Text>
    </EmailLayout>
  )
}
