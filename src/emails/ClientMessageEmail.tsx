import { Fragment } from 'react'
import { Hr, Text } from '@react-email/components'
import type { OfficeIdentity } from '@/lib/email/office'
import { EMAIL_COLORS, EmailLayout, emailMutedText, emailText } from './EmailLayout'

/** Quem assina — a conta de quem mandou, não o escritório genérico. */
export interface MessageSignature {
  name: string
  /** 'OAB/ES 12345' — o formato da tela de Publicações —, quando o perfil tem. */
  oab: string | null
}

export interface ClientMessageEmailProps {
  office: OfficeIdentity
  /** Texto puro, como foi digitado. */
  body: string
  signature: MessageSignature
}

/** Parágrafos separados por linha em branco; dentro deles, cada quebra vira
 * `<br>`. O texto passa pelo React, que escapa tudo — HTML digitado aparece
 * como texto, nunca como marcação. */
function paragraphs(body: string): string[][] {
  return body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.split('\n'))
    .filter((lines) => lines.some((line) => line.trim() !== ''))
}

/** A mensagem que alguém do escritório escreveu, na moldura de sempre e com a
 * assinatura de quem mandou. */
export function ClientMessageEmail({ office, body, signature }: ClientMessageEmailProps) {
  const blocks = paragraphs(body)
  const preview = body.replace(/\s+/g, ' ').trim().slice(0, 120)

  return (
    <EmailLayout preview={preview} office={office}>
      {blocks.map((lines, index) => (
        <Text key={index} style={emailText}>
          {lines.map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 && <br />}
              {line}
            </Fragment>
          ))}
        </Text>
      ))}

      <Hr style={{ borderColor: EMAIL_COLORS.border, margin: '24px 0 16px' }} />
      <Text style={{ ...emailText, margin: 0, fontWeight: 600 }}>{signature.name}</Text>
      {signature.oab && (
        <Text style={{ ...emailMutedText, margin: '2px 0 0' }}>{signature.oab}</Text>
      )}
      {office.name && (
        <Text style={{ ...emailMutedText, margin: '2px 0 0' }}>{office.name}</Text>
      )}
    </EmailLayout>
  )
}
