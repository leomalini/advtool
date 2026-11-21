import type { ReactNode } from 'react'
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { OfficeIdentity } from '@/lib/email/office'

/**
 * A moldura de todo e-mail ao cliente: o nome do escritório no topo, o
 * conteúdo num cartão e o rodapé com o contato.
 *
 * Estilos inline e cores fixas, de propósito: cliente de e-mail não lê CSS
 * variável nem classe do Tailwind, e o Outlook ignora quase todo o resto. A
 * paleta é a "Graphite" do app (`globals.css`) traduzida em hexadecimal:
 * cinzas neutros e o índigo #5165f0 só no botão.
 */

export const EMAIL_COLORS = {
  page: '#f4f4f5',
  card: '#ffffff',
  border: '#e4e4e7',
  text: '#18181b',
  muted: '#52525b',
  subtle: '#71717a',
  accent: '#5165f0',
  accentText: '#ffffff',
} as const

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

export const emailText = {
  margin: '0 0 16px',
  fontSize: '15px',
  lineHeight: '24px',
  color: EMAIL_COLORS.text,
} as const

export const emailMutedText = {
  ...emailText,
  fontSize: '13px',
  lineHeight: '20px',
  color: EMAIL_COLORS.muted,
} as const

interface EmailLayoutProps {
  /** O texto que a caixa de entrada mostra ao lado do assunto. */
  preview: string
  office: OfficeIdentity
  children: ReactNode
}

export function EmailLayout({ preview, office, children }: EmailLayoutProps) {
  const contact = [office.phone, office.email].filter(Boolean).join(' · ')

  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          padding: '32px 16px',
          backgroundColor: EMAIL_COLORS.page,
          fontFamily: FONT_STACK,
        }}
      >
        <Container style={{ maxWidth: '560px', margin: '0 auto' }}>
          <Text
            style={{
              margin: '0 0 16px',
              fontSize: '16px',
              fontWeight: 600,
              color: EMAIL_COLORS.text,
            }}
          >
            {office.name ?? 'Escritório de advocacia'}
          </Text>

          <Section
            style={{
              backgroundColor: EMAIL_COLORS.card,
              border: `1px solid ${EMAIL_COLORS.border}`,
              borderRadius: '12px',
              padding: '32px',
            }}
          >
            {children}
          </Section>

          <Section style={{ padding: '24px 8px 0' }}>
            {office.name && (
              <Text style={{ ...emailMutedText, margin: '0 0 4px', fontWeight: 600 }}>
                {office.name}
                {office.oabRegistration ? ` · OAB ${office.oabRegistration}` : ''}
              </Text>
            )}
            {office.addressLine && (
              <Text style={{ ...emailMutedText, margin: '0 0 4px' }}>{office.addressLine}</Text>
            )}
            {contact && <Text style={{ ...emailMutedText, margin: '0 0 4px' }}>{contact}</Text>}
            <Hr style={{ borderColor: EMAIL_COLORS.border, margin: '16px 0' }} />
            <Text style={{ ...emailMutedText, color: EMAIL_COLORS.subtle, margin: 0 }}>
              {office.email
                ? 'Mensagem enviada pelo sistema do escritório. Para falar conosco, basta responder a este e-mail.'
                : 'Mensagem enviada pelo sistema do escritório. Para falar conosco, use o contato acima.'}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
