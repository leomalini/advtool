import { Text } from '@react-email/components'
import type { OfficeIdentity } from '@/lib/email/office'
import { EmailLayout, emailMutedText, emailText } from './EmailLayout'

export interface TestEmailProps {
  office: OfficeIdentity
  requestedBy: string | null
  fromAddress: string
}

export const TEST_EMAIL_SUBJECT = 'E-mail de teste do AdvTool'

/** O e-mail que Configurações → E-mail manda para quem clicou. Mostra o que o
 * cliente veria de remetente e de resposta, com a mesma moldura. */
export function TestEmail({ office, requestedBy, fromAddress }: TestEmailProps) {
  return (
    <EmailLayout preview="Se este e-mail chegou, o envio está funcionando." office={office}>
      <Text style={emailText}>{requestedBy ? `Olá, ${requestedBy}!` : 'Olá!'}</Text>
      <Text style={emailText}>
        Este é um e-mail de teste. Se ele chegou, o AdvTool consegue mandar e-mails aos clientes.
      </Text>
      <Text style={{ ...emailMutedText, margin: '0 0 4px' }}>Remetente: {fromAddress}</Text>
      <Text style={{ ...emailMutedText, margin: 0 }}>
        Respostas vão para: {office.email ?? 'ninguém — cadastre o e-mail do escritório em Configurações → Geral'}
      </Text>
    </EmailLayout>
  )
}
