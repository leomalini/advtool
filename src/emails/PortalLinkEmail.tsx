import { Link, Text } from '@react-email/components'
import type { OfficeIdentity } from '@/lib/email/office'
import { EMAIL_COLORS, EmailButton, EmailLayout, emailMutedText, emailText } from './EmailLayout'

export interface PortalLinkEmailProps {
  office: OfficeIdentity
  /** Primeiro nome (pessoa) ou nome da empresa; null escreve só "Olá". */
  greetingName: string | null
  /** O que o cliente digita para entrar — o portal pede o documento. */
  documentLabel: 'CPF' | 'CNPJ'
  portalUrl: string
}

export function portalLinkSubject(office: OfficeIdentity): string {
  return office.name
    ? `Acompanhe seus processos — ${office.name}`
    : 'Acompanhe seus processos'
}

/**
 * O link de acompanhamento (`/acompanhar/<token>`) por e-mail.
 *
 * O e-mail não diz nada sobre os processos: quem entra confirma o documento
 * (`docs/portal-cliente.md`, segunda camada), e o e-mail pode ser encaminhado.
 * Por isso o aviso de que o link é pessoal.
 */
export function PortalLinkEmail({
  office,
  greetingName,
  documentLabel,
  portalUrl,
}: PortalLinkEmailProps) {
  const officeName = office.name ?? 'O escritório'

  return (
    <EmailLayout preview="Seu link para acompanhar os processos" office={office}>
      <Text style={emailText}>{greetingName ? `Olá, ${greetingName}!` : 'Olá!'}</Text>
      <Text style={emailText}>
        {officeName} preparou uma página para você acompanhar o andamento dos seus processos, a
        qualquer momento.
      </Text>

      <EmailButton href={portalUrl}>Acompanhar meus processos</EmailButton>

      <Text style={emailText}>
        Para entrar, confirme o seu {documentLabel}. O link é pessoal: não o encaminhe.
      </Text>
      <Text style={emailText}>
        Processos novos aparecem nesta mesma página — não é preciso guardar outro link.
      </Text>

      <Text style={{ ...emailMutedText, margin: '24px 0 4px' }}>
        Se o botão não abrir, copie este endereço no navegador:
      </Text>
      <Text style={{ ...emailMutedText, margin: 0, wordBreak: 'break-all' }}>
        <Link href={portalUrl} style={{ color: EMAIL_COLORS.accent }}>
          {portalUrl}
        </Link>
      </Text>
    </EmailLayout>
  )
}
