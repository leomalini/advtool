import { Section, Text } from '@react-email/components'
import { EMAIL_COLORS, emailMutedText, emailText } from './EmailLayout'

/** O que o cliente precisa para reconhecer a cobrança antes de abrir: o quê,
 * quanto e até quando — a mesma informação da mensagem do WhatsApp
 * (`buildPaymentMessage`). Valores já formatados por quem chama. */
export interface ChargeEmailData {
  description: string
  /** 'R$ 1.500,00'. */
  amount: string
  /** 'dd/MM/yyyy', ou null quando o lançamento não diz. */
  dueDate: string | null
}

export function ChargeSummary({ charge }: { charge: ChargeEmailData }) {
  return (
    <Section
      style={{
        margin: '0 0 16px',
        padding: '16px',
        border: `1px solid ${EMAIL_COLORS.border}`,
        borderRadius: '8px',
      }}
    >
      <Text style={{ ...emailText, margin: 0, fontWeight: 600 }}>{charge.description}</Text>
      <Text style={{ ...emailText, margin: '4px 0 0', fontSize: '20px', fontWeight: 600 }}>
        {charge.amount}
      </Text>
      {charge.dueDate && (
        <Text style={{ ...emailMutedText, margin: '2px 0 0' }}>Vencimento: {charge.dueDate}</Text>
      )}
    </Section>
  )
}
